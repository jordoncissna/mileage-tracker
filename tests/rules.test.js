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
T('commute value $0', deductibleValue(com) === 0);
T('commute detected', isCommute(com) === true);
T('override false deducts', deductibleValue(Object.assign({}, com, { isCommute: false })) > 0);
T('personal rule suggests', suggestFor({ id: 24, from: '', to: '250 Gym Way, Layton, UT', purpose: '', category: 'Other Business' })?.cat === PERSONAL_CAT);

console.log(`\nrules.test.js: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
