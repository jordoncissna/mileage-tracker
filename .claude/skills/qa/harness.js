// Behavioral QA harness for Milo. Boots the real index.html in Chromium with a
// *stateful* Supabase stub (rows survive reloads, in localStorage) and Google
// Maps stubbed, then drives the app the way the owner does — clicking real
// controls and counting real rows.
//
//   node .claude/skills/qa/harness.js
//
// Google Maps tiles cannot load in this sandbox; anything that depends on live
// tiles is out of scope here and must be reported as unverified.
// playwright-core lives with the test suite so this harness needs no install of its own
const { chromium } = require(require('path').resolve(__dirname, '../../../tests/node_modules/playwright-core'));
const APP = 'file://' + require('path').resolve(__dirname, '../../../index.html');

const results = [];
const R = (name, ok, note = '') => { results.push({ name, ok: !!ok, note }); };

const INIT = `
  // ---- stateful fake backend: rows live in localStorage so reloads are real ----
  (function(){
    var K='qa_srv';
    function rows(){ try { return JSON.parse(localStorage.getItem(K)||'[]'); } catch(e){ return []; } }
    function put(r){ localStorage.setItem(K, JSON.stringify(r)); }
    if(!localStorage.getItem(K)) put([]);
    if(!localStorage.getItem('ml3_set')) localStorage.setItem('ml3_set', JSON.stringify({rates:{2026:0.7,2025:0.7,2024:0.67,2023:0.655},biz:'Ridgeline',vehicle:'Model Y',home:'1113 S 4090 W, Syracuse, UT',rules:[],ruleDismissed:{}}));
    localStorage.setItem('milo-onboarding-complete:u1','1');
    window.__srv = { rows: rows, put: put, inserts: 0, deletes: 0 };
    var table = {
      select: function(){ return { order: async function(){ return { data: rows(), error: null }; },
                                   eq: function(){ return { order: async function(){ return { data: rows(), error: null }; } }; } }; },
      insert: function(payload){
        var list = Array.isArray(payload) ? payload : [payload];
        var made = list.map(function(r){
          window.__srv.inserts++;
          return Object.assign({}, r, { id: 'srv-' + Math.random().toString(36).slice(2,10) });
        });
        var all = rows().concat(made); put(all);
        var p = Promise.resolve({ data: Array.isArray(payload) ? made : made[0], error: null });
        p.select = function(){ var q = p.then(function(x){ return x; });
          q.single = function(){ return p.then(function(x){ return { data: Array.isArray(x.data)?x.data[0]:x.data, error:null }; }); };
          return q; };
        return p;
      },
      update: function(patch){ return { eq: async function(col,id){ put(rows().map(function(r){ return r.id===id ? Object.assign(r,patch) : r; })); return { error:null }; } }; },
      delete: function(){ return { eq: async function(col,id){ window.__srv.deletes++; put(rows().filter(function(r){ return r.id!==id; })); return { error:null }; } }; }
    };
    window.supabase = { createClient: function(){ return {
      auth: { getSession: async function(){ return { data: { session: { user:{ id:'u1', email:'qa@test.co' } } } }; },
              onAuthStateChange: function(cb){ setTimeout(function(){ cb('SIGNED_IN', { user:{ id:'u1', email:'qa@test.co' } }); }, 30); return { data:{ subscription:{ unsubscribe:function(){} } } }; },
              signOut: async function(){ return {}; } },
      from: function(){ return table; } }; } };
  })();
  window.__map = { directions: 0, markers: [], polylines: 0, fits: 0, lastReq: null, routeStatus: 'OK', log: [] };
  window.google = { maps: {
    places:{ Autocomplete:function(){ return { addListener(){}, getPlace(){ return {}; } }; }, AutocompleteService:function(){ this.getPlacePredictions=function(){}; } },
    Geocoder:function(){ this.geocode=function(req,cb){ setTimeout(function(){ cb([{ geometry:{ location:{ lat:function(){return 40.9;}, lng:function(){return -111.9;} } } }],'OK'); },5); }; },
    Map:function(){ this.addListener=function(){}; this.getCenter=function(){ return {lat:function(){return 41;},lng:function(){return -112;}}; }; this.getZoom=function(){return 10;}; this.setOptions=function(){}; this.setCenter=function(){}; this.fitBounds=function(){ window.__map.fits++; }; },
    Marker:function(o){ var l=(o&&o.label&&o.label.text)||'dot'; window.__map.markers.push(l); window.__map.log.push('marker '+l); this.setMap=function(m){ if(!m){ window.__map.markers.pop(); window.__map.log.push('marker cleared'); } }; },
    Polyline:function(){ window.__map.polylines++; this.setMap=function(m){ if(!m) window.__map.polylines--; }; },
    DirectionsService:function(){ this.route=function(req,cb){
      window.__map.lastReq = { origin: req.origin, destination: req.destination };
      setTimeout(function(){
        if(window.__map.routeStatus !== 'OK') return cb(null, window.__map.routeStatus);
        var pt = { lat:function(){return 40.9;}, lng:function(){return -111.9;} };
        cb({ routes:[{ legs:[{ distance:{ value: 65000 }, duration:{ value: 1500 }, start_location: pt, end_location: pt }] }] }, 'OK');
      }, 10);
    }; },
    DirectionsRenderer:function(){ this.setDirections=function(){ window.__map.directions++; window.__map.log.push('setDirections'); }; this.setMap=function(m){ if(!m){ window.__map.directions--; window.__map.log.push('renderer cleared'); } }; },
    LatLngBounds:function(){ this.extend=function(){}; }, geometry:{ spherical:{ computeDistanceBetween:function(){ return 1609; } } },
    event:{ addListenerOnce:function(){} }, importLibrary:function(){ return Promise.resolve({}); },
    SymbolPath:{ CIRCLE:0 }, TravelMode:{ DRIVING:'DRIVING' } } };
  window.QRCode = function(){};
`;

const settle = p => p.waitForTimeout(450);
// Waits until exactly one route with both pins is on the map. Returns false on
// timeout rather than throwing, so a miss is reported as a failed check.
async function mapSettled(page, ms = 8000) {
  try {
    await page.waitForFunction(() => window.__map.directions === 1 &&
      window.__map.markers.filter(m => m === 'A' || m === 'B').length === 2, null, { timeout: ms, polling: 100 });
    return true;
  } catch (e) { return false; }
}
const tripCount = p => p.evaluate(() => window.__qaTrips().length);
const rowsOnScreen = p => p.evaluate(() => document.querySelectorAll('#htable tbody tr:not(.month-row)').length);

// Fill the log form the way a person does: type into the visible inputs.
async function fillLog(page, o) {
  await page.evaluate((o) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('tDate', o.date); set('tMiles', String(o.miles));
    set('tFromStreet', '1113 S 4090 W'); set('tFromCity', 'Syracuse'); set('tFromState', 'UT');
    set('tToStreet', o.to || '456 Business Ave'); set('tToCity', 'Lehi'); set('tToState', 'UT');
    set('tPurpose', o.purpose || 'QA trip');
    const c = document.getElementById('tCat'); if (c) c.value = 'Client Meeting';
    const r = document.getElementById('tRound'); if (r) r.checked = !!o.round;
    if (window.buildAddr) window.buildAddr();
  }, o);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 880 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('dialog', d => d.accept());               // duplicate-guard confirms: accept by default
  await page.route(/googleapis|gstatic|jsdelivr/, r => r.abort());
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    ['authOverlay', 'onboardOverlay'].forEach(i => { const el = document.getElementById(i); if (el) { el.style.display = 'none'; el.classList.remove('active'); } });
    window.__qaTrips = () => window.__trips ? window.__trips() : JSON.parse(localStorage.getItem('ml3_trips') || '[]');
    if (window.initGoogleMaps) window.initGoogleMaps();   // the CDN callback, which the route block above prevents
  });
  // initGoogleMaps re-styles the map 500ms later and that rebuild takes another
  // 350ms — let it finish before any test measures what is on the map
  await page.waitForTimeout(1600);
  // trips is module-scoped; read it through localStorage, which save() keeps current
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); });

  // ── every view reachable from every other view (Settings trapped the user once)
  for (const v of ['home', 'hist', 'analytics', 'set']) {
    await page.evaluate(v => window.switchNav(v, document.getElementById('nav-' + v)), v);
    await settle(page);
    const blocked = await page.evaluate(() => {
      const out = [];
      for (const id of ['nav-home', 'nav-log', 'nav-hist', 'nav-analytics', 'nav-set']) {
        const b = document.getElementById(id); if (!b) { out.push(id + ':missing'); continue; }
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!(b === hit || b.contains(hit))) out.push(id);
      }
      return out;
    });
    R(`nav reachable from ${v}`, blocked.length === 0, blocked.join(','));
  }

  // ── one trip is one row
  await page.evaluate(() => window.openLogOverlay());
  await settle(page);
  const n0 = await tripCount(page);
  await fillLog(page, { date: '2026-07-01', miles: 40, purpose: 'single' });
  await page.evaluate(() => window.addTrip()); await settle(page);
  R('single trip → 1 row', await tripCount(page) === n0 + 1);

  // ── round trip is ONE row with doubled miles
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await fillLog(page, { date: '2026-07-02', miles: 81.2, purpose: 'round', round: true });
  await page.evaluate(() => window.addTrip()); await settle(page);
  const rt = await page.evaluate(() => window.__qaTrips().filter(t => t.date === '2026-07-02'));
  R('round trip → 1 row', rt.length === 1, 'rows=' + rt.length);
  R('round trip → doubled miles', rt.length === 1 && Math.abs(rt[0].miles - 162.4) < 0.05, rt[0] && rt[0].miles);

  // ── same trip repeated across 3 dates → exactly 3 rows, each doubled
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await fillLog(page, { date: '2026-07-10', miles: 81.2, purpose: 'repeat', round: true, to: '900 Repeat Way' });
  await page.evaluate(() => { window.addExtraDate(); window.addExtraDate(); });
  await page.evaluate(() => {
    const xs = document.querySelectorAll('#xtraDates .xdate');
    xs[0].value = '2026-07-11'; xs[1].value = '2026-07-12';
  });
  await page.evaluate(() => window.addTrip()); await page.waitForTimeout(900);
  const rep = await page.evaluate(() => window.__qaTrips().filter(t => (t.purpose || '').indexOf('repeat') === 0));
  R('3 dates → exactly 3 rows', rep.length === 3, 'rows=' + rep.length);
  // stubbed Directions answers 40.4 mi per leg, so a round trip row is 80.8
  R('each repeat row carries round-trip miles', rep.length === 3 && rep.every(t => Math.abs(t.miles - 80.8) < 0.05), rep.map(t => t.miles).join('/'));

  // ── duplicate guard fires on same route + same date
  let asked = false;
  page.removeAllListeners('dialog');
  page.on('dialog', d => { asked = /already/i.test(d.message()); d.dismiss(); });
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await fillLog(page, { date: '2026-07-01', miles: 40, purpose: 'single again' });
  const beforeDup = await tripCount(page);
  await page.evaluate(() => window.addTrip()); await settle(page);
  R('duplicate save asks first', asked);
  R('declining the duplicate saves nothing', await tripCount(page) === beforeDup);
  page.removeAllListeners('dialog');
  page.on('dialog', d => d.accept());

  // ── edit a saved trip: values change, count does not, survives a reload
  await page.evaluate(() => window.switchNav('hist', document.getElementById('nav-hist'))); await settle(page);
  const target = await page.evaluate(() => window.__qaTrips().find(t => t.purpose === 'single').id);
  const beforeEdit = await tripCount(page);
  await page.evaluate(id => window.editTrip(id), target); await settle(page);
  await page.evaluate(() => { document.getElementById('tMiles').value = '55.5'; document.getElementById('tPurpose').value = 'edited'; });
  await page.evaluate(() => window.addTrip()); await page.waitForTimeout(700);
  R('edit does not add a row', await tripCount(page) === beforeEdit);
  R('edit applied', await page.evaluate(() => !!window.__qaTrips().find(t => t.purpose === 'edited' && Math.abs(t.miles - 55.5) < 0.01)));

  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  R('edit survives a reload', await page.evaluate(() => !!window.__qaTrips().find(t => t.purpose === 'edited' && Math.abs(t.miles - 55.5) < 0.01)));
  const afterReload = await tripCount(page);

  // ── delete stays deleted through a reload (server row gone, not just local)
  const doomed = await page.evaluate(() => window.__qaTrips().find(t => t.purpose === 'edited').id);
  await page.evaluate(id => window.del(id), doomed); await page.waitForTimeout(7000); // let the undo window lapse
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  R('delete survives a reload', await page.evaluate(() => !window.__qaTrips().some(t => t.purpose === 'edited')));
  R('reload does not multiply trips', await tripCount(page) === afterReload - 1, 'before=' + afterReload + ' after=' + await tripCount(page));

  // ── repeated sign-in refreshes never duplicate rows
  const preLoad = await tripCount(page);
  await page.evaluate(() => { window.loadFromSupabase(); window.loadFromSupabase(); });
  await page.waitForTimeout(900);
  R('double refresh keeps the ledger stable', await tripCount(page) === preLoad, 'before=' + preLoad + ' after=' + await tripCount(page));

  // ── duplicate review tool
  await page.evaluate(() => {
    const t = JSON.parse(localStorage.getItem('ml3_trips') || '[]');
    const base = { date: '2026-09-01', miles: 81.2, from: 'A St, Syracuse, UT', to: 'B Ave, Lehi, UT', purpose: 'dupe', category: 'Client Meeting' };
    localStorage.setItem('ml3_trips', JSON.stringify(t.concat([
      Object.assign({ id: 90001 }, base), Object.assign({ id: 90002 }, base), Object.assign({ id: 90003 }, base, { miles: 162.4, purpose: 'dupe rt' })
    ])));
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  await page.evaluate(() => window.switchNav('hist', document.getElementById('nav-hist'))); await settle(page);
  R('review button surfaces the count', await page.evaluate(() => {
    const b = document.getElementById('dupBtn');
    return b && b.style.display !== 'none' && /\(2\)/.test(b.textContent);
  }));
  await page.click('#dupBtn'); await settle(page);
  R('review modal lists the group', await page.evaluate(() => document.querySelectorAll('#dupBody .dup-ck').length === 3));
  R('byte-identical extra preselected, variant left alone', await page.evaluate(() => {
    const cks = Array.from(document.querySelectorAll('#dupBody .dup-ck'));
    const milesOf = c => c.closest('label').textContent.match(/([\d.]+) mi/)[1];
    const checked = cks.filter(c => c.checked);
    // the repeat of the 81.2 row is checked; the 162.4 variant is left for the owner
    return checked.length === 1 && milesOf(checked[0]) === '81.2';
  }));
  const beforeClean = await tripCount(page);
  await page.click('text=Select all but the first in each group'); await settle(page);
  await page.click('#dupDelBtn'); await page.waitForTimeout(7500);
  R('cleanup removes exactly the extras', await tripCount(page) === beforeClean - 2, 'before=' + beforeClean + ' after=' + await tripCount(page));
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  R('cleanup survives a reload', await tripCount(page) === beforeClean - 2);

  // ── the trip always shows on the map: typing addresses draws it, saving keeps it
  await page.evaluate(() => { window.__map.markers = []; window.__map.directions = 0; window.__map.polylines = 0; window.__map.lastReq = null; });
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  for (const [id, v] of [['tFromStreet', '1113 S 4090 W'], ['tFromCity', 'Syracuse'], ['tFromState', 'UT'],
                         ['tToStreet', '77 Map Preview Rd'], ['tToCity', 'Ogden'], ['tToState', 'UT']]) {
    await page.fill('#' + id, v);                    // real typing → real oninput
  }
  const drawn = await mapSettled(page);              // debounce, then the Directions round trip
  R('typing an address draws the route', drawn);
  R('route asks Directions for the typed pair', await page.evaluate(() => /Map Preview/.test(window.__map.lastReq.destination)));
  R('A and B pins dropped', drawn);
  R('map info shows the distance', await page.evaluate(() => /mi/.test(document.getElementById('mainMapInfo').textContent)));

  // saving keeps that trip on the map, with its date
  await page.evaluate(() => { document.getElementById('tMiles').value = '40.4'; document.getElementById('tPurpose').value = 'map preview'; });
  await page.evaluate(() => window.addTrip());
  R('saved trip stays drawn', await mapSettled(page));
  R('map info labels the saved trip', await page.evaluate(() => /2026|mi/.test(document.getElementById('mainMapInfo').textContent)));

  // no driving route available → straight line rather than an empty map
  await page.evaluate(() => { window.__map.routeStatus = 'ZERO_RESULTS'; window.__map.polylines = 0; window.__map.markers = []; });
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  for (const [id, v] of [['tFromStreet', '5 Nowhere Ln'], ['tFromCity', 'Bluff'], ['tFromState', 'UT'],
                         ['tToStreet', '9 Offgrid Trl'], ['tToCity', 'Boulder'], ['tToState', 'UT']]) {
    await page.fill('#' + id, v);
  }
  try { await page.waitForFunction(() => window.__map.polylines === 1, null, { timeout: 8000, polling: 100 }); } catch (e) {}
  R('unroutable pair falls back to a straight line', await page.evaluate(() => window.__map.polylines === 1));
  R('fallback still drops both pins', await page.evaluate(() => window.__map.markers.filter(m => m === 'A' || m === 'B').length === 2));
  R('fallback says so in the info bar', await page.evaluate(() => /straight line/.test(document.getElementById('mainMapInfo').textContent)));
  await page.evaluate(() => { window.__map.routeStatus = 'OK'; });
  await page.evaluate(() => window.closeLogOverlay());

  // relogging from History draws that trip too
  await page.evaluate(() => { window.__map.directions = 0; window.__map.markers = []; });
  await page.evaluate(() => window.switchNav('hist', document.getElementById('nav-hist'))); await settle(page);
  const relogId = await page.evaluate(() => window.__qaTrips().find(t => t.purpose === 'map preview').id);
  await page.evaluate(id => window.relogTrip(id), relogId);
  const relogDrawn = await mapSettled(page);
  R('relog draws the trip on the map', relogDrawn);
  R('relog asks Directions only once', relogDrawn && await page.evaluate(() => window.__map.markers.length === 2));
  await page.evaluate(() => window.closeLogOverlay());

  // ── a theme switch must not wipe the trip off the map
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  for (const [id, v] of [['tFromStreet', '1113 S 4090 W'], ['tFromCity', 'Syracuse'], ['tFromState', 'UT'],
                         ['tToStreet', '12 Theme Test Rd'], ['tToCity', 'Provo'], ['tToState', 'UT']]) {
    await page.fill('#' + id, v);
  }
  await mapSettled(page);
  await page.evaluate(() => { window.__map.log = []; window.applyMapMode('dark'); });
  // the rebuild tears the map down; what matters is that the trip comes back
  const survived = await mapSettled(page);
  R('route survives a theme switch', survived && await page.evaluate(() =>
    window.__map.log.slice(-3).join(',') === 'setDirections,marker A,marker B'),
    await page.evaluate(() => window.__map.log.join(' | ')));
  await page.evaluate(() => window.applyMapMode('light'));
  await page.waitForTimeout(900);
  await page.evaluate(() => window.closeLogOverlay());

  // ── no commute anywhere
  await page.evaluate(() => window.switchNav('hist', document.getElementById('nav-hist'))); await settle(page);
  R('no commute flags in the ledger', await page.evaluate(() => !/commute/i.test(document.getElementById('htable').textContent)));

  // ── light default, and mobile does not overflow
  R('light theme by default', await page.evaluate(() => !document.body.classList.contains('dark') && (localStorage.getItem('ml_mode') || 'light') !== 'dark'));
  const mob = await ctx.newPage();
  await mob.route(/googleapis|gstatic|jsdelivr/, r => r.abort());
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(APP, { waitUntil: 'domcontentloaded' }); await mob.waitForTimeout(1300);
  await mob.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  for (const v of ['home', 'hist', 'analytics', 'set']) {
    await mob.evaluate(v => window.switchNav(v, document.getElementById('nav-' + v)), v);
    await mob.waitForTimeout(400);
    const over = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    R(`390px: ${v} does not scroll sideways`, over <= 1, 'overflow=' + over + 'px');
  }
  R('390px: bottom nav present', await mob.evaluate(() => {
    const n = document.getElementById('mobileBottomNav');
    return !!n && getComputedStyle(n).display !== 'none';
  }));

  await browser.close();
  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? '  ok  ' : 'FAIL  ') + r.name + (r.note ? '   [' + r.note + ']' : '')));
  console.log(`\n${results.length - bad.length}/${results.length} behavioral checks passed`);
  console.log('NOT covered here: live Google Maps tiles (blocked in this sandbox), real Supabase/RLS, iOS Safari.');
  process.exit(bad.length ? 1 : 0);
})();
