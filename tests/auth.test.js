// Auth-flow tests for Milo (Supabase Auth: email+password, GoTrue JWT
// sessions with SDK-managed refresh). Uses a controllable Supabase stub so
// every path — signup, login, session bootstrap, token refresh, sign-out,
// error cases — can be driven deterministically. Run: node auth.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://jordoncissna.github.io/mileage-tracker/' });
const { window } = dom;
const { document } = window;

// ---- stubs ----
window.google = { maps: { places: { Autocomplete: function () { return { addListener() {}, getPlace() { return {}; } }; }, AutocompleteService: function () { this.getPlacePredictions = () => {}; } }, Geocoder: function () { this.geocode = () => {}; }, Map: function () { this.addListener = () => {}; this.getCenter = () => ({}); this.getZoom = () => 10; }, Marker: function () {}, DirectionsService: function () { this.route = () => {}; }, DirectionsRenderer: function () { this.setMap = () => {}; }, LatLngBounds: function () { this.extend = () => {}; }, geometry: { spherical: { computeDistanceBetween: () => 1609 } }, event: { addListenerOnce: () => {} }, importLibrary: () => Promise.resolve({}), TravelMode: { DRIVING: 'DRIVING' } } };
window.QRCode = function () {};
const store = {};
window.localStorage = { getItem: k => k in store ? store[k] : null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, clear: () => { for (const k in store) delete store[k]; } };

// Controllable auth behavior: tests mutate `behavior` between calls.
const behavior = {
  signIn: { data: null, error: { message: 'stub: no behavior set' } },  // overridden per test
  signUp: { data: null, error: { message: 'stub: no behavior set' } },
  getSession: { data: { session: null }, error: null },
  oauth: { data: null, error: { message: 'stub: no behavior set' } },
};
const calls = { signIn: 0, signUp: 0, signOut: 0, reset: 0, oauth: 0, oauthProvider: null };
let authCb = null; // captured onAuthStateChange callback → lets tests fire GoTrue events

window.supabase = {
  createClient: () => ({
    auth: {
      getSession: async () => behavior.getSession,
      onAuthStateChange: (cb) => { authCb = cb; return { data: { subscription: { unsubscribe() {} } } }; },
      signInWithPassword: async () => { calls.signIn++; return behavior.signIn; },
      signInWithOAuth: async (opts) => { calls.oauth++; calls.oauthProvider = opts && opts.provider; return behavior.oauth; },
      signUp: async () => { calls.signUp++; return behavior.signUp; },
      signOut: async () => { calls.signOut++; return { error: null }; },
      resetPasswordForEmail: async () => { calls.reset++; return { data: {}, error: null }; },
      updateUser: async () => ({ data: {}, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }), insert: async () => ({ data: [{ id: 'x' }], error: null }), update: () => ({ eq: async () => ({ error: null }) }), delete: () => ({ eq: async () => ({ error: null }) }) }),
  }),
};

const inline = html.match(/<script>([\s\S]*?)<\/script>/g).pop().replace(/^<script>/, '').replace(/<\/script>$/, '');
const runner = new window.Function(inline + `
;window.__signIn=signIn;window.__signUp=signUp;window.__signOut=signOut;
window.__user=function(){return currentUser;};
window.__setUser=function(u){currentUser=u;};
window.__authErrorMessage=(typeof authErrorMessage==='function')?authErrorMessage:null;
`);
try { runner.call(window); } catch (e) { console.log('init threw (often benign):', e.message); }
// Fire DOMContentLoaded-dependent wiring (auth listeners bind there)
try { document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true })); } catch (e) {}

let pass = 0, fail = 0;
const T = (n, c) => { c ? pass++ : (fail++, console.log('FAIL:', n)); };
const $ = id => document.getElementById(id);
const errText = () => $('authError').textContent;
const errShown = () => $('authError').style.display === 'block';
const overlayShown = () => $('authOverlay').style.display !== 'none';
const setFields = (email, pwd, pwd2) => {
  $('authEmail').value = email; $('authPassword').value = pwd;
  if (pwd2 !== undefined && $('authPasswordConfirm')) $('authPasswordConfirm').value = pwd2;
};
const USER = { id: 'u-1', email: 'jordon@example.com', confirmed_at: '2026-01-01T00:00:00Z' };
const SESSION = { user: USER, access_token: 'jwt-a', refresh_token: 'rt-1', expires_at: Math.floor(Date.now() / 1000) + 3600 };

(async () => {
  T('auth state listener captured', typeof authCb === 'function');

  // ===== SIGNUP: client-side validation (no API call may fire) =====
  const su0 = calls.signUp;
  setFields('', 'Passw0rdX', 'Passw0rdX'); await window.__signUp();
  T('signup blocks empty email', errShown() && calls.signUp === su0);
  setFields('a@b.co', 'short1A', 'short1A'); await window.__signUp();
  T('signup blocks short password', errShown() && calls.signUp === su0);
  setFields('a@b.co', 'passw0rdlong', 'passw0rdlong'); await window.__signUp();
  T('signup requires uppercase', errShown() && calls.signUp === su0);
  setFields('a@b.co', 'PASSW0RDLONG', 'PASSW0RDLONG'); await window.__signUp();
  T('signup requires lowercase', errShown() && calls.signUp === su0);
  setFields('a@b.co', 'PasswordLong', 'PasswordLong'); await window.__signUp();
  T('signup requires a number', errShown() && calls.signUp === su0);
  setFields('a@b.co', 'Passw0rdX', 'Different1X'); await window.__signUp();
  T('signup blocks mismatched confirm', errShown() && calls.signUp === su0);

  // ===== SIGNUP: server outcomes =====
  behavior.signUp = { data: { user: { id: 'u-2', email: 'a@b.co', confirmed_at: null } }, error: null };
  setFields('a@b.co', 'Passw0rdX', 'Passw0rdX'); await window.__signUp();
  T('signup unconfirmed → check-your-email', errText().toLowerCase().indexOf('check your email') >= 0);
  T('signup unconfirmed does NOT sign in', !window.__user());

  behavior.signUp = { data: null, error: { message: 'User already registered' } };
  setFields('a@b.co', 'Passw0rdX', 'Passw0rdX'); await window.__signUp();
  T('signup duplicate account shows error', errShown() && errText().length > 0);

  // ===== LOGIN: client-side validation (SHOULD fail fast, no API call) =====
  const si0 = calls.signIn;
  setFields('', ''); await window.__signIn();
  T('login blocks empty fields without API call', errShown() && calls.signIn === si0);

  // ===== LOGIN: error cases get human messages, not raw GoTrue strings =====
  behavior.signIn = { data: null, error: { message: 'Invalid login credentials' } };
  setFields('a@b.co', 'WrongPass1'); await window.__signIn();
  T('wrong password → friendly message', errShown() && errText().indexOf('Incorrect email or password') >= 0);

  behavior.signIn = { data: null, error: { message: 'Email not confirmed' } };
  setFields('a@b.co', 'Passw0rdX'); await window.__signIn();
  T('unconfirmed login → confirm-email hint', errText().toLowerCase().indexOf('confirm') >= 0 && errText().indexOf('Email not confirmed') < 0);

  behavior.signIn = { data: null, error: { message: 'Failed to fetch' } };
  setFields('a@b.co', 'Passw0rdX'); await window.__signIn();
  T('network failure → offline message', errText().toLowerCase().indexOf('offline') >= 0 || errText().toLowerCase().indexOf('connection') >= 0);

  behavior.signIn = { data: null, error: { message: 'For security purposes, you can only request this after 42 seconds.' } };
  setFields('a@b.co', 'Passw0rdX'); await window.__signIn();
  T('rate limit → wait-and-retry message', errText().toLowerCase().indexOf('try again') >= 0 || errText().toLowerCase().indexOf('wait') >= 0);

  // ===== LOGIN: success =====
  behavior.signIn = { data: { user: USER, session: SESSION }, error: null };
  setFields('jordon@example.com', 'Passw0rdX'); await window.__signIn();
  T('login success sets currentUser', window.__user() && window.__user().email === 'jordon@example.com');
  T('login success hides overlay', !overlayShown());
  T('login success shows email in topbar', $('userEmail').textContent === 'jordon@example.com');

  // ===== TOKEN REFRESH (GoTrue events) =====
  const rotated = { user: { ...USER, email: 'jordon@example.com' }, access_token: 'jwt-b', refresh_token: 'rt-2' };
  window.__setUser({ ...USER, stale: true });
  authCb('TOKEN_REFRESHED', rotated);
  T('TOKEN_REFRESHED syncs currentUser', window.__user() && !window.__user().stale);

  const renamed = { ...SESSION, user: { ...USER, email: 'new@example.com' } };
  authCb('USER_UPDATED', renamed);
  T('USER_UPDATED syncs currentUser', window.__user() && window.__user().email === 'new@example.com');
  T('USER_UPDATED refreshes topbar email', $('userEmail').textContent === 'new@example.com');

  // ===== SESSION EXPIRY / SIGN OUT =====
  authCb('SIGNED_OUT', null);
  T('expired session shows login overlay', overlayShown());
  T('expired session clears currentUser', !window.__user());

  authCb('SIGNED_IN', SESSION);
  T('SIGNED_IN event signs user in', window.__user() && !overlayShown());
  await window.__signOut();
  T('signOut calls API and clears user', calls.signOut >= 1 && !window.__user() && overlayShown());

  // ===== PASSWORD RECOVERY =====
  authCb('PASSWORD_RECOVERY', SESSION);
  T('recovery event shows recovery card', $('recoveryCard') && $('recoveryCard').style.display === 'flex');

  // ===== OAUTH (social sign-in) =====
  T('social buttons in markup', document.querySelectorAll('.auth-social-btn').length === 3);
  T('socialSignIn exposed', typeof window.socialSignIn === 'function');
  behavior.oauth = { data: null, error: { message: 'Unsupported provider: provider is not enabled' } };
  await window.socialSignIn('google');
  T('oauth passes provider through', calls.oauth === 1 && calls.oauthProvider === 'google');
  T('disabled provider → friendly setup message', errText().indexOf('isn’t set up yet') >= 0 || errText().indexOf('not set up yet') >= 0);
  behavior.oauth = { data: { url: 'https://accounts.google.com/o/oauth2/auth?...' }, error: null };
  $('authError').style.display = 'none'; $('authError').textContent = '';
  await window.socialSignIn('google');
  T('oauth success shows no error', $('authError').textContent === '');

  // ===== ERROR MAPPER (unit) =====
  T('authErrorMessage exists', typeof window.__authErrorMessage === 'function');
  if (window.__authErrorMessage) {
    const m = window.__authErrorMessage;
    T('maps invalid creds', m({ message: 'Invalid login credentials' }).indexOf('Incorrect') >= 0);
    T('maps network error', m({ message: 'NetworkError when attempting to fetch resource.' }).toLowerCase().indexOf('offline') >= 0 || m({ message: 'NetworkError when attempting to fetch resource.' }).toLowerCase().indexOf('connection') >= 0);
    T('maps offline stub', m({ message: 'Supabase SDK unavailable (offline)' }).toLowerCase().indexOf('offline') >= 0);
    T('unknown errors pass through', m({ message: 'Some novel error' }).indexOf('Some novel error') >= 0);
    T('handles missing message', typeof m({}) === 'string' && m({}).length > 0);
  } else { fail += 5; console.log('FAIL: 5 mapper tests skipped — authErrorMessage missing'); }

  console.log(`\nauth.test.js: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
