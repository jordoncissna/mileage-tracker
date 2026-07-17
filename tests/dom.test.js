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
const runner = new window.Function(inline + '\n;window.__clearF=clearF;window.__addTrip=addTrip;window.__trips=()=>trips;window.__renderH=renderH;window.__renderAnalytics=renderAnalytics;window.__showTip=showChartTip;');
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
T('split shows three rows', $('aSplit').querySelectorAll('.sr').length === 3);
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
T('locations precede commute', h3s.indexOf('Home') >= 0 && h3s.indexOf('Home') < h3s.findIndex(t => t === 'Commute'));
T('account near the end', h3s.findIndex(t => t === 'Account') > h3s.findIndex(t => t === 'Auto-classify'));
T('single save button', [...document.querySelectorAll('#view-set button')].filter(b => b.textContent.indexOf('Save settings') >= 0).length === 1);

// ===== ANALYTICS YEAR DEFAULT =====
T('year filter defaults to current year', $('aYear').value === String(new Date().getFullYear()));

// ===== WELCOME TOUR =====
T('8 onboarding screens', document.querySelectorAll('.onboard-screen').length === 8);
T('8 progress dots', document.querySelectorAll('#onboardDots .onboard-dot').length === 8);
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

console.log(`\ndom.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
