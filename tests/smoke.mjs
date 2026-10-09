// Headless browser smoke test: loads the app over HTTP, exercises views, faceplates, scenarios, 3D map.
// Usage: node tests/smoke.mjs [baseUrl]   (needs playwright; see README)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw; for (const p of ['playwright', process.env.HOME + '/wwtp-qa/harness/node_modules/playwright', process.env.HOME + '/qa-2026-10-08/pw/node_modules/playwright']) { try { pw = require(p); break; } catch {} }
if (!pw) { console.error('playwright not found'); process.exit(2); }
const base = process.argv[2] || 'http://127.0.0.1:8765/';
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errors = [], warns = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
const shots = new URL('./shots/', import.meta.url).pathname;
await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const rows = await page.locator('#view-board tr.site').count();
console.log('board site rows:', rows);
await page.screenshot({ path: shots + '01-board.png' });
await page.locator('#view-board tr.site[data-site="GRB"]').click();
await page.waitForTimeout(600);
await page.screenshot({ path: shots + '02-faceplate-greenbrook.png' });
await page.locator('#faceplate .close').click();
await page.locator('.mann').click(); await page.waitForTimeout(500);
await page.screenshot({ path: shots + '03-faceplate-mannheim.png' });
await page.locator('#faceplate .close').click();
for (const v of ['alarms', 'costs', 'help']) { await page.locator(`#tabs [data-view=${v}]`).click(); await page.waitForTimeout(500); await page.screenshot({ path: shots + `04-${v}.png` }); }
await page.locator('#tabs [data-view=map]').click(); await page.waitForTimeout(4000);
await page.screenshot({ path: shots + '05-map3d.png' });
const mapReady = await page.evaluate(() => window.WR.map.ready);
console.log('3D map ready:', mapReady, 'mains segments:', await page.evaluate(() => window.WR.map.mainsCount));
await page.locator('#tabs [data-view=board]').click();

// Scenario 3: low Cl2 – operator switches to pump B via the faceplate
await page.selectOption('#scenarioSel', 'cl2'); await page.waitForTimeout(300);
await page.evaluate(() => { window.WR.sim.speed = 300; });
await page.waitForFunction(() => window.WR.sim.sites.get('ERB').cl2.fault.A, null, { timeout: 30000 });
await page.waitForTimeout(1200);
await page.locator('#bnAll').click().catch(() => {});
await page.locator('#view-board tr.site[data-site="ERB"]').click(); await page.waitForTimeout(400);
await page.locator('#faceplate [data-duty=B]').click();
await page.waitForTimeout(500);
if (await page.locator('#ilkReset').count()) await page.locator('#ilkReset').click();
await page.waitForTimeout(6000);
const cl2 = await page.evaluate(() => { const s = window.WR.sim; return { res: s.sites.get('ERB').cl2.res, ilk: s.sites.get('ERB').interlock, obj: s.scenario.objectives.map(o => o.eval(s.scenario, s)) }; });
console.log('scenario cl2:', JSON.stringify(cl2));
await page.screenshot({ path: shots + '06-scenario-cl2.png' });
await page.locator('#faceplate .close').click();

// Scenario 2: turbidity – raise PACl through the faceplate input
await page.selectOption('#scenarioSel', 'turb'); await page.waitForTimeout(300);
await page.locator('.mann').click(); await page.waitForTimeout(300);
await page.evaluate(() => { window.WR.sim.speed = 900; });
await page.waitForFunction(() => window.WR.sim.river.turbRaw > 40, null, { timeout: 60000 });
await page.fill('#faceplate [data-sp=paclSp]', '55'); await page.dispatchEvent('#faceplate [data-sp=paclSp]', 'change');
await page.waitForFunction(() => window.WR.sim.time.getTime() - window.WR.sim.scenario.t0 > 8.2 * 3600e3, null, { timeout: 120000 });
const turb = await page.evaluate(() => { const s = window.WR.sim; const P = s.sites.get('MWTP').plant; return { maxRaw: s.river.turbRaw, filt: P.filtered, obj: s.scenario.objectives.map(o => o.eval(s.scenario, s)) }; });
console.log('scenario turb:', JSON.stringify(turb));
await page.screenshot({ path: shots + '07-scenario-turb.png' });
await page.locator('#faceplate .close').click();

// Scenario 1: pump trip – raise Mannheim flow, wait lockout, reset
await page.selectOption('#scenarioSel', 'trip'); await page.waitForTimeout(300);
await page.evaluate(() => { window.WR.sim.speed = 60; });
await page.waitForFunction(() => window.WR.sim.findPump('K25', 'K25').trip, null, { timeout: 30000 });
await page.locator('#bnAll').click();
await page.evaluate(() => { const s = window.WR.sim; s.setSp('MWTP', 'flowSp', 600); s.speed = 900; });
await page.waitForFunction(() => { const s = window.WR.sim; return s.time.getTime() > s.findPump('K25', 'K25').lockoutUntil; }, null, { timeout: 60000 });
await page.evaluate(() => window.WR.sim.resetPump('K25', 'K25'));
await page.waitForFunction(() => { const s = window.WR.sim, sc = s.scenario; return s.time.getTime() - sc.tripT > 4.1 * 3600e3; }, null, { timeout: 120000 });
const trip = await page.evaluate(() => { const s = window.WR.sim; return { minLevel: s.scenario.minLevel, obj: s.scenario.objectives.map(o => o.eval(s.scenario, s)) }; });
console.log('scenario trip:', JSON.stringify(trip));
await page.screenshot({ path: shots + '08-scenario-trip.png' });

console.log('console errors:', errors.length ? errors : 'none');
console.log('console warnings:', warns.length);
await browser.close();
process.exitCode = errors.length || rows < 50 || !mapReady ? 1 : 0;
