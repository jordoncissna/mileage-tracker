// Sync + duplicate-hygiene tests. These drive the real loadFromSupabase /
// saveToSupabase against a recording Supabase stub, because the duplicate rows
// users saw came from the sync path, not from addTrip. Run: node sync.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const vc = new VirtualConsole(); // jsdom's CSS parser noise would bury real failures
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc, url: 'https://jordoncissna.github.io/mileage-tracker/' });
const { window } = dom;
const { document } = window;

// ---- recording Supabase stub: server rows live in `server` ----
const server = { rows: [], inserts: 0, deletes: 0, nextId: 1, delay: 0, prefs: null, prefsReads: 0, prefsWrites: 0, prefsMissing: false, plan: null, planInserts: 0, planMissing: false };
const wait = ms => new Promise(r => setTimeout(r, ms));
function reset() { server.rows = []; server.inserts = 0; server.deletes = 0; server.nextId = 1; server.delay = 0; server.prefs = null; server.prefsReads = 0; server.prefsWrites = 0; server.prefsMissing = false; server.plan = null; server.planInserts = 0; server.planMissing = false; }
function rowFrom(r) { return Object.assign({}, r, { id: 'srv-' + (server.nextId++) }); }
// user_prefs: one row per user, or a "table missing" error when prefsMissing
const prefsTable = {
  select: () => ({
    eq: () => ({
      maybeSingle: async () => {
        if (server.prefsMissing) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.user_prefs' in the schema cache" } };
        server.prefsReads++;
        return { data: server.prefs, error: null };
      }
    })
  }),
  upsert: async (row) => {
    if (server.prefsMissing) return { error: { code: 'PGRST205', message: "Could not find the table 'public.user_prefs' in the schema cache" } };
    server.prefsWrites++;
    server.prefs = JSON.parse(JSON.stringify(row));
    return { error: null };
  }
};
// user_plan: one row per user, or "table missing" when planMissing
const planTable = {
  select: () => ({ eq: () => ({ maybeSingle: async () => {
    if (server.planMissing) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.user_plan' in the schema cache" } };
    return { data: server.plan, error: null };
  } }) }),
  insert: async (row) => {
    if (server.planMissing) return { error: { code: 'PGRST205', message: "Could not find the table 'public.user_plan' in the schema cache" } };
    server.planInserts++; server.plan = JSON.parse(JSON.stringify(row));
    return { error: null };
  }
};
const table = {
  select: () => ({
    order: async () => { await wait(server.delay); return { data: server.rows.slice(), error: null }; },
    eq: () => ({ order: async () => ({ data: server.rows.slice(), error: null }) })
  }),
  insert: (payload) => {
    const run = async () => {
      await wait(server.delay);
      const list = Array.isArray(payload) ? payload : [payload];
      const made = list.map(r => { server.inserts++; const row = rowFrom(r); server.rows.push(row); return row; });
      return { data: Array.isArray(payload) ? made : made[0], error: null };
    };
    const p = run();
    p.select = () => { const q = p.then(r => r); q.single = () => p.then(r => ({ data: Array.isArray(r.data) ? r.data[0] : r.data, error: null })); return q; };
    return p;
  },
  update: () => ({ eq: async () => ({ error: null }) }),
  delete: () => ({ eq: async (col, id) => { server.deletes++; server.rows = server.rows.filter(r => r.id !== id); return { error: null }; } })
};
window.google = { maps: { places: { Autocomplete: function () { return { addListener() {}, getPlace() { return {}; } }; }, AutocompleteService: function () { this.getPlacePredictions = () => {}; } }, Geocoder: function () { this.geocode = () => {}; }, Map: function () { this.addListener = () => {}; this.getCenter = () => ({ lat: () => 41, lng: () => -112 }); this.getZoom = () => 10; this.setOptions = () => {}; this.setCenter = () => {}; this.fitBounds = () => {}; }, Marker: function () {}, DirectionsService: function () { this.route = () => {}; }, DirectionsRenderer: function () { this.setMap = () => {}; }, LatLngBounds: function () { this.extend = () => {}; }, geometry: { spherical: { computeDistanceBetween: () => 1609 } }, event: { addListenerOnce: () => {} }, importLibrary: () => Promise.resolve({}) } };
window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithPassword: async () => ({}), signUp: async () => ({}), signOut: async () => ({}) }, from: (name) => (name === 'user_prefs' ? prefsTable : name === 'user_plan' ? planTable : table) }) };
window.QRCode = function () {};
window.initGoogleMaps = window.initGoogleMaps || function () {};
window.alert = () => {};
let confirmAnswer = true;
window.confirm = () => confirmAnswer;

const store = {};
window.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; } };

const inline = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/^<script>/, '').replace(/<\/script>$/, '');
const exports_ = `
;window.__trips=()=>trips;
;window.__setTrips=v=>{trips=v;};
;window.__setUser=u=>{currentUser=u;};
;window.__load=loadFromSupabase;
;window.__save=saveToSupabase;
;window.__saveBatch=saveBatchToSupabase;
;window.__fp=tripFingerprint;
;window.__dupGroups=dupGroups;
;window.__dupCount=dupCount;
;window.__persisted=()=>localStorage.getItem(TK);
;window.__renderH=renderH;
;window.__cfg=()=>cfg;
;window.__setCfg=v=>{cfg=v;};
;window.__loadPrefs=loadPrefsFromSupabase;
;window.__savePrefs=savePrefsToSupabase;
;window.__persistCfg=persistCfg;
;window.__prefsSync=()=>prefsSync;
;window.__loadPlan=loadPlanFromSupabase;
;window.__plan=()=>userPlan;
;window.__can=can;
;window.__inviteLink=buildInviteLink;
;window.__newCode=newReferralCode;
`;
const runner = new window.Function(inline + exports_);
try { runner.call(window); } catch (e) { console.log('init threw (often benign):', e.message); }

let pass = 0, fail = 0;
const T = (n, c) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };
const $ = id => document.getElementById(id);
const trip = o => Object.assign({ id: Date.now() + Math.random(), date: '2026-08-12', miles: 81.2, from: '1113 S 4090 W, Syracuse, UT', to: '456 Business Ave, Lehi, UT', purpose: 'LFG Week', category: 'Client Meeting' }, o);

(async function () {
  window.__setUser({ id: 'u1' });

  // ===== CONCURRENT LOADS DON'T DOUBLE-INSERT =====
  // Two loads overlapping (sign-in + back-online, or SIGNED_IN fired twice) used
  // to each re-push the same unsynced trip, minting a duplicate server row.
  reset(); server.delay = 20;
  window.__setTrips([trip({ id: 1 })]);
  await Promise.all([window.__load(), window.__load()]);
  await wait(60);
  T('concurrent loads insert the unsynced trip once', server.inserts === 1);
  T('concurrent loads leave one server row', server.rows.length === 1);
  T('local ledger holds one copy', window.__trips().length === 1);
  T('local trip carries its server id', !!window.__trips()[0].supaId);

  // ===== REPEATED LOADS ARE IDEMPOTENT =====
  reset(); server.delay = 0;
  window.__setTrips([trip({ id: 2 })]);
  await window.__load(); await wait(10);
  await window.__load(); await wait(10);
  await window.__load(); await wait(10);
  T('three sequential loads insert once', server.inserts === 1);
  T('three sequential loads keep one row', window.__trips().length === 1);

  // ===== ADOPTION: LOCAL TRIP ALREADY ON THE SERVER =====
  // The trip exists server-side but the local copy never learned its id (insert
  // response lost, tab closed mid-save). It must adopt the row, not re-insert.
  reset();
  server.rows.push({ id: 'srv-existing', user_id: 'u1', date: '2026-08-12', miles: 81.2, from_addr: '1113 S 4090 W, Syracuse, UT', to_addr: '456 Business Ave, Lehi, UT', purpose: 'LFG Week', category: 'Client Meeting' });
  window.__setTrips([trip({ id: 3, supaId: null })]);
  await window.__load(); await wait(10);
  T('matching server row is adopted, not duplicated', server.inserts === 0);
  T('adoption leaves one ledger row', window.__trips().length === 1);
  T('adopted trip points at the server row', window.__trips()[0].supaId === 'srv-existing');

  // ===== TWO LOCAL COPIES, ONE SERVER ROW =====
  // Only one local copy may claim the row; the other is a genuinely new trip.
  reset();
  server.rows.push({ id: 'srv-a', user_id: 'u1', date: '2026-08-12', miles: 81.2, from_addr: '1113 S 4090 W, Syracuse, UT', to_addr: '456 Business Ave, Lehi, UT', purpose: 'LFG Week', category: 'Client Meeting' });
  window.__setTrips([trip({ id: 4 }), trip({ id: 5 })]);
  await window.__load(); await wait(10);
  T('second identical copy is inserted once', server.inserts === 1);
  T('two copies survive as two rows', window.__trips().length === 2);

  // ===== A DIFFERENT TRIP IS STILL PUSHED =====
  reset();
  server.rows.push({ id: 'srv-b', user_id: 'u1', date: '2026-08-12', miles: 81.2, from_addr: 'A', to_addr: 'B', purpose: 'x', category: 'Client Meeting' });
  window.__setTrips([trip({ id: 6, miles: 162.4, purpose: 'Sales Meeting (round trip)' })]);
  await window.__load(); await wait(10);
  T('a genuinely new trip is pushed', server.inserts === 1);
  T('server holds both rows', server.rows.length === 2);

  // ===== SAVE STAMPS THE ID EVEN IF THE ARRAY IS SWAPPED =====
  // A refresh replacing `trips` mid-insert used to strand the trip without a
  // supaId, so every later load re-pushed it — an unbounded duplicate source.
  reset(); server.delay = 20;
  const orphan = trip({ id: 7 });
  window.__setTrips([orphan]);
  const p = window.__save(orphan);
  window.__setTrips([]); // simulate loadFromSupabase swapping the array
  await p;
  T('save stamps supaId on the trip object itself', !!orphan.supaId);

  // ===== IN-FLIGHT MARKER NEVER PERSISTS =====
  reset(); server.delay = 30;
  const inflight = trip({ id: 8 });
  window.__setTrips([inflight]);
  const p2 = window.__save(inflight);
  T('_saving is set while the insert is in flight', inflight._saving === true);
  T('_saving is stripped from localStorage', (window.__persisted() || '').indexOf('_saving') < 0);
  await p2;
  T('_saving cleared after the insert', inflight._saving === undefined);

  // ===== FINGERPRINT =====
  T('fingerprint ignores id', window.__fp(trip({ id: 9 })) === window.__fp(trip({ id: 10 })));
  T('fingerprint is case/space insensitive on addresses', window.__fp(trip({ from: '  1113 S 4090 W, SYRACUSE, UT ' })) === window.__fp(trip({})));
  T('fingerprint separates different miles', window.__fp(trip({ miles: 162.4 })) !== window.__fp(trip({})));

  // ===== DUPLICATE REVIEW =====
  // The shape the owner actually hit: one route logged three times on one day
  // with different miles/purposes, plus a truly identical pair on another day.
  server.delay = 0;
  window.__setUser(null);
  window.__setTrips([
    trip({ id: 20, date: '2026-08-13', miles: 81.2, purpose: 'LFG Week - OnSite' }),
    trip({ id: 21, date: '2026-08-13', miles: 162.3, purpose: 'LFG Week (round trip)' }),
    trip({ id: 22, date: '2026-08-13', miles: 162.3, purpose: 'Sales Meeting (round trip)' }),
    trip({ id: 23, date: '2026-08-11', miles: 81.2, purpose: 'same' }),
    trip({ id: 24, date: '2026-08-11', miles: 81.2, purpose: 'same' }),
    trip({ id: 25, date: '2026-08-10', miles: 40, to: 'Somewhere Else, UT', purpose: 'solo' })
  ]);
  const groups = window.__dupGroups();
  T('groups only repeated date+route', groups.length === 2);
  T('extras counted, not whole groups', window.__dupCount() === 3);
  T('identical pair flagged exact', groups.some(g => g.date === '2026-08-11' && g.exact));
  T('varied group not flagged exact', groups.some(g => g.date === '2026-08-13' && !g.exact));
  T('unique trip is left alone', !groups.some(g => g.date === '2026-08-10'));

  window.__renderH ? window.__renderH() : window.renderH();
  T('review button appears with a count', ($('dupBtn').textContent || '').indexOf('(3)') >= 0 && $('dupBtn').style.display !== 'none');

  window.openDupReview();
  T('modal opens', $('dupModal').style.display === 'flex');
  const cks = () => Array.prototype.slice.call(document.querySelectorAll('#dupBody .dup-ck'));
  T('every duplicate row is listed', cks().length === 5);
  // every extra is preselected — the top row of each group is the keeper
  T('all extras preselected', cks().filter(c => c.checked).length === 3);
  T('one keeper survives per group', cks().filter(c => !c.checked).length === 2);
  T('selection count rendered', ($('dupCount').textContent || '').indexOf('3 selected') >= 0);
  T('delete button says what it will do', ($('dupDelBtn').textContent || '').indexOf('Delete 3 trips') >= 0);

  // a mixed group (two identical rows + a different-miles variant) preselects
  // only the byte-identical repeat — the variant might be a real second trip
  T('exact repeats are labelled as such', $('dupBody').innerHTML.indexOf('exact repeat') >= 0);
  T('variants are labelled as differing', $('dupBody').innerHTML.indexOf('differs') >= 0);
  T('the kept row is marked', $('dupBody').innerHTML.indexOf('>keep<') >= 0);
  T('duplicate modal escapes user HTML', (function(){
    var t = window.__trips();
    t[0].purpose = '<img src=x onerror="boom()">';
    window.openDupReview();
    var h = $('dupBody').innerHTML;
    return h.indexOf('&lt;img') >= 0 && h.indexOf('<img src=x') < 0;
  })());

  window.dupSelectExtras();
  T('select-extras keeps one per group', cks().filter(c => c.checked).length === 3);
  window.dupSelectNone();
  T('clear selection unchecks all', cks().filter(c => c.checked).length === 0);

  window.dupSelectExtras();
  confirmAnswer = false;
  window.deleteDupSelection();
  T('declining the confirm deletes nothing', window.__trips().length === 6);

  confirmAnswer = true;
  window.deleteDupSelection();
  T('deleting extras leaves one per group', window.__trips().length === 3);
  T('the surviving rows are the kept ones', window.__trips().filter(t => t.date === '2026-08-13').length === 1);
  T('unique trip untouched', window.__trips().some(t => t.id === 25));
  T('modal closes after delete', $('dupModal').style.display === 'none');
  T('ledger reflects the cleanup', ($('hTotals').textContent || '').indexOf('3 trips') >= 0);

  // deleting server-side: rows that carry a supaId must be removed upstream
  reset();
  window.__setUser({ id: 'u1' });
  server.rows.push({ id: 'srv-d1' }, { id: 'srv-d2' });
  window.__setTrips([
    trip({ id: 30, date: '2026-08-14', supaId: 'srv-d1' }),
    trip({ id: 31, date: '2026-08-14', supaId: 'srv-d2' })
  ]);
  window.__renderH();
  window.openDupReview();
  window.dupSelectExtras();
  window.deleteDupSelection();
  await wait(50);
  T('server delete commits immediately, not after the undo window', server.deletes === 1);
  T('server row is gone right away', server.rows.length === 1);

  // a single-row delete must commit upstream immediately too: closing the tab
  // inside the old 6s window left the row on the server, and it came back
  reset();
  server.rows.push({ id: 'srv-solo' });
  window.__setTrips([trip({ id: 40, date: '2026-08-15', supaId: 'srv-solo' })]);
  window.del(40);
  await wait(50);
  T('single delete commits upstream immediately', server.deletes === 1 && server.rows.length === 0);

  // ===== RULES SYNC =====
  reset();
  window.__setUser({ id: 'u1' });
  window.__prefsSync().state = 'idle'; window.__prefsSync().last = '';
  var cfg = window.__cfg();
  cfg.rules = [{ id: 1, name: 'Lehi runs', to: 'Lehi', cat: 'Client Meeting' }];
  cfg.ruleDismissed = { 'trip-a:1': true };
  cfg.rulesUpdatedAt = 1000;

  // first run seeds the server row from this device
  await window.__loadPrefs(); await wait(30);
  T('first sync seeds the server from local rules', server.prefsWrites === 1 && server.prefs.rules.length === 1);
  T('sync reports itself as working', window.__prefsSync().state === 'synced');

  // a newer set of rules on the server replaces the local copy (delete sticks)
  server.prefs = { user_id: 'u1', rules: [{ id: 2, name: 'Ogden', to: 'Ogden', cat: 'Team Meeting' }], dismissed: {}, updated_at: new Date(5000).toISOString() };
  await window.__loadPrefs(); await wait(30);
  T('newer server rules win', window.__cfg().rules.length === 1 && window.__cfg().rules[0].id === 2);

  // an older server copy does NOT clobber a rule just added here
  window.__cfg().rules = [{ id: 3, name: 'fresh', to: 'Provo', cat: 'Client Meeting' }];
  window.__cfg().rulesUpdatedAt = 9000;
  server.prefs = { user_id: 'u1', rules: [{ id: 2 }], dismissed: {}, updated_at: new Date(5000).toISOString() };
  await window.__loadPrefs(); await wait(30);
  T('older server rules do not clobber a newer local edit', window.__cfg().rules[0].id === 3);

  // dismissals are unioned, never lost
  window.__cfg().ruleDismissed = { 'here:1': true };
  server.prefs = { user_id: 'u1', rules: [{ id: 3 }], dismissed: { 'there:2': true }, updated_at: new Date(20000).toISOString() };
  await window.__loadPrefs(); await wait(30);
  T('dismissals from both devices survive', window.__cfg().ruleDismissed['here:1'] && window.__cfg().ruleDismissed['there:2']);

  // editing rules pushes, and an unrelated cfg save does not
  server.prefsWrites = 0;
  window.__cfg().rules.push({ id: 4, to: 'Layton', cat: 'Business Errand' });
  window.__persistCfg(); await wait(900);
  T('a rule change is pushed upstream', server.prefsWrites === 1);
  server.prefsWrites = 0;
  window.__cfg().vehicle = 'Truck';   // settings change, rules untouched
  window.__persistCfg(); await wait(900);
  T('an unrelated setting does not push rules', server.prefsWrites === 0);

  // the table not existing yet must not break anything
  reset();
  server.prefsMissing = true;
  window.__prefsSync().state = 'idle'; window.__prefsSync().last = '';
  let threw = false;
  try { await window.__loadPrefs(); await wait(30); } catch (e) { threw = true; }
  T('a missing user_prefs table does not throw', !threw);
  T('missing table switches sync off, not the app', window.__prefsSync().state === 'unavailable');
  const noteBefore = $('rulesSyncNote') ? $('rulesSyncNote').textContent : '';
  T('the owner is told rules are device-only', /device only|this device/i.test(noteBefore), noteBefore);
  window.__cfg().rules.push({ id: 9, to: 'X', cat: 'Other Business' });
  window.__persistCfg(); await wait(900);
  T('no writes are attempted once the table is known missing', server.prefsWrites === 0);
  T('rules still work locally without the table', window.__cfg().rules.length > 0);

  // ===== PLANS + REFERRALS (groundwork: nothing is locked) =====
  reset();
  window.__setUser({ id: 'u1' });
  window.__plan().state = 'idle'; window.__plan().code = '';
  window.localStorage.setItem('ml_referred_by', 'friendcode');

  await window.__loadPlan(); await wait(20);
  T('first sign-in creates the plan row', server.planInserts === 1);
  T('everyone starts on founding, nothing locked', window.__plan().plan === 'founding');
  T('the account gets its own share code', /^[a-z0-9]{8}$/.test(window.__plan().code));
  T('the code someone arrived with is recorded once', server.plan.referred_by_code === 'friendcode');
  T('the arrival code is cleared after it is used', !window.localStorage.getItem('ml_referred_by'));

  // the share link must never carry the Supabase user id
  const link = window.__inviteLink();
  T('the invite link uses the short code', link.indexOf('ref=' + window.__plan().code) > 0, link);
  T('the invite link does not leak the user id', link.indexOf('u1') < 0, link);

  // signing in again adopts the existing row, it does not mint a second
  server.planInserts = 0;
  await window.__loadPlan(); await wait(20);
  T('a later sign-in does not create another row', server.planInserts === 0);
  T('the share code is stable across sign-ins', window.__plan().code === server.plan.referral_code);

  // codes are unguessable and distinct
  const codes = {}; let dup = 0;
  for (let i = 0; i < 500; i++) { const c = window.__newCode(); if (codes[c]) dup++; codes[c] = 1; }
  T('share codes do not collide across 500 draws', dup === 0);
  T('share codes avoid look-alike characters', Object.keys(codes).every(c => !/[ilo01]/.test(c)));

  // nothing is gated today, and the records can never be
  T('every feature is available right now', ['export','taxReport','rules','autoTrack','anything'].every(f => window.__can(f)));
  T('the export is always free by rule', window.__can('export'));
  T('the tax report is always free by rule', window.__can('taxReport'));
  window.__plan().plan = 'free'; window.__plan().expires = '2000-01-01T00:00:00Z';  // expired, lowest plan
  T('an expired plan still reaches the export', window.__can('export'));
  T('an expired plan still reaches the tax report', window.__can('taxReport'));
  T('an expired plan can still read and log trips', window.__can('viewTrips') && window.__can('logTrip'));
  window.__plan().plan = 'founding'; window.__plan().expires = null;

  // the table not existing must not break sign-in
  reset();
  server.planMissing = true;
  // a fresh page load with the table missing: no code has ever been minted
  window.__plan().state = 'idle'; window.__plan().code = ''; window.__plan().plan = 'founding';
  let planThrew = false;
  try { await window.__loadPlan(); await wait(20); } catch (e) { planThrew = true; }
  T('a missing user_plan table does not throw', !planThrew);
  T('missing table switches plan tracking off', window.__plan().state === 'unavailable');
  T('no plan row is attempted once the table is known missing', server.planInserts === 0);
  T('with no table the invite link carries no code', window.__inviteLink().indexOf('ref=') < 0);

  console.log(`sync.test.js: ${pass} passed${fail ? ', ' + fail + ' failed' : ''}`);
  process.exit(fail ? 1 : 0);
})();
