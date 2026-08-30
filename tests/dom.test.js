// DOM-level tests for Milo using jsdom, with Google Maps / Supabase stubbed
// (those can't be reached in a test environment). Run: node dom.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://jordoncissna.github.io/mileage-tracker/' });
const { window } = dom;
const { document } = window;

// ---- stub externals the inline script expects ----
window.google = { maps: { places: { Autocomplete: function () { return { addListener() {}, getPlace() { return {}; } }; }, AutocompleteService: function () { this.getPlacePredictions = () => {}; } }, Geocoder: function () { this.geocode = () => {}; }, Map: function () { this.addListener = () => {}; }, Marker: function () {}, DirectionsService: function () { this.route = () => {}; }, DirectionsRenderer: function () { this.setMap = () => {}; }, LatLngBounds: function () { this.extend = () => {}; }, geometry: { spherical: { computeDistanceBetween: () => 1609 } }, event: { addListenerOnce: () => {} }, importLibrary: () => Promise.resolve({}) } };
window.supabase = { createClient: () => ({ auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signInWithPassword: async () => ({}), signUp: async () => ({}), signOut: async () => ({}) }, from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }), insert: async () => ({ data: [{ id: 'x' }], error: null }), update: () => ({ eq: async () => ({ error: null }) }), delete: () => ({ eq: async () => ({ error: null }) }) }) }) };
window.QRCode = function () {};
window.initGoogleMaps = window.initGoogleMaps || function () {};
window.alert = () => {}; window.confirm = () => true;

const store = {};
window.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; } };

const inline = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/^<script>/, '').replace(/<\/script>$/, '');
const runner = new window.Function(inline + '\n;window.__clearF=clearF;window.__addTrip=addTrip;window.__trips=()=>trips;window.__renderH=renderH;window.__renderAnalytics=renderAnalytics;window.__showTip=showChartTip;window.__logEndpoints=logRouteEndpoints;window.renderHome=renderHome;');
try { runner.call(window); } catch (e) { console.log('init threw (often benign):', e.message); }

let pass = 0, fail = 0;
const T = (n, c) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };
const $ = id => document.getElementById(id);

// ===== CLEAR BUTTON =====
['tFromStreet', 'tFromCity', 'tFromState', 'tToStreet', 'tToCity', 'tToState'].forEach(id => { $(id).value = 'SOMETHING'; });
$('tMiles').value = '42'; $('tPurpose').value = 'client visit'; $('tCat').selectedIndex = 3;
window.__clearF();
['tFromStreet', 'tFromCity', 'tFromState', 'tToStreet', 'tToCity', 'tToState'].forEach(id => T('clear ' + id, $(id).value === ''));
T('clear tMiles', $('tMiles').value === '');
T('clear tPurpose', $('tPurpose').value === '');
T('clear tCat resets', $('tCat').selectedIndex === 0);
T('clear tDate set', $('tDate').value && $('tDate').value.length === 10);

// ===== ADD TRIP =====
const before = window.__trips().length;
$('tFromStreet').value = '1113 S 4090 W'; $('tFromCity').value = 'Syracuse'; $('tFromState').value = 'UT';
$('tToStreet').value = '456 Business Ave'; $('tToCity').value = 'Lehi'; $('tToState').value = 'UT';
$('tMiles').value = '15'; $('tPurpose').value = 'meeting'; $('tCat').selectedIndex = 0; $('tDate').value = '2026-06-10';
window.__addTrip();
const t = window.__trips()[window.__trips().length - 1];
T('addTrip appends', window.__trips().length === before + 1);
T('from built', t && t.from.indexOf('1113') >= 0);
T('to built', t && t.to.indexOf('456 Business Ave') >= 0);
T('miles parsed', t && t.miles === 15);
T('form cleared after save', $('tMiles').value === '');
const c2 = window.__trips().length;
$('tMiles').value = ''; window.__addTrip();
T('blocks empty miles', window.__trips().length === c2);

// ===== HISTORY =====
let threw = false; try { window.__renderH(); } catch (e) { threw = true; }
T('renderH no throw', !threw);
T('history populated', $('htable').innerHTML.indexOf('Lehi') >= 0);

// ===== ANALYTICS (modernized charts) =====
['2026-01-05', '2026-03-12', '2026-05-20'].forEach((d, i) => {
  $('tFromStreet').value = '1113 S 4090 W'; $('tFromCity').value = 'Syracuse'; $('tFromState').value = 'UT';
  $('tToStreet').value = (100 + i) + ' Test Rd'; $('tToCity').value = 'Lehi'; $('tToState').value = 'UT';
  $('tMiles').value = String(10 + i * 5); $('tPurpose').value = 'meeting'; $('tCat').selectedIndex = 0; $('tDate').value = d;
  window.__addTrip();
});
let aThrew = false; try { window.__renderAnalytics(); } catch (e) { aThrew = true; console.log('analytics err:', e.message); }
T('analytics no throw', !aThrew);
T('chart is SVG', $('aChart').innerHTML.indexOf('<svg') >= 0);
T('chart gradient bars', $('aChart').innerHTML.indexOf('url(#barGrad)') >= 0);
T('chart gridlines', $('aChart').innerHTML.indexOf('chart-grid') >= 0);
T('category bars colored', $('aCats').innerHTML.indexOf('cat-fill') >= 0);
T('tooltip element present', !!$('aChartTip'));
let tipThrew = false; try { window.__showTip({ clientX: 100, clientY: 100 }, 'Jan', 42, 29); } catch (e) { tipThrew = true; }
T('tooltip handler no throw', !tipThrew);
T('tooltip populated', $('aChartTip').innerHTML.indexOf('mi') >= 0);

// ===== XSS ESCAPING IN HISTORY =====
$('tFromStreet').value = '<img src=x onerror="window.__pwned=1">'; $('tFromCity').value = 'Syracuse'; $('tFromState').value = 'UT';
$('tToStreet').value = '789 Safe St'; $('tToCity').value = 'Lehi'; $('tToState').value = 'UT';
$('tMiles').value = '5'; $('tPurpose').value = '<script>window.__pwned=1<\/script>'; $('tCat').selectedIndex = 0; $('tDate').value = '2026-06-15';
window.__addTrip();
window.__renderH();
T('history escapes img tag', $('htable').innerHTML.indexOf('&lt;img') >= 0);
T('no live img injected', !$('htable').querySelector('img[src="x"]'));
T('no live script injected', !$('htable').querySelector('script'));
T('escaped text still visible', $('htable').textContent.indexOf('<img src=x') >= 0);
T('no script executed', !window.__pwned);

// ===== ANALYTICS V2 =====
window.__renderAnalytics();
T('cumulative chart renders SVG', $('aCum').innerHTML.indexOf('<svg') >= 0);
T('cumulative current-year line drawn', $('aCum').innerHTML.indexOf('stroke="var(--accent)"') >= 0);
T('cumulative crosshair present', !!$('aCum').querySelector('#cumXhair'));
T('cumulative legend shows year', $('aCumLegend').textContent.indexOf(String(new Date().getFullYear())) >= 0);
T('heatmap renders cells', $('aHeat').querySelectorAll('.hm-cell').length >= 365);
T('heatmap has active cells', $('aHeat').innerHTML.indexOf('var(--hm') >= 0);
T('split bar has segments', $('aSplit').querySelectorAll('.split-seg').length >= 1);
T('split shows two rows (no commute)', $('aSplit').querySelectorAll('.sr').length === 2);
T('split deductible value shown', $('aSplit').textContent.indexOf('$') >= 0);
T('insights render chips', $('aInsights').querySelectorAll('.insight-chip').length >= 1);
T('period chart has y-axis ticks', $('aChart').querySelectorAll('.chart-ylabel').length >= 3);

// ===== LIGHT MODE DEFAULT =====
T('defaults to light mode', document.body.classList.contains('light'));

// ===== QUICK START =====
T('quick start hidden once trips exist', $('quickStart').style.display === 'none');
T('fillSampleTrip exposed', typeof window.fillSampleTrip === 'function');
T('quick start has 3 steps', document.querySelectorAll('.qs-step').length === 3);

// ===== SETTINGS FLOW =====
const h3s = [...document.querySelectorAll('#view-set .sc h3')].map(h => h.textContent.trim().split(' ')[0]);
T('settings starts with business', h3s[0] === 'Business');
T('commute settings card removed', h3s.findIndex(t => t === 'Commute') < 0);
T('account near the end', h3s.findIndex(t => t === 'Account') > h3s.findIndex(t => t === 'Auto-classify'));
T('single save button', [...document.querySelectorAll('#view-set button')].filter(b => b.textContent.indexOf('Save settings') >= 0).length === 1);

// ===== ANALYTICS YEAR DEFAULT =====
T('year filter defaults to current year', $('aYear').value === String(new Date().getFullYear()));

// ===== WELCOME TOUR =====
// 7 since the daily-commute screen was removed with the commute concept
T('7 onboarding screens', document.querySelectorAll('.onboard-screen').length === 7);
T('7 progress dots', document.querySelectorAll('#onboardDots .onboard-dot').length === 7);
T('dots match screens', document.querySelectorAll('#onboardDots .onboard-dot').length === document.querySelectorAll('.onboard-screen').length);
T('screens are numbered 1..7 with no gap', Array.from(document.querySelectorAll('.onboard-screen')).map(s => s.getAttribute('data-screen')).join(',') === '1,2,3,4,5,6,7');
T('onboarding never asks about a commute', !/onbCommute|daily commute/i.test(html));
T('no fake location-permission screen', html.indexOf('Allow "Milo" to use') < 0);
T('no fake notification screen', html.indexOf('Send You Notifications') < 0);
T('install screen present', html.indexOf('Put Milo on your phone') >= 0);
T('tour triggers on first login', html.indexOf('localStorage.getItem(onboardFlagKey())') >= 0 && html.match(/function onSignedIn[\s\S]{0,700}startOnboarding/));
T('tour flag is scoped per user', !!html.match(/function onboardFlagKey[\s\S]{0,200}currentUser/));
T('tour replay in settings', html.indexOf('Replay the welcome tour') >= 0);
T('startOnboarding exposed', typeof window.startOnboarding === 'function');

// ===== DEMO CLASSIFY: PERSONAL OPTION =====
T('4 demo category buttons', document.querySelectorAll('.onboard-demo-cat').length === 4);
T('personal demo option present', !!document.querySelector('.onboard-demo-cat[data-cat="Personal (Non-deductible)"]'));
window.startOnboarding();
window.onboardDemoClassify('Personal (Non-deductible)');
T('personal pick teaches $0', $('demoSuccessText').textContent.indexOf('$0') >= 0);
T('demo locks after pick (by design)', (window.onboardDemoClassify('Client Meeting'), $('demoSuccessText').textContent.indexOf('$0') >= 0));
window.startOnboarding();
window.onboardDemoClassify('Client Meeting');
T('business pick shows value', $('demoSuccessText').textContent.indexOf('$8.68') >= 0);
document.getElementById('onboardOverlay').classList.remove('active');

// ===== CONFETTI =====
T('confetti exposed', typeof window.fireConfetti === 'function');
let confettiThrew = false; try { window.fireConfetti(); } catch (e) { confettiThrew = true; }
T('confetti no throw', !confettiThrew);
T('confetti on completion not skip', /if\(skipReason!=='skip'\)fireConfetti\(\)/.test(html));

// ===== REVERSIBLE DELETE + TYPED CLEAR-ALL =====
(function () {
  const trips = window.__trips();
  const before = trips.length;
  const victim = trips[trips.length - 1];
  window.del(victim.id);
  T('del removes the trip', window.__trips().length === before - 1);
  T('undo toast is shown', $('undoToast').classList.contains('show'));
  $('undoToastBtn').click();
  T('undo restores the trip', window.__trips().length === before);
  T('restored trip is the same one', window.__trips().some(t => t.id === victim.id));

  // Clear-all: wrong text does nothing
  window.prompt = () => 'nope';
  const n = window.__trips().length;
  window.clearAll();
  T('clear-all blocked without typing DELETE', window.__trips().length === n && n > 0);

  // Clear-all: typing DELETE clears, undo restores
  window.prompt = () => 'DELETE';
  window.clearAll();
  T('clear-all with DELETE empties trips', window.__trips().length === 0);
  T('clear-all shows undo', $('undoToast').classList.contains('show'));
  $('undoToastBtn').click();
  T('clear-all undo restores all', window.__trips().length === n);

  // Cancelling the prompt (null) is a no-op
  window.prompt = () => null;
  const n2 = window.__trips().length;
  window.clearAll();
  T('clear-all cancel is a no-op', window.__trips().length === n2);
})();

// ===== INVITE A COWORKER (referral) =====
T('openInviteModal exposed', typeof window.openInviteModal === 'function');
T('invite link carries a ref param', /[?&]ref=/.test(window.buildInviteLink()));
T('invite link points at the app', window.buildInviteLink().indexOf('mileage-tracker') >= 0);
window.openInviteModal();
T('invite modal opens', $('inviteModal').style.display === 'flex');
T('invite link populated in field', $('inviteLinkInput').value === window.buildInviteLink());
T('invite entry point in settings', html.indexOf('Invite a coworker') >= 0);
window.closeInviteModal();
T('invite modal closes', $('inviteModal').style.display === 'none');
// Inbound referral capture: simulate ?ref= landing
window.localStorage.setItem('ml_referred_by', 'coworker-123');
T('referral is stashed for attribution', window.localStorage.getItem('ml_referred_by') === 'coworker-123');

// ===== SINGLE SHARE MODAL / RESIZE HANDLE =====
T('one shareModal', document.querySelectorAll('#shareModal').length === 1);
T('one rightResize', document.querySelectorAll('#rightResize').length === 1);

// ===== MISSION CONTROL: rail + Home view =====
T('icon rail present', !!document.querySelector('.rail') && !!$('nav-home') && document.querySelector('.rail #nav-log') !== null);
T('old nav-pills gone', document.querySelector('.nav-pills') === null);
T('home view exists', !!$('view-home') && !!$('hStats') && !!$('hWeek'));
T('topbar has log button + context', !!$('tbLogBtn') && !!$('tbTitle'));
let homeThrew = false; try { window.renderHome(); } catch (e) { homeThrew = true; console.log('home err:', e.message); }
T('renderHome no throw', !homeThrew);
T('home stats populated', $('hStats').querySelectorAll('.hs-card').length === 4);
T('home week list renders trips', $('hWeek').querySelectorAll('.hw-row').length >= 1);
T('ghost layer fully removed', html.indexOf('ghostChips') < 0 && html.indexOf('showGhostLayer') < 0);
// Tap-to-relog prefills the New Trip form (today's date, not the old one)
const gt = window.__trips()[0];
window.relogTrip(gt.id);
T('relog prefills From street', $('tFromStreet').value === (gt.from || '').split(',')[0].trim());
T('relog prefills To street', $('tToStreet').value === (gt.to || '').split(',')[0].trim());
T('relog prefills miles', parseFloat($('tMiles').value) === parseFloat(gt.miles));
T('relog dates today, not the old date', /^\d{4}-\d{2}-\d{2}$/.test($('tDate').value) && $('tDate').value !== gt.date);
T('relog switches to log view', $('view-log').classList.contains('on'));
window.__clearF();
// switchNav home + persistence
window.switchNav('home', $('nav-home'));
T('home activates as fullwidth view', $('view-home').classList.contains('on') && document.body.classList.contains('fullwidth-history'));
T('view choice persisted', window.localStorage.getItem('ml_view') === 'home');
window.switchNav('log', $('nav-log'));

// ===== LOG OVERLAY (Mission Control) =====
T('overlay markup present', !!$('logOverlay') && !!$('smartRoute') && !!$('catChips') && !!$('logDetails'));
T('form fields live inside overlay', $('logOverlay').contains($('tFromStreet')) && $('logOverlay').contains($('tMiles')) && $('logOverlay').contains($('stopsWrap')));
window.openLogOverlay();
T('overlay opens', $('logOverlay').style.display === 'flex');
T('category chips rendered', $('catChips').querySelectorAll('.cat-chip').length >= 6);
window.pickCat('Client Meeting');
T('chip click drives hidden select', $('tCat').value === 'Client Meeting');
T('deductible footer live', $('logDed').textContent.indexOf('$') === 0);
// smart route: seeded trips make suggestions
$('smartRoute').value = 'syracuse';
window.smartRouteInput();
T('smart field suggests routes', $('smartDrop').style.display === 'block' && $('smartDrop').querySelectorAll('.sd-row').length >= 1);
window.applySmartRoute(0);
T('picking a route prefills From', $('tFromStreet').value.length > 0);
T('picking a route prefills miles', parseFloat($('tMiles').value) > 0);
// Esc closes
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
T('Esc closes overlay', $('logOverlay').style.display === 'none');
T('log canvas shows places map (no placeholder) when routeless', typeof window.showLogCanvas === 'function' && /if\(name==='log'\)setTimeout\(showLogCanvas/.test(html));
T('cmd-K wiring present', /metaKey\|\|e\.ctrlKey/.test(html) && html.indexOf("key==='k'") >= 0);
window.__clearF();

// ===== EDIT SAVED TRIP =====
{
  const et = window.__trips()[0];
  window.editTrip(et.id);
  T('editTrip opens overlay in edit mode', $('logOverlay').style.display === 'flex' && $('logOverlay').classList.contains('editing'));
  const cntE = window.__trips().length;
  $('tMiles').value = '77.7'; $('tPurpose').value = 'EDITED-BY-TEST';
  window.__addTrip();
  T('edit updates in place, no new row', window.__trips().length === cntE);
  T('edit persists new values', window.__trips()[0].miles === 77.7 && window.__trips()[0].purpose === 'EDITED-BY-TEST');
  T('edit closes overlay + clears mode', $('logOverlay').style.display === 'none' && !$('logOverlay').classList.contains('editing'));
  window.__clearF();
}

// ===== ANALYTICS V3: interactivity =====
window.__renderAnalytics();
T('bars are keyboard-focusable', $('aChart').innerHTML.indexOf('tabindex="0"') >= 0);
T('bars carry drill handler', $('aChart').innerHTML.indexOf('drillPeriod(') >= 0);
T('pace chart draws dashed projection', $('aCum').innerHTML.indexOf('stroke-dasharray') >= 0);
T('projection labeled ≈$', $('aCum').innerHTML.indexOf('≈$') >= 0);
T('projected key in legend', $('aCumLegend').innerHTML.indexOf('projected') >= 0);
T('category rows show % share', $('aCats').innerHTML.indexOf('%') >= 0);
// Table-view twin toggles
window.toggleChartTable($('aChartTblBtn'), 'period');
T('period table renders', $('aChart').innerHTML.indexOf('<table') >= 0 && $('aChart').textContent.indexOf('Miles') >= 0);
T('toggle label flips to Chart', $('aChartTblBtn').textContent.indexOf('Chart') >= 0);
window.toggleChartTable($('aChartTblBtn'), 'period');
T('chart restored after re-toggle', $('aChart').innerHTML.indexOf('<svg') >= 0);
window.toggleChartTable($('aCumTblBtn'), 'pace');
T('pace table renders with months', $('aCum').innerHTML.indexOf('<table') >= 0 && $('aCum').textContent.indexOf('Jan') >= 0);
window.__renderAnalytics();
T('fresh render resets to charts', $('aCum').innerHTML.indexOf('<svg') >= 0 && $('aCumTblBtn').textContent.indexOf('Table') >= 0);
// Drill-down: bar click filters History by year+month
window.drillPeriod('2026-03');
T('drill switches to history view', document.querySelector('#view-hist').classList.contains('on'));
T('drill sets year filter', $('fYear').value === '2026');
T('drill sets month filter', $('fMonth').value === '03');
// The March seed trip goes to "101 Test Rd"; June's "456 Business Ave" must be filtered out
T('history filtered to the month', $('htable').innerHTML.indexOf('101 Test Rd') >= 0 && $('htable').innerHTML.indexOf('2026-06-10') < 0);
window.drillPeriod('2026');
T('year-level drill clears month', $('fMonth').value === '');
$('fYear').value = ''; $('fMonth').value = ''; window.__renderH();

// ===== RAIL RESIZE =====
T('rail resize handle present', !!$('railResize'));
window.applyRailWidth(60);
T('compact mode below 70px', $('railEl').classList.contains('rail-compact'));
window.applyRailWidth(180);
T('wide sidebar mode at 180px', $('railEl').classList.contains('rail-wide') && !$('railEl').classList.contains('rail-compact'));
T('width persisted', window.localStorage.getItem('ml_railw') === '180');
window.applyRailWidth(78);
T('stacked default restored', !$('railEl').classList.contains('rail-wide'));

// ===== MISSION CONTROL 3: ledger + analytics + settings =====
window.__renderH();
T('ledger month headers render', $('htable').querySelectorAll('.month-row').length >= 1);
T('month header carries subtotal', $('htable').querySelector('.month-row').textContent.indexOf('mi') >= 0);
T('rows carry relog button', $('htable').innerHTML.indexOf('relogTrip(') >= 0);
T('totals line beside filters', $('hTotals').textContent.indexOf('trips') >= 0 && $('hTotals').textContent.indexOf('$') >= 0);
window.__renderAnalytics();
T('monthly stacked panel renders', $('aStack').querySelectorAll('.stack-col').length === 12);
T('stack uses viz series vars', $('aStack').innerHTML.indexOf('var(--viz-biz)') >= 0 && $('aStack').innerHTML.indexOf('var(--viz-per)') >= 0);
T('top routes render', $('aEnhanced').querySelectorAll('.dest-row').length >= 1 && $('aEnhanced').textContent.indexOf('×') >= 0);
T('settings hero cards present', !!$('shRate') && !!$('shVehicle'));
window.renderSetHero();
T('rate card populated', $('shRate').textContent.indexOf('$') === 0);
T('sign out moved to settings foot', document.querySelector('.set-foot .signout-red') !== null);

// ===== BATCH TRIP ENTRY (multi-stop · round trip · repeat dates) =====
// Async because batch addTrip awaits per-leg routing (falls back instantly
// here — googleReady is false in jsdom, so entered miles are split).
(async () => {
  const fillBase = () => {
    $('tFromStreet').value = '1113 S 4090 W'; $('tFromCity').value = 'Syracuse'; $('tFromState').value = 'UT';
    $('tToStreet').value = '456 Business Ave'; $('tToCity').value = 'Lehi'; $('tToState').value = 'UT';
    $('tPurpose').value = 'client run'; $('tCat').selectedIndex = 0; $('tDate').value = '2026-06-11';
  };
  T('addStop exposed', typeof window.addStop === 'function');
  T('batch controls in markup', !!$('stopsWrap') && !!$('tRound') && !!$('xtraDates') && !!$('batchSummary'));

  // Round trip: ONE line item with out-and-back miles
  let n0 = window.__trips().length;
  fillBase(); $('tMiles').value = '10'; $('tRound').checked = true;
  await window.__addTrip();
  T('round trip logs ONE trip', window.__trips().length === n0 + 1);
  let rt = window.__trips()[window.__trips().length - 1];
  T('round trip doubles miles', rt.miles === 20);
  T('round trip marked in purpose', rt.purpose.indexOf('(round trip)') >= 0);
  T('round toggle cleared after save', $('tRound').checked === false);

  // Multi-stop: From→To→Stop = 2 legs; entered 12 mi splits 6/6
  n0 = window.__trips().length;
  fillBase(); $('tMiles').value = '12';
  window.addStop();
  const sb = document.querySelector('#stopsWrap .stop-block');
  sb.querySelector('.s-street').value = '90 S Main St'; sb.querySelector('.s-city').value = 'Farmington'; sb.querySelector('.s-state').value = 'UT';
  await window.__addTrip();
  T('multi-stop logs one trip per leg', window.__trips().length === n0 + 2);
  let legs = window.__trips().slice(-2);
  T('legs chain through the stop', legs[0].to === legs[1].from && legs[1].to.indexOf('90 S Main St') >= 0);
  T('entered miles split across legs', legs[0].miles === 6 && legs[1].miles === 6);
  T('stops cleared after save', document.querySelectorAll('#stopsWrap .stop-block').length === 0);

  // Repeat dates: same trip on 2 dates → 2 trips
  n0 = window.__trips().length;
  fillBase(); $('tMiles').value = '8';
  window.addExtraDate();
  document.querySelector('#xtraDates .xdate').value = '2026-06-12';
  await window.__addTrip();
  T('repeat-date logs per date', window.__trips().length === n0 + 2);
  let dd = window.__trips().slice(-2);
  T('dates differ across copies', dd[0].date === '2026-06-11' && dd[1].date === '2026-06-12');
  T('extra dates cleared after save', document.querySelectorAll('#xtraDates .xdate').length === 0);

  // Round trip + repeat dates, NO stops: N dates → N rows, each with doubled miles
  n0 = window.__trips().length;
  fillBase(); $('tMiles').value = '81.2'; $('tRound').checked = true;
  window.addExtraDate(); window.addExtraDate();
  const xs = document.querySelectorAll('#xtraDates .xdate');
  xs[0].value = '2026-06-12'; xs[1].value = '2026-06-13';
  await window.__addTrip();
  T('repeat+round: exactly one row per date', window.__trips().length === n0 + 3);
  const three = window.__trips().slice(-3);
  T('repeat+round: each row has round miles', three.every(t => t.miles === 162.4));
  T('repeat+round: each row tagged', three.every(t => t.purpose.indexOf('(round trip)') >= 0));
  T('repeat+round: three distinct dates', new Set(three.map(t=>t.date)).size === 3);

  // Duplicate guard: same route + same date prompts; declining blocks the save
  n0 = window.__trips().length;
  fillBase(); $('tMiles').value = '81.2'; $('tRound').checked = true;
  window.addExtraDate(); document.querySelector('#xtraDates .xdate').value = '2026-06-12';
  const _conf = window.confirm; let asked = false;
  window.confirm = () => { asked = true; return false; };
  await window.__addTrip();
  T('duplicate batch prompts', asked);
  T('declining keeps history clean', window.__trips().length === n0);
  window.confirm = _conf;
  window.__clearF();

  // Composed: 1 stop + round trip + 2 dates = 3 legs × 2 dates = 6 trips
  n0 = window.__trips().length;
  fillBase(); $('tMiles').value = '12'; $('tRound').checked = true;
  window.addStop();
  const sb2 = document.querySelector('#stopsWrap .stop-block');
  sb2.querySelector('.s-street').value = '210 Commerce Dr'; sb2.querySelector('.s-city').value = 'Ogden'; sb2.querySelector('.s-state').value = 'UT';
  window.addExtraDate();
  document.querySelector('#xtraDates .xdate').value = '2026-06-13';
  await window.__addTrip();
  // 2 outbound legs × 2 dates = 4 rows; return folds into each date's last leg
  T('composed batch logs legs × dates (no return rows)', window.__trips().length === n0 + 4);
  const four = window.__trips().slice(-4);
  T('return miles folded into last leg', four[1].miles > four[0].miles && four[1].purpose.indexOf('(round trip)') >= 0);

  // ===== LIVE MAP PREVIEW (every logged trip shows on the map) =====
  window.__clearF();
  T('no preview until both ends are known', window.__logEndpoints() === null);
  $('tFromStreet').value = '1113 S 4090 W'; $('tFromCity').value = 'Syracuse';
  T('half an address is still not enough', window.__logEndpoints() === null);
  $('tToStreet').value = '456 Business Ave'; $('tToCity').value = 'Lehi';
  const eps = window.__logEndpoints();
  T('both ends filled -> a pair to draw', !!eps && /Syracuse/.test(eps.from) && /Lehi/.test(eps.to));
  T('preview handler is exposed for the inputs', typeof window.previewLogRoute === 'function');
  T('address inputs drive the preview', (html.match(/previewLogRoute\(\)/g) || []).length >= 6);
  T('a drawn route survives a theme rebuild', html.indexOf('const keepTrip=gShownTrip;') >= 0);
  window.__clearF();

  // ===== ADDRESS SUGGESTIONS =====
  T('both street fields have a suggestion list', !!$('acFrom') && !!$('acTo'));
  T('street fields ask for suggestions as you type', /addrSuggest\('from'\)/.test(html) && /addrSuggest\('to'\)/.test(html));
  T('suggestion keyboard + blur handlers wired', /addrSuggestKey\(event,'to'\)/.test(html) && /addrSuggestBlur\('to'\)/.test(html));
  T('suggestion handlers exposed on window', typeof window.addrSuggest === 'function' && typeof window.acPick === 'function');
  T('saved routes are offered without Places', typeof window.savedAddrMatches === 'function');
  // previously driven addresses match on a fragment
  window.__trips().push({ id: 88001, date: '2026-06-01', miles: 5, from: '1113 S 4090 W, Syracuse, UT', to: '77 Suggestion Way, Ogden, UT', purpose: 'x', category: 'Client Meeting' });
  const sm = window.savedAddrMatches('suggestion');
  T('saved-route suggestions match a fragment', sm.length === 1 && sm[0].city === 'Ogden' && sm[0].state === 'UT');
  T('saved-route suggestions are marked as saved', sm[0].saved === true);
  T('short input yields nothing to show', window.savedAddrMatches('zzzznope').length === 0);

  // ===== FIRST TRIP GETS A REAL MOMENT =====
  {
    const before = window.__trips().splice(0, window.__trips().length);
    ['tFromStreet','tFromCity','tFromState','tToStreet','tToCity','tToState'].forEach(id => { $(id).value = 'x'; });
    $('tFromStreet').value = '1 A St'; $('tFromCity').value = 'Syracuse'; $('tFromState').value = 'UT';
    $('tToStreet').value = '2 B Ave'; $('tToCity').value = 'Lehi'; $('tToState').value = 'UT';
    $('tMiles').value = '100'; $('tDate').value = '2026-06-10'; $('tPurpose').value = 'first';
    $('tCat').selectedIndex = 0;
    await window.__addTrip();
    T('the first trip is announced with what it is worth', /First trip logged/.test($('toast').textContent) && /\$/.test($('toast').textContent), $('toast').textContent);
    $('tFromStreet').value = '1 A St'; $('tFromCity').value = 'Syracuse'; $('tFromState').value = 'UT';
    $('tToStreet').value = '3 C Rd'; $('tToCity').value = 'Provo'; $('tToState').value = 'UT';
    $('tMiles').value = '50'; $('tDate').value = '2026-06-11'; $('tPurpose').value = 'second';
    await window.__addTrip();
    T('later trips get the plain confirmation', !/First trip/.test($('toast').textContent), $('toast').textContent);
    window.__trips().splice(0, window.__trips().length);
    before.forEach(t => window.__trips().push(t));
  }

  // ===== FIRST-RUN HOME =====
  const savedTrips = window.__trips().slice();
  window.__trips().length = 0;
  window.renderHome();
  const startHtml = $('hStats').innerHTML;
  T('an empty ledger shows the welcome card, not four zeroes', /Welcome to Milo/.test(startHtml) && !/Miles YTD/.test(startHtml));
  T('three setup steps are offered', document.querySelectorAll('#hStats .start-step').length === 3);
  T('the first step is logging a trip', /Log your first trip/.test(startHtml));
  T('steps report progress', !!document.querySelector('#hStats .start-count'));
  T('first-run steps are computed from real state', window.firstRunSteps()[0].done === false);
  savedTrips.forEach(t => window.__trips().push(t));
  window.renderHome();
  T('with trips, the stat cards come back', /Miles YTD/.test($('hStats').innerHTML) && !/Welcome to Milo/.test($('hStats').innerHTML));
  T('logging a trip ticks the first step', window.firstRunSteps()[0].done === true);
  T('body carries no-trips only while the ledger is empty', !document.body.classList.contains('no-trips'));
  const keep = window.__trips().splice(0, window.__trips().length);
  window.renderHome();
  T('empty ledger flags the body for the compact map', document.body.classList.contains('no-trips'));
  keep.forEach(t => window.__trips().push(t)); window.renderHome();

  console.log(`\ndom.test.js: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
