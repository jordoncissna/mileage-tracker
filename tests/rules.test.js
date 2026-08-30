// Pure-logic tests for Milo. Extracts functions from ../index.html and evals
// them in isolation (no DOM, no network). Run: node rules.test.js
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script>([\s\S]*?)<\/script>/g).pop()
  .replace(/^<script>/, '').replace(/<\/script>$/, '');

function grab(name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error('missing function: ' + name);
  let depth = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') depth++;
    if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
}

// minimal environment
let cfg = { home: '1113 S 4090 W, Syracuse, UT', office: '500 Main St, Farmington, UT', commuteEnabled: true, commuteExclude: true, rules: [], ruleDismissed: {} };
const PERSONAL_CAT = 'Personal (Non-deductible)';
eval(grab('normalizeAddr'));
eval(grab('addrMatches'));
eval(grab('isCommute'));
eval(grab('isPersonal'));
eval(grab('tripKey'));
eval(grab('ruleMatches'));
eval(grab('suggestFor'));
eval(grab('deductibleValue').replace('rate(trip.date)', '0.70'));
eval(grab('deductibleMiles'));

let pass = 0, fail = 0;
const T = (name, cond) => { cond ? pass++ : (fail++, console.log('FAIL:', name)); };

cfg.rules = [
  { id: 1, name: 'Lehi office', to: '456 Business Ave', cat: 'Office Visit' },
  { id: 2, name: 'Acme work', kw: 'acme', cat: 'Client Meeting' },
  { id: 3, name: 'gym', to: '250 Gym Way', cat: PERSONAL_CAT },
  { id: 4, name: 'combo', from: '1113 S 4090 W', kw: 'bank', cat: 'Bank / Finance' }
];

T('dest exact', suggestFor({ id: 10, from: 'x', to: '456 Business Ave, Lehi, UT', purpose: '', category: '' })?.id === 1);
T('dest fuzzy', suggestFor({ id: 11, from: 'x', to: '456 business avenue lehi', purpose: '', category: '' })?.id === 1);
T('no match', suggestFor({ id: 12, from: '900 Oak Dr, Ogden, UT', to: '77 Pine Rd, Provo, UT', purpose: 'lunch', category: '' }) === null);
T('kw case-insensitive', suggestFor({ id: 13, from: '', to: '', purpose: 'Met with ACME Corp', category: '' })?.id === 2);
T('already classified', suggestFor({ id: 14, from: '', to: '456 Business Ave', purpose: '', category: 'Office Visit' }) === null);
T('reclassify', suggestFor({ id: 15, from: '', to: '456 Business Ave', purpose: '', category: 'Other Business' })?.id === 1);
cfg.ruleDismissed['16:1'] = true;
T('dismissed skips', suggestFor({ id: 16, from: '', to: '456 Business Ave', purpose: '', category: '' }) === null);
cfg.ruleDismissed['supa-99:1'] = true;
T('dismiss by supaId', suggestFor({ id: 17, supaId: 'supa-99', to: '456 Business Ave', from: '', purpose: '', category: '' }) === null);
T('AND both', suggestFor({ id: 18, from: '1113 S 4090 W, Syracuse, UT', to: '', purpose: 'bank deposit', category: '' })?.id === 4);
T('AND half fails', suggestFor({ id: 19, from: '1113 S 4090 W, Syracuse, UT', to: '', purpose: 'lunch', category: '' }) === null);
T('empty rule never matches', ruleMatches({ id: 5, cat: 'X' }, { from: 'a', to: 'b', purpose: 'c' }) === false);
T('first rule wins', suggestFor({ id: 20, from: '', to: '456 Business Ave', purpose: 'acme', category: '' })?.id === 1);

const p = { id: 21, date: '2026-06-01', miles: 10, category: PERSONAL_CAT, from: '', to: '' };
T('personal flag', isPersonal(p) === true);
T('personal value $0', deductibleValue(p) === 0);
T('personal miles 0', deductibleMiles(p) === 0);
const biz = { id: 22, date: '2026-06-01', miles: 10, category: 'Client Meeting', from: '', to: '' };
T('business value', Math.abs(deductibleValue(biz) - 7.0) < 1e-9);
T('business miles', deductibleMiles(biz) === 10);
const com = { id: 23, date: '2026-06-01', miles: 12, category: 'Office Visit', from: '1113 S 4090 W, Syracuse, UT', to: '500 Main St, Farmington, UT' };
// Commute concept removed (owner decision): Home↔Office trips are ordinary
// business write-offs; Personal is the only $0 path.
T('home↔office trip deducts fully', Math.abs(deductibleValue(com) - 8.4) < 1e-9);
T('commute never auto-detected', isCommute(com) === false);
T('legacy isCommute override ignored', isCommute(Object.assign({}, com, { isCommute: true })) === false);
T('personal rule suggests', suggestFor({ id: 24, from: '', to: '250 Gym Way, Layton, UT', purpose: '', category: 'Other Business' })?.cat === PERSONAL_CAT);

// ===== HTML ESCAPING =====
eval(grab('esc'));
T('esc angle brackets', esc('<img onerror=x>') === '&lt;img onerror=x&gt;');
T('esc quotes', esc('a "b" \'c\'') === 'a &quot;b&quot; &#39;c&#39;');
T('esc ampersand', esc('A & B') === 'A &amp; B');
T('esc null/undefined', esc(null) === '' && esc(undefined) === '');
T('esc plain passthrough', esc('1113 S 4090 W, Syracuse, UT') === '1113 S 4090 W, Syracuse, UT');

// ===== CSV CELL ESCAPING =====
eval(grab('csvCell'));
eval(grab('parseCsvLine'));
T('csv doubles quotes', csvCell('Lunch at "The Grid"') === '"Lunch at ""The Grid"""');
T('csv plain', csvCell('Client Meeting') === '"Client Meeting"');
T('csv formula guarded', csvCell('=HYPERLINK("evil")') === '"\'=HYPERLINK(""evil"")"');
T('csv negative-looking text guarded', csvCell('@cmd') === '"\'@cmd"');
T('csv numbers not guarded', csvCell('-5.5') === '"-5.5"' && csvCell('15.0') === '"15.0"');
T('csv null empty', csvCell(null) === '""');

// ===== CSV LINE PARSING (round-trip) =====
const cells = ['2026-06-10', 'Lunch at "The Grid"', 'a, b', 'plain'];
const line = cells.map(csvCell).join(',');
const parsed = parseCsvLine(line);
T('round-trip quoted quote', parsed[1] === 'Lunch at "The Grid"');
T('round-trip embedded comma', parsed[2] === 'a, b');
T('round-trip plain', parsed[0] === '2026-06-10' && parsed[3] === 'plain');
T('parse unquoted line', parseCsvLine('a,b,c').join('|') === 'a|b|c');
T('parse empty cells', parseCsvLine('a,,c').length === 3 && parseCsvLine('a,,c')[1] === '');

// ===== AXIS SCALING =====
eval(grab('niceCeil'));
T('niceCeil zero', niceCeil(0) === 1);
T('niceCeil exact 1', niceCeil(1) === 1);
T('niceCeil 7 -> 10', niceCeil(7) === 10);
T('niceCeil 43 -> 50', niceCeil(43) === 50);
T('niceCeil 180 -> 200', niceCeil(180) === 200);
T('niceCeil 2400 -> 2500', niceCeil(2400) === 2500);
T('niceCeil 999 -> 1000', niceCeil(999) === 1000);
T('niceCeil negative -> 1', niceCeil(-5) === 1);

// ===== PWA FILES =====
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
T('manifest has name', manifest.name && manifest.short_name === 'Milo');
T('manifest relative start_url', manifest.start_url === './' && manifest.scope === './');
T('manifest standalone', manifest.display === 'standalone');
T('manifest has 3 icons incl maskable', manifest.icons.length === 3 && manifest.icons.some(i => i.purpose === 'maskable'));
manifest.icons.forEach(i => T('icon exists: ' + i.src, fs.existsSync(path.join(__dirname, '..', i.src))));
T('apple touch icon exists', fs.existsSync(path.join(__dirname, '..', 'icons/apple-touch-icon.png')));
const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
T('sw handles install/activate/fetch', ['install', 'activate', 'fetch'].every(ev => sw.indexOf("addEventListener('" + ev + "'") >= 0));
T('sw never caches supabase API', sw.indexOf('supabase.co') >= 0);
T('index links manifest', html.indexOf('rel="manifest"') >= 0);
T('index registers sw', html.indexOf("serviceWorker.register('sw.js')") >= 0 || html.indexOf('serviceWorker.register("sw.js")') >= 0);
T('supabase client is guarded', html.indexOf('window.supabase&&window.supabase.createClient') >= 0);
T('offline unsynced trips preserved', html.indexOf('trips.filter(t=>!t.supaId&&!t._saving)') >= 0);
T('sync load is single-flight', html.indexOf('if(_supaLoading)return;') >= 0);

// ===== TAX REPORT =====
eval(grab('fmt'));
eval(grab('yr'));
eval(grab('rate'));
cfg.rates = { 2026: 0.70, 2025: 0.70 };
cfg.biz = 'Ridgeline Management Group';
cfg.vehicle = 'Tesla';
let trips = [
  { id: 1, date: '2026-03-10', miles: 10, from: '456 Business Ave, Lehi, UT', to: '90 S Main St, Farmington, UT', purpose: 'Met <b>client</b> re: contract', category: 'Client Meeting' },
  { id: 2, date: '2026-01-05', miles: 12, from: '1113 S 4090 W, Syracuse, UT', to: '500 Main St, Farmington, UT', purpose: 'to office', category: 'Office Visit' },
  { id: 3, date: '2026-05-02', miles: 5, from: '', to: '250 Gym Way', purpose: 'gym', category: PERSONAL_CAT },
];
cfg.office = '500 Main St, Farmington, UT';
eval(grab('buildTaxReportHTML'));
const rpt = buildTaxReportHTML(2026);
T('report titled with year', rpt.indexOf('Tax Year 2026') >= 0);
T('report shows business name', rpt.indexOf('Ridgeline Management Group') >= 0);
T('report deduction total $15.40 (home↔office now deducts)', rpt.indexOf('$15.40') >= 0);
T('no commute exclusions in report', rpt.indexOf('Commute §262') < 0);
T('personal marked excluded', rpt.indexOf('(Personal)') >= 0);
T('report escapes user HTML', rpt.indexOf('&lt;b&gt;client&lt;/b&gt;') >= 0 && rpt.indexOf('<b>client</b>') < 0);
T('chronological order', rpt.indexOf('01/05/26') < rpt.indexOf('03/10/26'));
T('signature block present', rpt.indexOf('Taxpayer signature') >= 0);
T('274(d) substantiation note', rpt.indexOf('§274(d)') >= 0 || rpt.indexOf('274(d)') >= 0);
T('empty year message', buildTaxReportHTML(2019).indexOf('No trips recorded') >= 0);
T('miles totals correct', rpt.indexOf('27.0') >= 0 && rpt.indexOf('10.0') >= 0);

// ===== UNLOGGED-DAY NUDGE =====
// Dates are the easy thing to get silently wrong here, so this pins the
// arithmetic against a fixed "today" of Wednesday 2026-06-17.
// the tuning constants live beside the function in index.html
const nudgeConsts = html.match(/var NUDGE_LOOKBACK=[^\n]+/)[0];
eval(nudgeConsts);
eval(grab('dayISO'));
eval(grab('gapDays'));
T('nudge constants extracted from index.html', NUDGE_LOOKBACK === 14 && NUDGE_MIN_TRIPS === 5 && NUDGE_MAX === 5);
const TODAY = '2026-06-17';           // a Wednesday
const dayOf = iso => new Date(iso + 'T12:00').getDay();
T('the reference day is a Wednesday', dayOf(TODAY) === 3);

// a Mon-Fri driver: trips on the two prior weeks' weekdays, nothing since Friday
trips = [];
['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05',
 '2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-12']
  .forEach((d, i) => trips.push({ id: i + 1, date: d, miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' }));
cfg.nudgeOff = false;

let gaps = gapDays(TODAY);
T('gaps found for the weekdays since the last trip', gaps.length === 2, gaps.join(','));
T('gaps are Mon 6/15 and Tue 6/16', gaps.join(',') === '2026-06-16,2026-06-15', gaps.join(','));
T('today is never reported as a gap', gaps.indexOf(TODAY) < 0);
T('no weekend days for a Mon-Fri driver', gaps.every(g => dayOf(g) !== 0 && dayOf(g) !== 6));

// a weekend driver: every weekend logged except Sat 6/13, and no weekday nagging
trips = [];
['2026-05-30','2026-05-31','2026-06-06','2026-06-07','2026-06-14']
  .forEach((d, i) => trips.push({ id: 100 + i, date: d, miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' }));
gaps = gapDays(TODAY);
T('a weekend driver is only asked about weekends', gaps.every(g => dayOf(g) === 0 || dayOf(g) === 6), gaps.join(','));
T('the one missed weekend day is caught', gaps.join(',') === '2026-06-13', gaps.join(','));
// and with every weekend logged there is nothing to say
trips.push({ id: 150, date: '2026-06-13', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' });
T('a diligent weekend driver is never nagged', gapDays(TODAY).length === 0);

// a fully logged stretch produces nothing
trips = [];
for (let i = 1; i <= 20; i++) {
  const d = new Date(new Date(TODAY + 'T12:00').getTime() - i * 864e5);
  trips.push({ id: 200 + i, date: dayISO(d), miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' });
}
T('nothing to nag about when every day is logged', gapDays(TODAY).length === 0);

// quiet for a new user with no pattern yet
trips = [{ id: 300, date: '2026-06-15', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' }];
T('a new user with a handful of trips is left alone', gapDays(TODAY).length === 0);

// the setting switches it off entirely
trips = [];
['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-08','2026-06-09']
  .forEach((d, i) => trips.push({ id: 400 + i, date: d, miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' }));
T('gaps exist before the setting is applied', gapDays(TODAY).length > 0);
cfg.nudgeOff = true;
T('the setting silences it', gapDays(TODAY).length === 0);
cfg.nudgeOff = false;

// never looks further back than the window, and never returns a flood
trips = [{ id: 500, date: '2026-01-05', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' },
         { id: 501, date: '2026-06-01', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' },
         { id: 502, date: '2026-06-02', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' },
         { id: 503, date: '2026-06-03', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' },
         { id: 504, date: '2026-06-04', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' },
         { id: 505, date: '2026-06-05', miles: 10, from: 'a', to: 'b', purpose: 'x', category: 'Client Meeting' }];
const many = gapDays(TODAY);
T('at most five days are ever listed', many.length <= 5, String(many.length));
T('nothing older than the lookback window', many.every(g => g >= '2026-06-03'), many.join(','));
T('gaps are newest first', many.join(',') === many.slice().sort().reverse().join(','));

// ===== CLAIMS THE APP CAN ACTUALLY BACK =====
// Onboarding used to promise background GPS tracking this app has never had,
// and the sign-in screen claimed end-to-end encryption it does not provide.
T('no promise of automatic/background trip capture', !/automatically captures|background tracking|auto-tracking/i.test(html));
T('no end-to-end encryption claim', !/end-to-end encryption/i.test(html));
T('security claim is one we can stand behind', /Encrypted in transit and at rest/.test(html));

console.log(`\nrules.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
