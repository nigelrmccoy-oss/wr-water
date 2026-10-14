// Headless browser smoke test (v0.2): loads the app over HTTP, exercises every view, faceplates (power, filters, AOP),
// transfers, costs/ICI, the 3D map and drives several scenarios THROUGH THE UI. Fails on any console error.
// Usage: node tests/smoke.mjs [baseUrl]   (needs playwright; see README)
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
let pw; for (const p of ['playwright', process.env.PLAYWRIGHT_PATH, process.env.HOME + '/wwtp-qa/harness/node_modules/playwright', process.env.HOME + '/qa-2026-10-08/pw/node_modules/playwright']) { try { pw = require(p); break; } catch {} }
if (!pw) { console.error('playwright not found'); process.exit(2); }
const base = process.argv[2] || 'http://127.0.0.1:8765/';
const HEADED = !!process.env.HEADED; // HEADED=1 SLOWMO=300 → watch it on the desktop
// Never let Chrome throttle the page: the sim advances on requestAnimationFrame, and a headed window that is covered/unfocused
// on the desktop otherwise gets its rAF throttled or paused, so the sim stalls and waits time out.
const NOTHROTTLE = ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'];
const browser = await pw.chromium.launch(HEADED ? { headless: false, slowMo: +(process.env.SLOWMO || 300), args: NOTHROTTLE } : { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', ...NOTHROTTLE] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [], warns = [], dialogs = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
const shots = new URL('./shots/', import.meta.url).pathname; fs.mkdirSync(shots, { recursive: true });
const shot = n => page.screenshot({ path: shots + n + '.png' });
const W = (fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 200 }).catch(async e => { // dump sim state on timeout
  console.log('WAIT TIMEOUT state:', JSON.stringify(await page.evaluate(() => { const s = window.WR.sim; return { sc: s.scenario?.id, t: s.time.toString(), paused: s.paused, speed: s.speed, vis: document.visibilityState }; }).catch(() => null))); throw e; });
const ev = (fn, arg) => page.evaluate(fn, arg);
const results = {};
const close = () => page.locator('#faceplate .close').click().catch(() => {});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const rows = await page.locator('#view-board tr.site').count();
const zones = await page.locator('#view-board .zone').count();
console.log('board site rows:', rows, 'zone tiles:', zones);
await shot('01-board');
// site faceplate with AOP block
await page.locator('#view-board tr.site[data-site="GRB"]').click(); await page.waitForTimeout(500);
const aopInputs = await page.locator('#faceplate [data-sp=uvKw]').count();
await shot('02-faceplate-greenbrook'); await close();
// Mannheim faceplate: power block + filter tiles
await page.locator('.mann').click(); await page.waitForTimeout(500);
const filterTiles = await page.locator('#faceplate .ftile').count(), genBtns = await page.locator('#faceplate [data-gen]').count();
console.log('Greenbrook AOP inputs:', aopInputs, '· Mannheim filter tiles:', filterTiles, '· power buttons:', genBtns);
await shot('03-faceplate-mannheim'); await close();
// zone faceplate
await page.locator('#view-board .zone[data-zone="KIT4"]').click(); await page.waitForTimeout(400); await shot('03b-zone-kit4'); await close();
const helpOk = await ev(() => document.querySelector('#view-help').innerText.includes('Scenarios') && document.querySelectorAll('#view-help tr').length > 20);
console.log('help has v0.2 network + scenarios:', helpOk); if (!helpOk) errors.push('help not updated');
for (const v of ['net', 'alarms', 'costs', 'help']) { await page.locator(`#tabs [data-view=${v}]`).click(); await page.waitForTimeout(700); await shot(`04-${v}`); }
await page.locator('#tabs [data-view=costs]').click(); await page.waitForTimeout(500);
const costs = await ev(() => ({ ont: !!document.querySelector('#trOnt'), rpp: !!document.querySelector('#rppPlan'), txt: document.querySelector('#view-costs').innerText.includes('Class A') }));
await page.selectOption('#rppPlan', 'TIERED'); await page.waitForTimeout(300);
const rpp = await ev(() => window.WR.sim.rppPlan);
console.log('costs tab:', JSON.stringify(costs), 'rppPlan →', rpp);
// transfers: put Erb St BV in MAN via the UI
await page.locator('#tabs [data-view=net]').click(); await page.waitForTimeout(500);
await page.locator('[data-lm="ERBBV|MAN"]').click(); await page.waitForTimeout(300);
const erbMode = await ev(() => window.WR.sim.links.get('ERBBV').mode);
console.log('transfers rows:', await page.locator('#view-net tr.link').count(), 'ERBBV mode via UI:', erbMode);
await page.locator('#tabs [data-view=map]').click(); await page.waitForTimeout(4000);
await shot('05-map3d');
const mapReady = await ev(() => window.WR.map.ready);
console.log('3D map ready:', mapReady, 'mains segments:', await ev(() => window.WR.map.mainsCount));
await page.locator('#tabs [data-view=board]').click();

// ── cl2: switch to pump B via the faceplate
console.log('[step] cl2', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'cl2'); await page.waitForTimeout(300);
await ev(() => { window.WR.sim.speed = 300; });
await W(() => window.WR.sim.sites.get('ERB').cl2.fault.A, null, 30000);
await page.waitForTimeout(1200);
await page.locator('#bnAll').click().catch(() => {});
await page.locator('#view-board tr.site[data-site="ERB"]').click(); await page.waitForTimeout(400);
await page.locator('#faceplate [data-duty=B]').click(); await page.waitForTimeout(500);
if (await page.locator('#ilkReset').count()) await page.locator('#ilkReset').click();
await page.waitForTimeout(6000);
results.cl2 = await ev(() => { const s = window.WR.sim; return s.scenario.objectives.map(o => o.eval(s.scenario, s)); });
await shot('06-scenario-cl2'); await close();

// ── trip: ack, start Parkway wells via faceplate, reset HL-1 after lock-out
console.log('[step] trip', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'trip'); await page.waitForTimeout(300);
await W(() => window.WR.sim.findPump('STR', 'HL-1').trip, null, 30000);
await page.locator('#bnAll').click();
await page.locator('#view-board tr.site[data-site="PKW"]').click(); await page.waitForTimeout(400);
for (const id of ['K31', 'K33']) await page.locator(`#faceplate [data-mode="PKW|${id}|HAND"]`).click().catch(e => errors.push('no HAND button ' + id));
await close();
await ev(() => { const s = window.WR.sim; for (const id of ['K80', 'K81', 'K82']) s.setMode('WOO', id, 'HAND'); s.speed = 900; });
await W(() => { const s = window.WR.sim; return s.time.getTime() > s.findPump('STR', 'HL-1').lockoutUntil; });
await ev(() => window.WR.sim.resetPump('STR', 'HL-1'));
await W(() => { const s = window.WR.sim, sc = s.scenario; return s.time.getTime() - sc.tripT > 4.1 * 3600e3; }, null, 120000);
results.trip = await ev(() => { const s = window.WR.sim; return s.scenario.objectives.map(o => o.eval(s.scenario, s)); });
await shot('07-scenario-trip');

// ── outage: generator via faceplate power buttons, restarts via scenario action buttons
console.log('[step] outage', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'outage'); await page.waitForTimeout(300);
await ev(() => { window.WR.sim.speed = 60; });
await W(() => window.WR.sim.sites.get('MWTP').pw.gen.state === 'FAIL', null, 30000);
await page.locator('#bnAll').click().catch(() => {});
await page.locator('.mann').click(); await page.waitForTimeout(400);
await page.locator('#faceplate [data-gen=reset]').click();
await W(() => window.WR.sim.sites.get('MWTP').pw.gen.state === 'RUN', null, 30000);
await page.locator('#faceplate [data-gen=restart]').click(); await page.waitForTimeout(300);
await shot('08-outage-on-gen'); await close();
await ev(() => { const s = window.WR.sim; s.setLink('MANITOU', 'mode', 'AUTO'); for (const id of ['K31', 'K33']) s.setMode('PKW', id, 'HAND'); for (const id of ['K80', 'K81']) s.setMode('WOO', id, 'HAND'); s.speed = 900; });
await W(() => window.WR.sim.scenario.restoreT, null, 90000);
await ev(() => { window.WR.sim.speed = 30; });
// v0.3: restarts are spaced in SIM time (≥ 65 sim-s apart → never more than 2 per 2-min inrush window), not wall-clock,
// so the result no longer depends on frame rate (v0.2 used 1.6 s real ≈ 48 sim-s at 30×, which allowed 3–4 restarts per 2 min on slow frames).
const rstLog = [];
for (let k = 0; k < 80; k++) {
  const st = await ev(() => { const s = window.WR.sim, sc = s.scenario; return { left: [...document.querySelectorAll('#scAct button[data-act^="rst-"]')].length, el: (s.time.getTime() - sc.restoreT) / 60e3, t: s.time.getTime() }; });
  if (!st.left || st.el > 55) break;
  const b = page.locator('#scAct button[data-act^="rst-"]:not([disabled])').first();
  if (await b.count()) { rstLog.push((await b.getAttribute('data-act')) + '@' + st.el.toFixed(1)); await b.click(); await W(t => window.WR.sim.time.getTime() >= t + 65e3, st.t, 30000); }
  else await W(t => window.WR.sim.time.getTime() >= t + 10e3, st.t, 30000); // nothing restartable yet: wait 10 sim-s
}
console.log('outage restarts (site@min after restore):', rstLog.join(' '));
results.outageInrushTrips = await ev(() => window.WR.sim.scenario.inrushTrips);
await shot('09-outage-restarts');
await ev(() => { window.WR.sim.speed = 900; });
await W(() => { const s = window.WR.sim, sc = s.scenario; return s.time.getTime() - sc.restoreT > 61 * 60e3; }, null, 90000);
results.outage = await ev(() => { const s = window.WR.sim; return s.scenario.objectives.map(o => o.eval(s.scenario, s)); });

// ── mainbreak: crew/isolation/decision buttons
console.log('[step] mainbreak', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'mainbreak'); await page.waitForTimeout(300);
await ev(() => { window.WR.sim.speed = 120; });
await W(() => window.WR.sim.scenario.breakT, null, 30000);
await page.locator('#bnAll').click().catch(() => {});
await page.locator('#scAct [data-act=crew]').click();
await page.locator('#tabs [data-view=net]').click(); await page.waitForTimeout(300);
await page.locator('[data-lm="ERBBV|AUTO"]').click();
await ev(() => { const s = window.WR.sim; s.setLink('ERBBV', 'sp', 75); s.setLink('ERBPRV', 'sp', 75); for (const p of s.sites.get('ERB').wells) s.setMode('ERB', p.id, 'HAND'); s.setMode('LAU', 'W25', 'HAND'); s.setLink('STJM', 'manQ', 30); });
await page.locator('#tabs [data-view=board]').click();
await W(() => window.WR.sim.scenario.arriveT, null, 60000);
await page.waitForTimeout(500);
await page.locator('#scAct [data-act=iso]').click(); await page.waitForTimeout(800);
await page.locator(`#scAct [data-act=${await ev(() => window.WR.sim.scenario.correct())}]`).click();
await shot('10-mainbreak-decision');
await ev(() => { window.WR.sim.speed = 900; });
await W(() => { const s = window.WR.sim, sc = s.scenario; return s.time.getTime() - sc.breakT > 4.05 * 3600e3; }, null, 120000);
results.mainbreak = await ev(() => { const s = window.WR.sim; return s.scenario.objectives.map(o => o.eval(s.scenario, s)); });

// ── backwash: filter tile buttons
console.log('[step] backwash', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'backwash'); await page.waitForTimeout(300);
await page.locator('.mann').click(); await page.waitForTimeout(500);
await page.locator('#faceplate [data-bw=F2]').click(); await page.waitForTimeout(300);
await ev(() => { window.WR.sim.speed = 600; });
await W(() => window.WR.sim.scenario.f2T, null, 60000);
await page.waitForTimeout(600);
await page.locator('#faceplate [data-bw=F1]').click();
await shot('11-backwash');
await ev(() => { window.WR.sim.speed = 900; });
await W(() => { const s = window.WR.sim; return s.time.getTime() - s.scenario.t0 > 4.6 * 3600e3; }, null, 120000);
results.backwash = await ev(() => { const s = window.WR.sim; return s.scenario.objectives.map(o => o.eval(s.scenario, s)); });
await close();

// ── dioxane: AOP setpoints through the faceplate, take K5A to OFF
console.log('[step] dioxane', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'dioxane'); await page.waitForTimeout(300);
await page.locator('#view-board tr.site[data-site="GRB"]').click(); await page.waitForTimeout(400);
await page.fill('#faceplate [data-sp=uvKw]', '280'); await page.dispatchEvent('#faceplate [data-sp=uvKw]', 'change');
await page.fill('#faceplate [data-sp=h2o2]', '10'); await page.dispatchEvent('#faceplate [data-sp=h2o2]', 'change');
await ev(() => { window.WR.sim.speed = 120; });
await W(() => window.WR.sim.scenario.alarmT, null, 60000);
await page.locator('#bnAll').click().catch(() => {});
await page.locator('#faceplate [data-mode="GRB|K5A|OFF"]').click();
await shot('12-dioxane');
await ev(() => { window.WR.sim.speed = 900; });
await W(() => { const s = window.WR.sim; return s.time.getTime() - s.scenario.t0 > 4.6 * 3600e3; }, null, 120000);
results.dioxane = await ev(() => { const s = window.WR.sim; return { obj: s.scenario.objectives.map(o => o.eval(s.scenario, s)), uv: s.sites.get('GRB').aop.uvKw, h2o2: s.sites.get('GRB').aop.h2o2 }; });
await close();

// ── icipeak: load only (peak banner + decision note), no play-through
console.log('[step] icipeak', new Date().toISOString().slice(11,19));
await page.selectOption('#scenarioSel', 'icipeak'); await page.waitForTimeout(300);
await ev(() => { window.WR.sim.speed = 900; });
await W(() => window.WR.sim.time.getHours() >= 15, null, 60000);
results.icipeak = await ev(() => ({ alert: !!window.WR.sim.peakNow?.alert, ici: document.querySelector('#ici').textContent, note: document.querySelector('#scAct')?.innerText || '' }));
await page.locator('#tabs [data-view=costs]').click(); await page.waitForTimeout(800); await shot('13-icipeak-costs');

const geo = await ev(() => { const p = document.querySelector('#scenarioPanel').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return { panelRight: Math.round(p.right), mainLeft: Math.round(m.left), visible: !document.querySelector('#scenarioPanel').classList.contains('hidden') }; });
console.log('scenario panel vs content (1500×900):', JSON.stringify(geo)); if (geo.visible && geo.panelRight > geo.mainLeft) errors.push('scenario panel overlaps tab content');
await page.locator('#tabs [data-view=help]').click(); await page.waitForTimeout(500); await shot('14-icipeak-help-docked');
// header "Delivered today" = Σ zone delivered m³
await ev(() => { window.WR.sim.paused = true; window.WR.ui.refreshSoon = true; }); await page.waitForTimeout(800);
const today = await ev(() => { const k = [...document.querySelectorAll('#kpis div')].find(d => d.textContent.startsWith('Delivered')); const hdr = +k.textContent.replace(/^[^0-9]*\d\d:\d\d|[^0-9.]/g, '').replace(/^\D+/, ''); let z = 0; for (const x of window.WR.sim.zones.values()) z += x.today.m3; return { label: k.querySelector('span').textContent, hdrText: k.textContent, sumZones: Math.round(z) }; });
const hdrNum = +today.hdrText.slice(today.label.length).replace(/[^0-9]/g, '');
console.log('header vs Σ zones:', JSON.stringify(today), 'parsed', hdrNum); if (Math.abs(hdrNum - today.sumZones) > Math.max(2, 0.001 * today.sumZones)) errors.push('header Delivered m³ != Σ zones');
// save / resume round trip through the UI buttons
const before = await ev(() => { window.WR.save(); return { t: window.WR.sim.time.getTime(), k4: window.WR.sim.zones.get('KIT4').level, sc: window.WR.sim.scenario?.id }; });
await ev(() => { const s = window.WR.sim; s.paused = false; s.speed = 900; }); await page.waitForTimeout(3000);
const progressed = await ev(() => { const s = window.WR.sim; s.paused = true; return s.time.getTime(); });
await page.locator('#btnResume').click(); await page.waitForTimeout(300);
const after = await ev(() => { const s = window.WR.sim; s.paused = true; return { t: s.time.getTime(), sc: s.scenario?.id, resumedMsg: s.alarms.events.some(e => /RESUMED/.test(JSON.stringify(e))), panel: !document.querySelector('#scenarioPanel').classList.contains('hidden') }; });
// restored sim runs on between click and read (SLOWMO), so require: jumped back to within 10 sim-min of the save point, well before 'progressed'
results.saveResume = progressed - before.t > 10 * 60e3 && after.t >= before.t && after.t - before.t < (progressed - before.t) / 2 && before.sc === after.sc && after.panel && after.resumedMsg;
console.log('save/resume:', JSON.stringify({ before, progressed, after }));
await shot('15-resumed');
for (const [k, v] of Object.entries(results)) console.log(`scenario ${k}:`, JSON.stringify(v));
const allPass = ['cl2', 'trip', 'outage', 'mainbreak', 'backwash'].every(k => results[k].every(x => x === 'pass')) && results.dioxane.obj.every(x => x === 'pass');
console.log('UI-driven scenarios all pass:', allPass);
console.log('dialogs (operator feedback alerts):', dialogs.length ? dialogs : 'none');
console.log('console errors:', errors.length ? errors : 'none');
console.log('console warnings:', warns.length);
await browser.close();
const fails = { errors: errors.length, rows: rows < 50, map: !mapReady, scenarios: !allPass, aop: !aopInputs, filters: filterTiles !== 4, ici: !results.icipeak.alert || !results.icipeak.note.includes('Class A'), inrush: results.outageInrushTrips !== 0, save: !results.saveResume };
console.log('failure flags:', JSON.stringify(fails));
process.exitCode = Object.values(fails).some(Boolean) ? 1 : 0;
