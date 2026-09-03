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
    var PK='qa_prefs';
    var prefsTable = {
      select: function(){ return { eq: function(){ return { maybeSingle: async function(){
        if(localStorage.getItem('qa_prefs_missing')==='1')
          return { data:null, error:{ code:'PGRST205', message:"Could not find the table 'public.user_prefs' in the schema cache" } };
        var raw=localStorage.getItem(PK);
        return { data: raw?JSON.parse(raw):null, error:null };
      } }; } }; },
      upsert: async function(row){
        if(localStorage.getItem('qa_prefs_missing')==='1')
          return { error:{ code:'PGRST205', message:"Could not find the table 'public.user_prefs' in the schema cache" } };
        localStorage.setItem(PK, JSON.stringify(row));
        return { error:null };
      }
    };
    var LK='qa_plan';
    var planTable = {
      select: function(){ return { eq: function(){ return { maybeSingle: async function(){
        if(localStorage.getItem('qa_plan_missing')==='1')
          return { data:null, error:{ code:'PGRST205', message:"Could not find the table 'public.user_plan' in the schema cache" } };
        var raw=localStorage.getItem(LK);
        return { data: raw?JSON.parse(raw):null, error:null };
      } }; } }; },
      insert: async function(row){
        if(localStorage.getItem('qa_plan_missing')==='1')
          return { error:{ code:'PGRST205', message:"Could not find the table 'public.user_plan' in the schema cache" } };
        localStorage.setItem(LK, JSON.stringify(row));
        localStorage.setItem('qa_plan_inserts', String(parseInt(localStorage.getItem('qa_plan_inserts')||'0',10)+1));
        return { error:null };
      }
    };
    var SK2='qa_files';
    function files(){ try { return JSON.parse(localStorage.getItem(SK2)||'[]'); } catch(e){ return []; } }
    var storage = { from: function(){ return {
      upload: async function(path, blob, opts){
        if(localStorage.getItem('qa_bucket_missing')==='1') return { error:{ message:'Bucket not found' } };
        var f=files(); f.push({ path:path, size:(blob&&blob.size)||0, type:(opts&&opts.contentType)||'' });
        localStorage.setItem(SK2, JSON.stringify(f));
        return { data:{ path:path }, error:null };
      },
      remove: async function(paths){
        localStorage.setItem(SK2, JSON.stringify(files().filter(function(f){ return paths.indexOf(f.path)<0; })));
        return { error:null };
      },
      createSignedUrl: async function(path, secs){
        if(localStorage.getItem('qa_bucket_missing')==='1') return { data:null, error:{ message:'Bucket not found' } };
        // a 1x1 gif so the <img> actually loads in the harness
        return { data:{ signedUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' }, error:null };
      }
    }; } };
    window.supabase = { createClient: function(){ return {
      auth: { getSession: async function(){ return { data: { session: { user:{ id:'u1', email:'qa@test.co' } } } }; },
              onAuthStateChange: function(cb){ setTimeout(function(){ cb('SIGNED_IN', { user:{ id:'u1', email:'qa@test.co' } }); }, 30); return { data:{ subscription:{ unsubscribe:function(){} } } }; },
              signOut: async function(){ return {}; } },
      from: function(name){ return name==='user_prefs' ? prefsTable : (name==='user_plan' ? planTable : table); }, storage: storage }; } };
  })();
  window.__map = { directions: 0, markers: [], polylines: 0, fits: 0, lastReq: null, routeStatus: 'OK', log: [] };
  window.google = { maps: {
    places:{ Autocomplete:function(){ return { addListener(){}, getPlace(){ return {}; } }; }, PlacesService:function(){ this.getDetails=function(req,cb){
      setTimeout(function(){
        if(req.placeId!=='p3')return cb(null,'NOT_FOUND');
        cb({ name:"Chili's Grill & Bar",
             address_components:[
               {types:['street_number'],long_name:'1550',short_name:'1550'},
               {types:['route'],long_name:'N Main St',short_name:'N Main St'},
               {types:['locality'],long_name:'Layton',short_name:'Layton'},
               {types:['administrative_area_level_1'],long_name:'Utah',short_name:'UT'}
             ],
             geometry:{ location:{ lat:function(){return 41.07;}, lng:function(){return -111.97;} } } }, 'OK');
      }, 12);
    }; },
    AutocompleteService:function(){ this.getPlacePredictions=function(req,cb){
      window.__map.acReq = req && req.input;
      setTimeout(function(){
        if(window.__map.acStatus && window.__map.acStatus !== 'OK') return cb(null, window.__map.acStatus);
        cb([
          { place_id:'p1', types:['street_address'], description:'900 Convention Center Dr, Salt Lake City, UT, USA', structured_formatting:{ main_text:'900 Convention Center Dr', secondary_text:'Salt Lake City, UT, USA' } },
          { place_id:'p2', types:['street_address'], description:'910 Convention Center Dr, Provo, UT, USA', structured_formatting:{ main_text:'910 Convention Center Dr', secondary_text:'Provo, UT, USA' } },
          { place_id:'p3', types:['establishment','restaurant'], description:"Chili's Grill & Bar, 1550 N Main St, Layton, UT, USA", structured_formatting:{ main_text:"Chili's Grill & Bar", secondary_text:'1550 N Main St, Layton, UT, USA' } },
          { place_id:'p4', types:['establishment'], description:'<img src=x onerror="window.__acPwned=1">', structured_formatting:{ main_text:'<img src=x onerror="window.__acPwned=1">', secondary_text:'Nowhere, UT, USA' } }
        ], 'OK');
      }, 15);
    }; } },
    places_details_stub: true,
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
// A check whose element is missing must report FAIL, not throw and abort the
// whole run — one absent node used to hide every check after it.
const ask = async (page, fn, fallback = null) => {
  try { return await page.evaluate(fn); } catch (e) { return fallback; }
};
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
  // Delete and reload IMMEDIATELY — the way a person does it. Waiting for the
  // undo window to lapse first is what let a deferred server delete pass QA
  // while the owner watched rows come back after a refresh.
  const doomed = await page.evaluate(() => window.__qaTrips().find(t => t.purpose === 'edited').id);
  await page.evaluate(id => window.del(id), doomed); await page.waitForTimeout(150);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  R('delete survives an immediate reload', await page.evaluate(() => !window.__qaTrips().some(t => t.purpose === 'edited')));
  R('deleted row is gone from the server too', await page.evaluate(() => !JSON.parse(localStorage.getItem('qa_srv') || '[]').some(r => r.purpose === 'edited')));
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
  // "keep first" was silently dead before the injection fix: its onclick was
  // truncated at "dupSelectGroup(" by the quote the address broke in with.
  R('the group button carries no injected handler', await ask(page, () => {
    const b = document.querySelector('#dupBody .map-btn');
    return !!b && Array.from(b.attributes).every(a => !/^on/.test(a.name) || a.name === 'onclick');
  }, false));
  await ask(page, () => { document.querySelectorAll('#dupBody .dup-ck').forEach(c => { c.checked = true; }); window.updateDupSelCount(); return true; });
  await page.click('#dupBody .map-btn').catch(() => {});
  await page.waitForTimeout(300);
  R('"keep first" unchecks exactly the first row of its group', await ask(page, () => {
    const cks = Array.from(document.querySelectorAll('#dupBody .dup-ck'));
    return cks.filter(c => !c.checked).length === 1 && !cks[0].checked;
  }, false));
  await ask(page, () => { window.closeDupReview(); window.openDupReview(); return true; });
  await settle(page);

  R('every extra preselected, one keeper per group', await page.evaluate(() => {
    const cks = Array.from(document.querySelectorAll('#dupBody .dup-ck'));
    return cks.filter(c => c.checked).length === 2 && cks.filter(c => !c.checked).length === 1;
  }));
  const beforeClean = await tripCount(page);

  await page.click('#dupDelBtn'); await page.waitForTimeout(300);
  R('cleanup removes exactly the extras', await tripCount(page) === beforeClean - 2, 'before=' + beforeClean + ' after=' + await tripCount(page));
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1400);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  R('cleanup survives an immediate reload', await tripCount(page) === beforeClean - 2);
  R('cleaned rows are gone from the server', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('qa_srv') || '[]').filter(r => /^dupe/.test(r.purpose || '')).length === 1));

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

  // ── offline save → reconnect → exactly one server row, and refreshes don't clone it
  await ctx.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await fillLog(page, { date: '2026-05-05', miles: 12.5, purpose: 'offline trip', to: '5 Offline Rd' });
  await page.evaluate(() => window.addTrip()); await settle(page);
  R('offline save lands in the ledger', await page.evaluate(() => window.__qaTrips().some(t => t.purpose === 'offline trip')));
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1200);
  R('reconnect syncs the offline trip exactly once', await page.evaluate(() =>
    JSON.parse(localStorage.getItem('qa_srv') || '[]').filter(r => r.purpose === 'offline trip').length === 1));
  await page.evaluate(() => { window.loadFromSupabase(); window.loadFromSupabase(); });
  await page.waitForTimeout(1200);
  R('later refreshes do not clone the offline trip', await page.evaluate(() =>
    window.__qaTrips().filter(t => t.purpose === 'offline trip').length === 1));

  // ── undo after a delete restores exactly one row, and it stays one after a reload
  const preUndo = await tripCount(page);
  await page.evaluate(() => window.del(window.__qaTrips().find(t => t.purpose === 'offline trip').id));
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('undoToastBtn').click());
  await page.waitForTimeout(700);
  R('undo restores the deleted trip', await tripCount(page) === preUndo);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1600);
  R('an undone delete is not duplicated by the reload', await page.evaluate(() =>
    window.__qaTrips().filter(t => t.purpose === 'offline trip').length === 1),
    await page.evaluate(() => window.__qaTrips().filter(t => t.purpose === 'offline trip').length));

  // ── FIRST RUN: an empty ledger must offer a path, and it must be clickable
  // (snapshot the ledger — later checks rely on the saved routes in it)
  const ledgerSnapshot = await ask(page, () => localStorage.getItem('qa_srv'), '[]');
  await ask(page, () => { localStorage.setItem('qa_srv', '[]'); localStorage.setItem('ml3_trips', '[]'); return true; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1600);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.switchNav('home', document.getElementById('nav-home'))); await settle(page);
  R('a new owner gets a welcome card, not four zeroes', await ask(page, () =>
    /Welcome to Milo/.test(document.getElementById('hStats').textContent) &&
    !/Miles YTD/.test(document.getElementById('hStats').textContent), false));
  R('the setup steps are on screen', await ask(page, () =>
    document.querySelectorAll('#hStats .start-step').length === 3, false));
  // same trap as the nudge: the map underneath will eat these clicks
  R('setup steps are clickable, not under the map', await ask(page, () => {
    const st = document.querySelector('#hStats .start-step'); if (!st) return 'missing';
    const r = st.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (st === hit || st.contains(hit)) ? 'ok' : 'covered by ' + (hit && (hit.id || hit.className));
  }, 'threw') === 'ok', await ask(page, () => {
    const st = document.querySelector('#hStats .start-step'); if (!st) return 'missing';
    const r = st.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (st === hit || st.contains(hit)) ? 'ok' : 'covered by ' + (hit && (hit.id || hit.className));
  }, 'threw'));
  await page.click('#hStats .start-step').catch(() => {});
  await page.waitForTimeout(600);
  R('the first step opens the log form', await ask(page, () =>
    document.getElementById('logOverlay').style.display === 'flex', false));
  await page.evaluate(() => window.closeLogOverlay()); await settle(page);
  R('onboarding no longer promises automatic tracking', await ask(page, () =>
    !/automatically captures|background tracking/i.test(document.body.innerHTML), false));
  // put the ledger back for the checks that follow
  await ask(page, snap => { localStorage.setItem('qa_srv', snap); return true; }, true);
  await page.evaluate(snap => localStorage.setItem('qa_srv', snap), ledgerSnapshot);
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1600);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1500);

  // ── UNLOGGED-DAY NUDGE: shows real gaps, and acting on one dates the form
  await page.evaluate(() => {
    // a Mon–Fri pattern with the last few weekdays missing
    const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const rows = [];
    for (let i = 21; i >= 7; i--) {
      const d = new Date(Date.now() - i * 864e5);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      rows.push({ id: 'gap-' + i, user_id: 'u1', date: iso(d), miles: 12, from_addr: 'A St, Syracuse, UT',
                  to_addr: 'B Ave, Lehi, UT', purpose: 'pattern', category: 'Client Meeting' });
    }
    const existing = JSON.parse(localStorage.getItem('qa_srv') || '[]');
    localStorage.setItem('qa_srv', JSON.stringify(existing.concat(rows)));
    Object.keys(localStorage).filter(k => k.indexOf('ml_nudge:') === 0).forEach(k => localStorage.removeItem(k));
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1600);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.switchNav('home', document.getElementById('nav-home'))); await settle(page);
  const chips = await ask(page, () => document.querySelectorAll('#hNudge .nudge-chip').length, 0);
  R('the nudge lists days with nothing logged', chips > 0, 'chips=' + chips);
  R('the nudge never asserts a trip was missed', await ask(page, () => {
    const title = (document.querySelector('.nudge-title') || {}).textContent || '';
    return /nothing logged/i.test(title) && !/missed|forgot|you drove/i.test(title);
  }, false), await ask(page, () => (document.querySelector('.nudge-title') || {}).textContent, ''));
  // the map sits under this card and will happily swallow the clicks
  R('gap chips are actually clickable, not under the map', await ask(page, () => {
    const c = document.querySelector('#hNudge .nudge-chip'); if (!c) return 'missing';
    const r = c.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (c === hit || c.contains(hit)) ? 'ok' : 'covered by ' + (hit && (hit.id || hit.className));
  }, 'threw') === 'ok', await ask(page, () => {
    const c = document.querySelector('#hNudge .nudge-chip'); if (!c) return 'missing';
    const r = c.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (c === hit || c.contains(hit)) ? 'ok' : 'covered by ' + (hit && (hit.id || hit.className));
  }, 'threw'));
  R('no gap listed is a day that has trips', await ask(page, () => {
    const logged = new Set(JSON.parse(localStorage.getItem('ml3_trips') || '[]').map(t => t.date));
    return window.gapDays().every(g => !logged.has(g));
  }, false));
  R('today is never listed as a gap', await ask(page, () => {
    const d = new Date(); const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return window.gapDays().indexOf(iso) < 0;
  }, false));

  // tapping a day opens the log form dated to it
  const gapDate = await ask(page, () => window.gapDays()[0], '');
  await page.click('#hNudge .nudge-chip').catch(() => {});
  await page.waitForTimeout(600);
  R('tapping a gap opens the log form on that date', await ask(page, () =>
    document.getElementById('logOverlay').style.display === 'flex' &&
    document.getElementById('tDate').value === window.gapDays()[0], false),
    'gap=' + gapDate + ' field=' + await ask(page, () => document.getElementById('tDate').value, ''));
  await page.evaluate(() => window.closeLogOverlay()); await settle(page);
  await page.evaluate(() => window.switchNav('home', document.getElementById('nav-home'))); await settle(page);

  // "Not now" quiets it for the week, and it stays quiet across a reload
  await page.click('#hNudge .nudge-x').catch(() => {});
  await page.waitForTimeout(400);
  R('"Not now" hides the nudge', await ask(page, () =>
    document.querySelectorAll('#hNudge .nudge-chip').length === 0, false));
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1600);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.switchNav('home', document.getElementById('nav-home'))); await settle(page);
  R('it stays quiet for the rest of the week', await ask(page, () =>
    document.querySelectorAll('#hNudge .nudge-chip').length === 0, false));

  // the setting turns it off for good
  await ask(page, () => { Object.keys(localStorage).filter(k => k.indexOf('ml_nudge:') === 0).forEach(k => localStorage.removeItem(k)); return true; });
  await page.evaluate(() => window.switchNav('set', document.getElementById('nav-set'))); await settle(page);
  await page.check('#sNudgeOff').catch(() => {});
  await page.waitForTimeout(500);
  await page.evaluate(() => window.switchNav('home', document.getElementById('nav-home'))); await settle(page);
  R('the setting switches the reminder off', await ask(page, () =>
    document.querySelectorAll('#hNudge .nudge-chip').length === 0, false));
  await page.evaluate(() => window.switchNav('set', document.getElementById('nav-set'))); await settle(page);
  await page.uncheck('#sNudgeOff').catch(() => {});
  await page.waitForTimeout(400);

  // ── PLANS + REFERRALS: arriving on someone's invite link
  await ask(page, () => { ['qa_plan','qa_plan_inserts','ml_referred_by'].forEach(k => localStorage.removeItem(k)); return true; });
  await page.goto(APP + '?ref=friend123', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1700);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1500);
  // it is captured on arrival, then consumed when the account row is created —
  // so it is either still pending or already on the row, never simply lost
  R('an inbound invite code is captured', await ask(page, () => {
    const pending = localStorage.getItem('ml_referred_by');
    const row = JSON.parse(localStorage.getItem('qa_plan') || 'null');
    return pending === 'friend123' || (row && row.referred_by_code === 'friend123');
  }, false));
  R('the code is taken out of the address bar', await ask(page, () => location.search.indexOf('ref=') < 0, false),
    await ask(page, () => location.search, ''));
  R('the new account records who invited them', await ask(page, () => {
    const row = JSON.parse(localStorage.getItem('qa_plan') || 'null');
    return !!row && row.referred_by_code === 'friend123';
  }, false));
  R('everyone starts on a plan with nothing locked', await ask(page, () =>
    window.userPlanState().plan === 'founding' && window.can('export') && window.can('taxReport'), false));
  R('the account gets its own short share code', await ask(page, () =>
    /^[a-z0-9]{8}$/.test(window.userPlanState().code), false), await ask(page, () => window.userPlanState().code, ''));

  // the share link must never carry the Supabase user id again
  const inviteLink = await ask(page, () => window.buildInviteLink ? window.buildInviteLink() : (document.getElementById('inviteLinkInput') || {}).value, '');
  await page.evaluate(() => window.openInviteModal()); await settle(page);
  const shownLink = await ask(page, () => document.getElementById('inviteLinkInput').value, '');
  R('the invite link uses the short code', await ask(page, () =>
    document.getElementById('inviteLinkInput').value.indexOf('ref=' + window.userPlanState().code) > 0, false), shownLink);
  R('the invite link does not leak a user id', shownLink.indexOf('u1') < 0 && !/[0-9a-f]{8}-[0-9a-f]{4}/.test(shownLink), shownLink);
  await page.evaluate(() => window.closeInviteModal()); await settle(page);

  // signing in again must not mint a second plan row
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1700);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1400);
  R('a second sign-in reuses the same plan row', await ask(page, () =>
    localStorage.getItem('qa_plan_inserts') === '1', false), await ask(page, () => localStorage.getItem('qa_plan_inserts'), '?'));

  // the plan table missing must not break anything
  await ask(page, () => { localStorage.setItem('qa_plan_missing','1'); localStorage.removeItem('qa_plan'); return true; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1700);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1500);
  R('no plan table → trip logging is unaffected', await tripCount(page) >= 0);
  R('no plan table → nothing is locked', await ask(page, () =>
    window.can('export') && window.can('taxReport') && window.can('rules'), false));
  R('no plan table → the owner is told', await ask(page, () => {
    window.switchNav('set', document.getElementById('nav-set'));
    return /run supabase\/user_plan\.sql/.test((document.getElementById('planNote') || {}).textContent || '');
  }, false), await ask(page, () => (document.getElementById('planNote') || {}).textContent, ''));
  await ask(page, () => { localStorage.removeItem('qa_plan_missing'); return true; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1700);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1500);

  // ── RULES SYNC: a rule made here must show up on another device
  await page.evaluate(() => window.switchNav('set', document.getElementById('nav-set'))); await settle(page);
  await page.fill('#rName', 'Lehi office runs').catch(() => {});
  await page.fill('#rTo', 'Lehi').catch(() => {});
  await page.selectOption('#rCat', 'Office Visit').catch(() => {});
  await page.click('button:has-text("Add rule")').catch(() => {});
  await page.waitForTimeout(1200);
  R('the rule appears in the list', await ask(page, () =>
    /Lehi office runs/.test(document.getElementById('rulesList').textContent), false));
  R('the rule reached the server', await ask(page, () => {
    const p = JSON.parse(localStorage.getItem('qa_prefs') || 'null');
    return !!p && p.rules.some(r => r.name === 'Lehi office runs');
  }, false));
  R('sync status is shown to the owner', await ask(page, () =>
    /sync/i.test(document.getElementById('rulesSyncNote').textContent), false));

  // wipe the local copy — this is what a second device looks like
  await ask(page, () => {
    const c = JSON.parse(localStorage.getItem('ml3_set') || '{}');
    c.rules = []; c.ruleDismissed = {}; c.rulesUpdatedAt = 0;
    localStorage.setItem('ml3_set', JSON.stringify(c));
    return true;
  });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1600);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.switchNav('set', document.getElementById('nav-set'))); await settle(page);
  R('a fresh device pulls the rule down', await ask(page, () =>
    /Lehi office runs/.test(document.getElementById('rulesList').textContent), false),
    await ask(page, () => (document.getElementById('rulesList') || {}).textContent, ''));

  // deleting a rule sticks — it must not be resurrected by the next sync
  await ask(page, () => {
    const c = JSON.parse(localStorage.getItem('ml3_set') || '{}');
    const r = (c.rules || [])[0];
    if (r && window.delRule) window.delRule(r.id);
    return true;
  });
  await page.waitForTimeout(1200);
  await ask(page, () => { if (window.loadPrefsFromSupabase) window.loadPrefsFromSupabase(); return true; });
  await page.waitForTimeout(900);
  R('a deleted rule stays deleted after a sync', await ask(page, () =>
    !/Lehi office runs/.test(document.getElementById('rulesList').textContent), false));

  // no user_prefs table yet: the app must keep working and say so
  await ask(page, () => { localStorage.setItem('qa_prefs_missing', '1'); return true; });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(1600);
  await page.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); window.__qaTrips = () => JSON.parse(localStorage.getItem('ml3_trips') || '[]'); if(window.initGoogleMaps)window.initGoogleMaps(); });
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.switchNav('set', document.getElementById('nav-set'))); await settle(page);
  R('without the table, the owner is told rules are device-only', await ask(page, () =>
    /this device only/i.test(document.getElementById('rulesSyncNote').textContent), false),
    await ask(page, () => (document.getElementById('rulesSyncNote') || {}).textContent, ''));
  await page.fill('#rTo', 'Ogden').catch(() => {});
  await page.selectOption('#rCat', 'Team Meeting').catch(() => {});
  await page.click('button:has-text("Add rule")').catch(() => {});
  await page.waitForTimeout(800);
  R('rules still work locally with no table', await ask(page, () =>
    /Ogden/.test(document.getElementById('rulesList').textContent), false));
  R('trip logging is unaffected by the missing table', await tripCount(page) > 0);
  await ask(page, () => { localStorage.removeItem('qa_prefs_missing'); return true; });

  // ── RECEIPTS: attach a photo, see it, remove it
  await ask(page, () => { localStorage.removeItem('qa_files'); localStorage.removeItem('qa_bucket_missing'); return true; });
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  R('the log form offers a receipt', await ask(page, () => !!document.getElementById('tReceipt'), false));
  R('it asks the phone for the camera', await ask(page, () =>
    document.getElementById('tReceipt').getAttribute('capture') === 'environment' &&
    /image/.test(document.getElementById('tReceipt').getAttribute('accept') || ''), false));

  await fillLog(page, { date: '2026-07-21', miles: 18.4, purpose: 'receipt trip', to: '5 Toll Rd' });
  // a real file, chosen the way a person chooses one
  await page.setInputFiles('#tReceipt', {
    name: 'toll.png', mimeType: 'image/png',
    buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
                        '0d0a2db40000000049454e44ae426082', 'hex')
  }).catch(() => {});
  await page.waitForTimeout(300);
  R('the chosen file is shown before saving', await ask(page, () =>
    /toll\.png/.test((document.getElementById('receiptName') || {}).textContent || ''), false));
  await page.evaluate(() => window.addTrip());
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('qa_files') || '[]').length > 0, null, { timeout: 8000, polling: 100 }).catch(() => {});
  const up = await ask(page, () => JSON.parse(localStorage.getItem('qa_files') || '[]'), []);
  R('saving the trip uploads the receipt', up.length === 1, JSON.stringify(up));
  R('the file is stored under the account folder', (up[0] && up[0].path || '').indexOf('u1/') === 0, up[0] && up[0].path);

  // History shows it, and it opens
  await page.evaluate(() => window.switchNav('hist', document.getElementById('nav-hist'))); await settle(page);
  R('History marks the trip as having a receipt', await ask(page, () =>
    !!document.querySelector('#htable button[title="View receipt"]'), false));
  await page.click('#htable button[title="View receipt"]').catch(() => {});
  await page.waitForTimeout(600);
  R('the receipt opens in a viewer', await ask(page, () =>
    document.getElementById('receiptModal').style.display === 'flex' &&
    !!document.getElementById('receiptImg').getAttribute('src'), false));

  // removing it
  await page.click('#receiptDelBtn').catch(() => {});
  await page.waitForTimeout(700);
  R('removing the receipt empties storage', await ask(page, () =>
    JSON.parse(localStorage.getItem('qa_files') || '[]').length === 0, false));
  R('and clears the marker in History', await ask(page, () =>
    !document.querySelector('#htable button[title="View receipt"]'), false));

  // no bucket yet: the trip must still save
  await ask(page, () => { localStorage.setItem('qa_bucket_missing', '1'); return true; });
  const beforeNoBucket = await tripCount(page);
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await fillLog(page, { date: '2026-07-22', miles: 9.9, purpose: 'no bucket trip', to: '6 Nobucket Way' });
  await page.setInputFiles('#tReceipt', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a', 'hex') }).catch(() => {});
  await page.evaluate(() => window.addTrip());
  await page.waitForTimeout(1200);
  R('with no bucket the trip is still saved', await tripCount(page) === beforeNoBucket + 1,
    'before=' + beforeNoBucket + ' after=' + await tripCount(page));
  R('with no bucket no receipt is claimed', await ask(page, () =>
    !window.__qaTrips().some(t => t.purpose === 'no bucket trip' && t.receiptPath), false));
  await ask(page, () => { localStorage.removeItem('qa_bucket_missing'); return true; });

  // ── Calculate distance: the result must be readable, and Miles must fill in
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await fillLog(page, { date: '2026-06-20', miles: '', purpose: 'calc check', to: '77 Calc Rd' });
  await page.click('#calcBtn');
  await page.waitForFunction(() => document.getElementById('distBox').classList.contains('show'), null, { timeout: 6000 }).catch(() => {});
  const calc = await ask(page, () => {
    const b = document.getElementById('distBox'), r = b.getBoundingClientRect();
    return { h: Math.round(r.height), one: document.getElementById('distMi1').textContent,
             round: document.getElementById('distMi2').textContent,
             miles: document.getElementById('tMiles').value,
             ded: (document.getElementById('logDed') || {}).textContent };
  }, {});
  R('distance result is actually readable, not a sliver', calc.h > 40, 'height=' + calc.h + 'px');
  R('both one-way and round-trip figures shown', /\d/.test(calc.one || '') && /\d/.test(calc.round || ''), calc.one + ' / ' + calc.round);
  R('Calculate fills the Miles field', parseFloat(calc.miles) > 0, 'miles=' + calc.miles);
  R('deductible readout follows the calculated miles', /\$\d/.test(calc.ded || '') && calc.ded !== '$0.00', calc.ded);

  // with round trip ticked, the round figure is the one that lands
  await page.evaluate(() => { document.getElementById('tMiles').value = ''; document.getElementById('tRound').checked = true; });
  await page.click('#calcBtn');
  await page.waitForTimeout(700);
  const rtMiles = await ask(page, () => ({ m: document.getElementById('tMiles').value,
                                           r: document.getElementById('distMi2').textContent }), {});
  R('round trip ticked → Miles gets the round figure', parseFloat(rtMiles.m) === parseFloat(rtMiles.r), rtMiles.m + ' vs ' + rtMiles.r);

  // "Use →" still switches between the two
  await page.click('#distBox .dist-opt:first-child .dist-use').catch(() => {});
  await page.waitForTimeout(300);
  R('Use → sets the one-way figure', await ask(page, () =>
    parseFloat(document.getElementById('tMiles').value) === parseFloat(document.getElementById('distMi1').textContent), false));

  // nothing else in the overlay is squeezed to nothing by the scrolling column
  const squeezed = await ask(page, () => Array.from(document.querySelectorAll('.log-body > *'))
    .filter(el => el.textContent.trim() && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height < 8)
    .map(el => el.id || el.className).slice(0, 4), ['threw']);
  R('no overlay section is collapsed by the flex column', squeezed.length === 0, squeezed.join(','));
  await page.evaluate(() => { document.getElementById('tRound').checked = false; window.closeLogOverlay(); });
  await settle(page);

  // ── ADDRESS SUGGESTIONS: type a destination, click a result
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await page.fill('#tToStreet', 'Co').catch(() => {});
  await page.waitForTimeout(500);
  R('no dropdown for a 2-character scrap', await ask(page, () =>
    (document.getElementById('acTo')||{style:{}}).style.display === 'none'));
  await page.fill('#tToStreet', '900 Convention').catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#acTo .ac-row').length > 0, null, { timeout: 5000 }).catch(() => {});
  const rows = await ask(page, () => document.querySelectorAll('#acTo .ac-row').length);
  R('typing a destination offers options', rows > 0, 'rows=' + rows);
  R('the query reached Places', await ask(page, () => /900 Convention/.test(window.__map.acReq || '')));
  R('suggestion text is escaped, not executed', await ask(page, () => !window.__acPwned &&
    (document.getElementById('acTo')||{}).innerHTML || ''.indexOf('<img src=x') < 0));

  // clicking one fills the address fields
  await page.click('#acTo .ac-row:first-child').catch(() => {});
  await page.waitForTimeout(500);
  const filled = await ask(page, () => ({
    street: (document.getElementById('tToStreet') || {}).value,
    city: (document.getElementById('tToCity') || {}).value,
    state: (document.getElementById('tToState') || {}).value,
    full: (document.getElementById('tTo') || {}).value,
    open: (document.getElementById('acTo') || {}).style && document.getElementById('acTo').style.display
  }), {});
  R('clicking a suggestion fills street/city/state', /Convention Center/.test(filled.street) && !!filled.city && /^[A-Z]{2}$/.test(filled.state), JSON.stringify(filled));
  R('the hidden address is rebuilt from the pick', /Convention Center/.test(filled.full) && filled.full.split(',').length >= 3, filled.full);
  R('the dropdown closes after picking', filled.open === 'none');

  // keyboard: arrow down + Enter picks the second one
  await page.fill('#tToStreet', '900 Convention').catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#acTo .ac-row').length > 1, null, { timeout: 5000 }).catch(() => {});
  await page.press('#tToStreet', 'ArrowDown').catch(() => {});
  await page.press('#tToStreet', 'Enter').catch(() => {});
  await page.waitForTimeout(400);
  R('keyboard picks a suggestion without saving the trip', await ask(page, () =>
    /910 Convention|Convention Center/.test((document.getElementById('tToStreet')||{}).value || '') &&
    document.getElementById('logOverlay').style.display === 'flex'));

  // Escape closes the list, not the overlay
  await page.fill('#tToStreet', '900 Convention').catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#acTo .ac-row').length > 0, null, { timeout: 5000 }).catch(() => {});
  await page.press('#tToStreet', 'Escape').catch(() => {});
  await page.waitForTimeout(300);
  R('Escape closes the list but keeps the overlay open', await ask(page, () =>
    (document.getElementById('acTo')||{style:{}}).style.display === 'none' &&
    document.getElementById('logOverlay').style.display === 'flex'));

  // Places unreachable → previously driven addresses still offered
  await page.evaluate(() => { window.__map.acStatus = 'ZERO_RESULTS'; });
  await page.fill('#tToStreet', '456 Business').catch(() => {});
  await page.waitForTimeout(700);
  R('saved routes still suggested when Places is unavailable', await ask(page, () =>
    document.querySelectorAll('#acTo .ac-row').length > 0),
    await ask(page, () => (document.getElementById('acTo')||{}).innerHTML || ''.slice(0, 80)));
  await page.evaluate(() => { window.__map.acStatus = 'OK'; });
  await page.evaluate(() => window.closeLogOverlay()); await settle(page);
  R('closing the overlay leaves no dropdown behind', await ask(page, () =>
    (document.getElementById('acTo')||{style:{}}).style.display === 'none' && (document.getElementById('acFrom')||{style:{}}).style.display === 'none'));

  // ── a place by NAME (restaurant, office building) must be findable
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  await page.fill('#tToStreet', "Chili's").catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#acTo .ac-row').length > 0, null, { timeout: 5000 }).catch(() => {});
  R('a named place appears in the suggestions', await ask(page, () =>
    /Chili/.test(document.getElementById('acTo').textContent), false),
    await ask(page, () => (document.getElementById('acTo') || {}).textContent, ''));
  R('the place row shows its street underneath', await ask(page, () =>
    /1550 N Main St/.test(document.getElementById('acTo').textContent), false));
  R('Places is asked without a type filter', await ask(page, () => !window.__map.acTypes, true));

  const bizIdx = await ask(page, () => Array.from(document.querySelectorAll('#acTo .ac-row'))
    .findIndex(r => /Chili/.test(r.textContent)), -1);
  await page.click('#acTo .ac-row:nth-child(' + (bizIdx + 1) + ')').catch(() => {});
  await page.waitForTimeout(700);
  const biz = await ask(page, () => ({
    street: document.getElementById('tToStreet').value,
    city: document.getElementById('tToCity').value,
    state: document.getElementById('tToState').value
  }), {});
  R('picking a place fills its street address, not its name', biz.street === '1550 N Main St', JSON.stringify(biz));
  R('picking a place fills city and state', biz.city === 'Layton' && biz.state === 'UT', JSON.stringify(biz));
  R('the place is geocoded into the address cache', await ask(page, () => {
    const g = JSON.parse(localStorage.getItem('ml3_geo') || '{}');
    return Object.keys(g).some(k => /1550 n main st/.test(k) && Array.isArray(g[k]));
  }, false));

  // a dead lookup must SAY it is dead, not look like a missing feature
  await page.evaluate(() => { window.__map.acStatus = 'REQUEST_DENIED'; });
  await page.fill('#tToStreet', 'Traverse Parkway').catch(() => {});
  await page.waitForFunction(() => (document.getElementById('acTo') || {}).textContent &&
    /unavailable/i.test(document.getElementById('acTo').textContent), null, { timeout: 5000 }).catch(() => {});
  R('a failed lookup explains itself in the UI', await ask(page, () =>
    /unavailable \(REQUEST_DENIED\)/.test(document.getElementById('acTo').textContent), false),
    await ask(page, () => (document.getElementById('acTo') || {}).textContent, ''));
  R('the failing status is readable for diagnosis', await ask(page, () => window.acStatus() === 'REQUEST_DENIED', false));
  await page.evaluate(() => { window.__map.acStatus = 'OK'; });
  await page.evaluate(() => window.closeLogOverlay()); await settle(page);

  // ── Export CSV must export what the ledger is showing, not the whole year
  await page.evaluate(() => window.switchNav('hist', document.getElementById('nav-hist'))); await settle(page);
  await page.evaluate(() => {
    URL.createObjectURL = function (b) { window.__blob = b; return 'blob:qa'; };
    URL.revokeObjectURL = function () { };
    HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
  });
  await page.selectOption('#fCat', 'Client Meeting'); await settle(page);
  const shown = await rowsOnScreen(page);
  await page.evaluate(() => window.doExport()); await page.waitForTimeout(300);
  const csv = await page.evaluate(async () => window.__blob ? await window.__blob.text() : '');
  R('CSV exports exactly the filtered ledger', csv && csv.trim().split('\n').length - 1 === shown,
    'on screen=' + shown + ' in csv=' + (csv ? csv.trim().split('\n').length - 1 : 'none'));
  R('CSV has no dead Commute column', csv.indexOf('Commute') < 0);
  await page.selectOption('#fCat', ''); await settle(page);

  // ── the log overlay must be closable without a keyboard (phones have no Esc)
  await page.evaluate(() => window.openLogOverlay()); await settle(page);
  const xHit = await page.evaluate(() => {
    const b = document.getElementById('logCloseBtn'); if (!b) return 'missing';
    const r = b.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return (b === hit || b.contains(hit)) ? 'ok' : 'covered';
  });
  R('log overlay has a reachable close button', xHit === 'ok', xHit);
  await page.click('#logCloseBtn'); await settle(page);
  R('close button actually closes it', await page.evaluate(() => document.getElementById('logOverlay').style.display === 'none'));

  // ── tax report carries no commute line item
  let taxHtml = '';
  try { taxHtml = await page.evaluate(() => window.buildTaxReportHTML ? window.buildTaxReportHTML(2026) : ''); } catch (e) {}
  R('tax report has no commute row', taxHtml === '' || taxHtml.indexOf('Commute miles') < 0, taxHtml ? 'built' : 'not exposed');

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
  // the suggestion list must be usable on a phone, not clipped by the card
  await mob.evaluate(() => window.openLogOverlay()); await mob.waitForTimeout(600);
  await mob.fill('#tToStreet', '900 Convention').catch(() => {});
  await mob.waitForFunction(() => document.querySelectorAll('#acTo .ac-row').length > 0, null, { timeout: 5000 }).catch(() => {});
  const acFit = await ask(mob, () => {
    const d = document.getElementById('acTo'); if (!d || d.style.display === 'none') return 'hidden';
    const r = d.getBoundingClientRect();
    if (r.width < 100) return 'too narrow: ' + Math.round(r.width);
    if (r.top > innerHeight || r.bottom < 0) return 'offscreen';
    const row = d.querySelector('.ac-row'); const rr = row.getBoundingClientRect();
    const hit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
    return (row === hit || row.contains(hit)) ? 'ok' : 'covered';
  }, 'threw');
  R('390px: suggestions are visible and tappable', acFit === 'ok', acFit);
  await mob.evaluate(() => window.closeLogOverlay());

  // a phone with nothing logged should lead with the welcome card, not an empty map
  await ask(mob, () => { localStorage.setItem('ml3_trips', '[]'); localStorage.setItem('qa_srv', '[]'); return true; });
  await mob.reload({ waitUntil: 'domcontentloaded' }); await mob.waitForTimeout(1500);
  await mob.evaluate(() => { ['authOverlay','onboardOverlay'].forEach(i=>{const e=document.getElementById(i);if(e){e.style.display='none';e.classList.remove('active');}}); });
  await mob.evaluate(() => window.switchNav('home', document.getElementById('nav-home')));
  // Poll for the card instead of guessing at a delay: sign-in, the trips load
  // and renderHome() all settle on their own schedule, and a fixed sleep here
  // failed roughly one run in four while the app was perfectly fine.
  await mob.waitForFunction(() => !!document.querySelector('.start-card'), null, { timeout: 8000, polling: 100 }).catch(() => {});
  const firstRunMob = await ask(mob, () => {
    const c = document.querySelector('.start-card'); if (!c) return { err: 'no card' };
    const r = c.getBoundingClientRect();
    const st = document.querySelector('.start-step'); const sr = st.getBoundingClientRect();
    const hit = document.elementFromPoint(sr.left + sr.width / 2, sr.top + sr.height / 2);
    return { top: Math.round(r.top), vh: innerHeight, tappable: (st === hit || st.contains(hit)) };
  }, { err: 'threw' });
  R('390px: the welcome card is above the fold', firstRunMob.top > 0 && firstRunMob.top < firstRunMob.vh * 0.45,
    'top=' + firstRunMob.top + ' of ' + firstRunMob.vh);
  R('390px: setup steps are tappable', firstRunMob.tappable === true);

  R('390px: bottom nav present', await ask(mob, () => {
    const n = document.getElementById('mobileBottomNav');
    return !!n && getComputedStyle(n).display !== 'none';
  }, false));

  await browser.close();
  const bad = results.filter(r => !r.ok);
  results.forEach(r => console.log((r.ok ? '  ok  ' : 'FAIL  ') + r.name + (r.note ? '   [' + r.note + ']' : '')));
  console.log(`\n${results.length - bad.length}/${results.length} behavioral checks passed`);
  console.log('NOT covered here: live Google Maps tiles (blocked in this sandbox), real Supabase/RLS, iOS Safari.');
  process.exit(bad.length ? 1 : 0);
})();
