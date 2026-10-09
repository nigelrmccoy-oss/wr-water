import { Sim } from './sim.js';
import { UI } from './ui.js';
import { Map3D } from './map3d.js';

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
window.WR = { get sim() { return sim; }, ui, map }; // console access for instructors

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
