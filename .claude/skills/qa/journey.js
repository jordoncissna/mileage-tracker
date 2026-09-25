// End-to-end journey for Milo, over HTTP (never file://, which CLAUDE.md warns
// is not the deployed origin). One continuous story:
// a person arrives signed out, logs trips, corrects one, deletes one, exports,
// prints a tax report, uses it on a phone, and reloads at every step the way a
// real person does. Counts rows; never asserts on adjectives.
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const { chromium } = require(path.resolve(root, 'tests/node_modules/playwright-core'));
const INIT = require('fs').readFileSync(path.resolve(root, '.claude/skills/qa/harness.js'), 'utf8')
  .match(/const INIT = `([\s\S]*?)\n`;/)[1];
// Serve the repo first, then run this:
//   python3 -m http.server 8899 --bind 127.0.0.1 &
//   node .claude/skills/qa/journey.js
const APP = process.env.MILO_URL || 'http://127.0.0.1:8899/index.html';

const results = [];
process.on('unhandledRejection', e => { R('no unhandled rejection during the journey', false, String(e).slice(0, 140)); });
const R = (name, ok, note = '') => results.push({ name, ok: !!ok, note: String(note) });
const ask = async (p, fn, fb = null, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { return fb; } };
const settle = p => p.waitForTimeout(350);

// poll for a condition instead of sleeping on it
async function until(p, fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ask(p, fn, false)) return true; await p.waitForTimeout(100); }
  return false;
}
const trips = p => ask(p, () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'), []);
const srvRows = p => ask(p, () => JSON.parse(localStorage.getItem('qa_srv') || '[]'), []);
const rows = p => ask(p, () => document.querySelectorAll('#htable .route-cell').length, -1);

async function boot(p) {
  await ask(p, () => {
    ['authOverlay', 'onboardOverlay'].forEach(i => { const e = document.getElementById(i); if (e) { e.style.display = 'none'; e.classList.remove('active'); } });
    if (window.initGoogleMaps) window.initGoogleMaps();
  });
  await p.waitForTimeout(1500);
}
const nav = async (p, v) => { await ask(p, v => window.switchNav(v, document.getElementById('nav-' + v)), null, v); await settle(p); };

async function logTrip(p, o) {
  await ask(p, () => { if (window.openLogOverlay) window.openLogOverlay(); });
  await p.waitForTimeout(400);
  await ask(p, (o) => {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('tDate', o.date); set('tMiles', String(o.miles));
    set('tFromStreet', '1113 S 4090 W'); set('tFromCity', 'Syracuse'); set('tFromState', 'UT');
    set('tToStreet', o.to); set('tToCity', o.city || 'Lehi'); set('tToState', 'UT');
    set('tPurpose', o.purpose);
    const c = document.getElementById('tCat'); if (c) c.value = o.cat || 'Client Meeting';
    const r = document.getElementById('tRound'); if (r) r.checked = !!o.round;
    if (window.buildAddr) window.buildAddr();
  }, null, o);
  await p.waitForTimeout(200);
  await ask(p, () => window.addTrip && window.addTrip());
  await p.waitForTimeout(700);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 880 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  let dialogPolicy = 'accept', lastDialog = null;
  page.on('dialog', async d => {
    lastDialog = d.message();
    try { await (dialogPolicy === 'dismiss' ? d.dismiss() : d.accept()); } catch (e) {}
  });

  // ═══ ACT 1 — arrival, signed out ═══════════════════════════════════════
  const consoleErrs = [], badResponses = [];
  page.on('console', m => { const t = m.text(); if (m.type() === 'error' && !/ERR_FAILED|ERR_ABORTED|googleapis|gstatic|jsdelivr/.test(t)) consoleErrs.push(t.slice(0, 130)); });
  page.on('response', r => { if (r.status() >= 400 && !/googleapis|gstatic|jsdelivr/.test(r.url())) badResponses.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
  page.on('requestfailed', r => { if (!/googleapis|gstatic|jsdelivr/.test(r.url())) badResponses.push('FAILED ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
  await page.route(/googleapis|gstatic|jsdelivr/, r => r.abort());

  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);

  R('the page serves and no same-origin request fails', badResponses.length === 0, badResponses.slice(0, 4).join(' | '));
  R('nothing throws to the console on first load', consoleErrs.length === 0, consoleErrs.slice(0, 3).join(' | '));
  // The shared stub signs a user in 30ms after load, so this page is never
  // really signed out. Open a second one whose session is genuinely absent.
  const out = await ctx.newPage();
  await out.addInitScript(() => {
    const orig = window.supabase.createClient;
    window.supabase.createClient = function () {
      const c = orig.apply(this, arguments);
      c.auth.getSession = async () => ({ data: { session: null } });
      c.auth.onAuthStateChange = (cb) => { setTimeout(() => cb('SIGNED_OUT', null), 30); return { data: { subscription: { unsubscribe() {} } } }; };
      return c;
    };
  });
  await out.route(/googleapis|gstatic|jsdelivr/, r => r.abort());
  await out.goto(APP, { waitUntil: 'domcontentloaded' });
  await out.waitForTimeout(2300);
  const auth = await ask(out, () => {
    const o = document.getElementById('authOverlay');
    const vis = o && getComputedStyle(o).display !== 'none' && o.getBoundingClientRect().height > 0;
    return { vis: !!vis,
      email: !!document.querySelector('#authOverlay input[type="email"]'),
      pass: !!document.querySelector('#authOverlay input[type="password"]'),
      terms: !!document.querySelector('#authOverlay a[href*="terms"]'),
      ledgerHidden: (() => { const t = document.getElementById('htable'); return !t || t.getBoundingClientRect().height === 0 || !!(o && o.contains(document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2))); })() };
  });
  R('a signed-out visitor gets the sign-in screen', !!auth && auth.vis && auth.email && auth.pass, JSON.stringify(auth));
  R('a signed-out visitor cannot see the ledger', !!auth && auth.ledgerHidden === true, JSON.stringify(auth));
  R('the sign-in screen links the Terms', !!auth && auth.terms);
  await out.close();

  await boot(page);

  // ═══ ACT 2 — first trip ════════════════════════════════════════════════
  await logTrip(page, { date: '2026-06-01', miles: 15, to: '456 Business Ave', purpose: 'First client meeting' });
  await nav(page, 'hist');
  await until(page, () => document.querySelectorAll('#htable .route-cell').length >= 1);
  R('one plain trip makes exactly one line item', (await rows(page)) === 1, `rows=${await rows(page)}`);
  let t = await trips(page);
  R('the trip carries the four things the IRS asks for',
    t.length === 1 && t[0].date === '2026-06-01' && t[0].miles === 15 && !!t[0].from && !!t[0].to && !!t[0].purpose,
    JSON.stringify(t[0] && { d: t[0].date, m: t[0].miles, p: t[0].purpose }));
  R('it reached the server', (await srvRows(page)).length === 1, `server rows=${(await srvRows(page)).length}`);

  // ═══ ACT 3 — a round trip is ONE line, with doubled miles ══════════════
  await logTrip(page, { date: '2026-06-02', miles: 20, to: '900 Return Rd', purpose: 'Round trip', round: true });
  await nav(page, 'hist');
  await until(page, () => document.querySelectorAll('#htable .route-cell').length >= 2);
  t = await trips(page);
  const rt = t.filter(x => x.date === '2026-06-02');
  R('a round trip is one row, not two', rt.length === 1, `rows for that date=${rt.length}`);
  R('and its miles are doubled', rt.length === 1 && rt[0].miles === 40, `miles=${rt[0] && rt[0].miles}`);
  R('the ledger now shows exactly 2 trips', (await rows(page)) === 2, `rows=${await rows(page)}`);

  // ═══ ACT 4 — the duplicate guard ═══════════════════════════════════════
  lastDialog = null; dialogPolicy = 'dismiss';
  await logTrip(page, { date: '2026-06-01', miles: 15, to: '456 Business Ave', purpose: 'First client meeting' });
  await page.waitForTimeout(600);
  dialogPolicy = 'accept';
  R('saving the same route on the same date warns first',
    !!lastDialog && /already|duplicate|same/i.test(lastDialog), lastDialog || 'NO DIALOG FIRED');
  await nav(page, 'hist');
  R('and dismissing the warning does not add a row', (await rows(page)) === 2, `rows=${await rows(page)}`);

  // ═══ ACT 5 — reading the ledger: column resize ═════════════════════════
  const grip = await ask(page, () => {
    const h = document.querySelector('#htable th .col-resizer[data-col="route"]');
    if (!h) return null; const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const rw = () => ask(page, () => { const c = document.querySelector('#htable .route-cell'); return c ? Math.round(c.getBoundingClientRect().width) : -1; }, -1);
  const w0 = await rw();
  if (grip) { await page.mouse.move(grip.x, grip.y); await page.mouse.down(); await page.mouse.move(grip.x + 200, grip.y, { steps: 8 }); await page.mouse.up(); }
  await until(page, () => true, 300);
  const w1 = await rw();
  R('the Route column can be dragged wider', w1 - w0 > 140, `${w0}px -> ${w1}px`);

  // ═══ ACT 6 — export matches what is on screen ══════════════════════════
  const csv = await ask(page, () => {
    let captured = null;
    const realCreate = URL.createObjectURL;
    URL.createObjectURL = b => { captured = b; return 'blob:qa'; };
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {};
    try { window.doExport && window.doExport(); } catch (e) {}
    URL.createObjectURL = realCreate; HTMLAnchorElement.prototype.click = realClick;
    return captured ? captured.text() : null;
  });
  const csvLines = csv ? csv.trim().split('\n') : [];
  R('Export CSV produces a file', csvLines.length > 1, `lines=${csvLines.length}`);
  R('the CSV has one data row per trip on screen', csvLines.length - 1 === 2, `data rows=${csvLines.length - 1}, on screen=2`);
  R('the CSV header carries the audit columns',
    /Date/.test(csvLines[0] || '') && /Purpose/.test(csvLines[0] || '') && /Miles/.test(csvLines[0] || '') && /Vehicle/.test(csvLines[0] || ''),
    (csvLines[0] || '').slice(0, 90));
  R('the CSV has no Commute column', !/commute/i.test(csvLines[0] || ''));

  // ═══ ACT 7 — the tax report ════════════════════════════════════════════
  const rpt = await ask(page, () => window.buildTaxReportHTML ? window.buildTaxReportHTML('2026') : null, null);
  R('the tax report builds', !!rpt && rpt.length > 500, `chars=${rpt ? rpt.length : 0}`);
  R('it cites the substantiation rule', /274\(d\)/.test(rpt || ''));
  R('it names US federal scope', /United States federal/i.test(rpt || ''));
  R('it contains no commute language', !/commute/i.test(rpt || ''));
  R('it lists both trips', ((rpt || '').match(/First client meeting|Round trip/g) || []).length >= 2,
    `mentions=${((rpt || '').match(/First client meeting|Round trip/g) || []).length}`);

  // ═══ ACT 8 — correcting a trip, then reloading IMMEDIATELY ═════════════
  const preEdit = await trips(page);
  R('there is a trip to edit at this point', preEdit.length > 0, `trips=${preEdit.length}`);
  const editId = preEdit.length ? preEdit[0].id : null;
  if (editId !== null) await ask(page, (id) => window.editTrip && window.editTrip(id), null, editId);
  await page.waitForTimeout(500);
  await ask(page, () => { const el = document.getElementById('tPurpose'); if (el) el.value = 'Corrected purpose'; });
  await ask(page, () => window.addTrip && window.addTrip());
  await page.waitForTimeout(800);
  const countBeforeReload = (await trips(page)).length;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200); await boot(page); await nav(page, 'hist');
  await until(page, () => document.querySelectorAll('#htable .route-cell').length >= 2);
  t = await trips(page);
  R('an edit survives an immediate reload', t.some(x => x.purpose === 'Corrected purpose'),
    t.map(x => x.purpose).join(' | '));
  R('and editing did not grow the ledger', t.length === countBeforeReload && t.length === 2, `trips=${t.length}`);

  // ═══ ACT 9 — deleting, then reloading INSIDE the undo window ═══════════
  const preDel = await trips(page);
  const delTarget = preDel.find(x => x.purpose === 'Corrected purpose') || preDel[0];
  R('there is a trip to delete at this point', !!delTarget, `trips=${preDel.length}`);
  if (delTarget) await ask(page, (id) => window.del && window.del(id), null, delTarget.id);
  await page.waitForTimeout(600);                       // human speed: no waiting out the 6s toast
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200); await boot(page); await nav(page, 'hist');
  await until(page, () => document.querySelectorAll('#htable .route-cell').length >= 1);
  t = await trips(page);
  const srv = await srvRows(page);
  R('a deleted trip stays deleted after an immediate reload', !t.some(x => x.purpose === 'Corrected purpose'),
    `local trips=${t.length}`);
  R('and the server row is gone too, not resurrected', srv.length === 1, `server rows=${srv.length}`);

  // ═══ ACT 10 — two overlapping loads must not duplicate ═════════════════
  const before = (await trips(page)).length;
  await ask(page, () => { window.loadFromSupabase(); window.loadFromSupabase(); return true; });
  await page.waitForTimeout(1600);
  R('two overlapping syncs do not duplicate the ledger', (await trips(page)).length === before,
    `${before} -> ${(await trips(page)).length}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2300); await boot(page); await nav(page, 'hist');
  await until(page, () => document.querySelectorAll('#htable .route-cell').length >= 1);
  R('and a reload after that still shows the same count', (await trips(page)).length === before,
    `trips=${(await trips(page)).length}`);

  // ═══ ACT 11 — no commute concept anywhere ══════════════════════════════
  R('no commute flag appears in the ledger',
    await ask(page, () => !/commute/i.test(document.getElementById('htable').textContent), false));

  // ═══ ACT 12 — every view reachable ═════════════════════════════════════
  const stuck = [];
  for (const v of ['home', 'hist', 'analytics', 'set', 'home', 'analytics', 'hist', 'set']) {
    await nav(page, v);
    const okv = await ask(page, (v) => {
      const el = document.getElementById('view-' + v) || document.querySelector('[data-view="' + v + '"]');
      return el ? getComputedStyle(el).display !== 'none' : null;
    }, null, v);
    if (okv === false) stuck.push(v);
  }
  R('every view is reachable from every other', stuck.length === 0, stuck.join(','));

  // Going somewhere means leaving: the log window must not survive a nav.
  await ask(page, () => window.openLogOverlay && window.openLogOverlay());
  await page.waitForTimeout(400);
  const openedOk = await ask(page, () => getComputedStyle(document.getElementById('logOverlay')).display !== 'none', false);
  await nav(page, 'hist');
  R('the log window opens before this check', openedOk);
  R('navigating away closes the log window', await ask(page, () =>
    getComputedStyle(document.getElementById('logOverlay')).display === 'none', false));

  // ═══ ACT 13 — the phone ════════════════════════════════════════════════
  const phone = await ctx.newPage();
  await phone.route(/googleapis|gstatic|jsdelivr/, r => r.abort());
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.goto(APP, { waitUntil: 'domcontentloaded' });
  await phone.waitForTimeout(2300); await boot(phone);
  await nav(phone, 'hist');
  const ph = await ask(phone, () => ({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    navVisible: (() => { const n = document.querySelector('.mobile-bottom-nav'); if (!n) return null; const r = n.getBoundingClientRect(); return r.top < window.innerHeight && r.height > 0; })(),
    navAtPoint: (() => { const n = document.querySelector('.mobile-bottom-nav'); if (!n) return null; const r = n.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(e && (e === n || n.contains(e))); })()
  }));
  R('at 390px nothing overflows the page horizontally', !!ph && ph.overflow <= 0, `overflow=${ph && ph.overflow}px`);
  R('at 390px the bottom nav is on screen', !!ph && ph.navVisible === true, JSON.stringify(ph));
  R('at 390px the bottom nav is actually clickable, not covered', !!ph && ph.navAtPoint === true, JSON.stringify(ph));
  await ask(phone, () => window.openLogOverlay && window.openLogOverlay());
  await phone.waitForTimeout(600);
  const ov = await ask(phone, () => {
    const o = document.getElementById('logOverlay');
    const card = o && o.querySelector('.log-card, .log-win, .log-panel, div');
    const n = document.querySelector('.mobile-bottom-nav');
    if (!o || !n || !card) return null;
    const cr = card.getBoundingClientRect(), nr = n.getBoundingClientRect();
    return { visible: getComputedStyle(o).display !== 'none',
             cardBottom: Math.round(cr.bottom), navTop: Math.round(nr.top),
             covered: cr.bottom > nr.top + 1 };
  });
  R('at 390px the log card is not hidden behind the bottom nav',
    !!ov && ov.visible && ov.covered === false, JSON.stringify(ov));

  // The nav is deliberately above the overlay, so tapping it must dismiss it.
  const tapNav = await ask(phone, () => {
    const el = document.querySelector('.mobile-bottom-nav [data-nav="hist"]');
    if (!el) return null; const r = el.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, reachable: !!(t && (t === el || el.contains(t))) };
  });
  R('at 390px the History tab is tappable while the log window is open', !!tapNav && tapNav.reachable, JSON.stringify(tapNav));
  if (tapNav && tapNav.reachable) { await phone.mouse.click(tapNav.x, tapNav.y); await phone.waitForTimeout(700); }
  const afterTap = await ask(phone, () => ({
    overlay: getComputedStyle(document.getElementById('logOverlay')).display,
    ledger: (() => { const t = document.getElementById('htable'); if (!t) return 'none'; const r = t.getBoundingClientRect();
      if (r.width === 0) return 'none'; const e = document.elementFromPoint(r.left + r.width / 2, Math.max(1, r.top + 20));
      return e ? (e.closest('#logOverlay') ? 'BLOCKED by log window' : 'visible') : 'nothing'; })()
  }));
  R('tapping History on a phone closes the log window and shows the ledger',
    !!afterTap && afterTap.overlay === 'none' && afterTap.ledger === 'visible', JSON.stringify(afterTap));
  await phone.close();

  // ═══ ACT 14 — themes ═══════════════════════════════════════════════════
  const themes = {};
  for (const mode of ['light', 'dark']) {
    await ask(page, (m) => window.setMode && window.setMode(m), null, mode);
    await page.waitForTimeout(400);
    await nav(page, 'hist');
    themes[mode] = await ask(page, () => {
      const lum = c => { const m = (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number); const [r, g, b] = m.slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; };
      // walk up for the first painted background, the way the pixel actually resolves
      const alpha = c => { const m = (c.match(/[\d.]+/g) || []).map(Number); return m.length > 3 ? m[3] : 1; };
      const bgOf = el => { let n = el; while (n && n !== document.documentElement) { const b = getComputedStyle(n).backgroundColor; if (b && alpha(b) > 0.99) return b; n = n.parentElement; } return getComputedStyle(document.body).backgroundColor; };
      let worst = 99, culprit = null, bad = 0;
      [].slice.call(document.querySelectorAll('#htable td, #htable th')).forEach(c => {
        const el = c.querySelector('.route-cell, .cell-purpose, .pill') || c;
        const txt = (el.textContent || '').trim(); if (!txt) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
        const need = (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5;
        const cr = (Math.max(lum(cs.color), lum(bgOf(el))) + .05) / (Math.min(lum(cs.color), lum(bgOf(el))) + .05);
        if (cr < need) { bad++; if (cr < worst) { worst = cr; culprit = { t: txt.slice(0, 24), fg: cs.color, size, cr: Math.round(cr * 100) / 100, need }; } }
      });
      return { failing: bad, worst: bad ? Math.round(worst * 100) / 100 : null, culprit };
    });
  }
  R('every ledger label meets WCAG AA in light mode', themes.light && themes.light.failing === 0, JSON.stringify(themes.light));
  R('every ledger label meets WCAG AA in dark mode', themes.dark && themes.dark.failing === 0, JSON.stringify(themes.dark));

  await browser.close();
  report();
})().catch(async (e) => { R('the journey ran to the end without crashing', false, String(e).slice(0, 160)); report(); });

function report() {
  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? '  ok  ' : 'FAIL  ') + r.name + (r.note ? '   [' + r.note + ']' : '')));
  console.log(`\n${results.length - bad.length}/${results.length} end-to-end checks passed`);
  process.exit(bad.length ? 1 : 0);
}
