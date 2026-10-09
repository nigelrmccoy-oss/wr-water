// Verify each scenario FAILS when the trainee does nothing (so the scenarios actually bite).
import { Sim } from '../js/sim.js';
import { SCENARIOS, startScenario, scenarioStatus } from '../js/scenarios.js';
let ok = true;
for (const sc of SCENARIOS) {
  const s = new Sim(); startScenario(s, sc);
  for (let i = 0; i < 9 * 720; i++) s.step(5);
  const st = scenarioStatus(s).map(o => o.st);
  const failsOrPending = st.some(x => x !== 'pass');
  console.log(sc.id.padEnd(5), st.join(','), failsOrPending ? 'OK (not passed without action)' : 'PROBLEM: passes with no action');
  if (!failsOrPending) ok = false;
  if (sc.id === 'turb') console.log('   peak filtered', s.sites.get('MWTP').plant.filtered.toFixed(2), 'ftw', sc.ftw, 'K4M level', s.zones.get('K4M').level.toFixed(0));
}
process.exitCode = ok ? 0 : 1;
