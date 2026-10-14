import { Sim } from './sim.js';
import { UI } from './ui.js';
import { Map3D } from './map3d.js';
import { saveLocal, loadLocal, hasSave, saveInfo } from './save.js';

let sim = new Sim();
const ui = new UI(sim);
const map = new Map3D(document.getElementById('map3d'), sim, id => ui.openSite(id));
let mapInit = null;
ui.onView = v => { if (v === 'map' && !mapInit) mapInit = map.init().catch(e => console.error('map init failed', e)); if (v === 'map') setTimeout(() => map.resize(), 0); };
ui.onRestart = sc => {
  // fresh plant state for each scenario run
  sim = new Sim(); ui.sim = sim; map.sim = sim; ui.closeFp();
  ui.beginScenario(sc);
};
window.addEventListener('resize', () => map.resize());
// ---- save / resume (localStorage) ----
const btnSave = document.getElementById('btnSave'), btnResume = document.getElementById('btnResume');
function refreshResume() { const i = saveInfo(); btnResume.disabled = !i; btnResume.title = i ? `Resume session saved ${new Date(i.savedAt).toLocaleString('en-CA')} (sim ${new Date(i.simTime).toLocaleString('en-CA')}${i.scenario ? ', scenario ' + i.scenario : ''})` : 'No saved session'; }
btnSave.onclick = () => { try { const n = saveLocal(sim); sim.alarms.log(`Session SAVED (${Math.round(n / 1024)} kB)`); } catch (e) { console.warn('save failed', e); } refreshResume(); };
btnResume.onclick = () => {
  try {
    const s2 = loadLocal(); if (!s2) return;
    sim = s2; ui.sim = sim; map.sim = sim; ui.closeFp();
    const sel = document.getElementById('scenarioSel'); sel.value = sim.scenario ? sim.scenario.id : '';
    if (sim.scenario) ui.renderScenarioPanel(sim.scenario); else ui.showPanel(false);
    ui.refreshSoon = true;
  } catch (e) { console.warn('resume failed', e); }
};
setInterval(() => { if (!sim.paused) try { saveLocal(sim); refreshResume(); } catch {} }, 60000); // autosave every real minute
window.addEventListener('beforeunload', () => { try { saveLocal(sim); } catch {} });
refreshResume();
window.WR = { get sim() { return sim; }, ui, map, save: () => btnSave.click(), resume: () => btnResume.click(), hasSave }; // console access for instructors

let last = performance.now(), statusT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  if (!sim.paused) {
    let simDt = dtReal * sim.speed;
    while (simDt > 0) { const d = Math.min(5, simDt); sim.step(d); simDt -= d; }
  }
  ui.update(now);
  if (now - statusT > 500) { statusT = now; if (map.ready) map.updateStatus(); }
  map.render(ui.view === 'map');
}
requestAnimationFrame(frame);
