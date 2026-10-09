// Verify each scenario does NOT pass when the trainee does nothing (so the scenarios actually bite):
// at least one objective must end 'fail' (or stay 'pending' only where the objective requires an action).
import { Sim } from '../js/sim.js';
import { SCENARIOS, startScenario, scenarioStatus } from '../js/scenarios.js';
let ok = true;
for (const sc of SCENARIOS) {
  const t0 = Date.now();
  const s = new Sim(); startScenario(s, sc);
  const steps = Math.ceil((sc.durationH || 9) * 720);
  let nan = false;
  for (let i = 0; i < steps; i++) { s.step(5); if (i % 720 === 0) for (const z of s.zones.values()) if (!Number.isFinite(z.level)) nan = true; }
  const st = scenarioStatus(s).map(o => o.st);
  const fails = st.filter(x => x === 'fail').length;
  const good = st.some(x => x !== 'pass') && fails > 0 && !nan;
  console.log(sc.id.padEnd(9), `${sc.durationH}h`.padEnd(4), st.join(',').padEnd(40), good ? `OK (${fails} objective(s) FAIL without action)` : 'PROBLEM', `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!good) ok = false;
  const k4 = s.zones.get('KIT4'), w4 = s.zones.get('WAT4');
  const ex = { trip: () => `KIT4 min ${sc.minLevel.toFixed(0)}%`, turb: () => `peak filtered ${sc.maxFilt.toFixed(2)} ftw ${sc.ftw}`, cl2: () => `ERB ilk ${sc.ilk}`,
    outage: () => `min Kit4/5/6 ${sc.minLv.toFixed(0)}% gen ${s.sites.get('MWTP').pw.gen.state} latched ${[...s.sites.values()].filter(x => x.pw.latch).length}`,
    mainbreak: () => `WAT4 min lvl ${sc.minLv.toFixed(0)}% minP ${sc.minP.toFixed(0)} kPa`,
    backwash: () => `maxF2 ${sc.maxF2.toFixed(2)} NTU, >0.3 for ${(sc.over / 60).toFixed(0)} min`,
    dioxane: () => `max out ${sc.maxOut.toFixed(1)} µg/L ilk ${sc.ilk} avg ${(sc.m3 / sc.el * 1000).toFixed(0)} L/s`,
    icipeak: () => `avg ClassA ${sc.avgKw()?.toFixed(0)} kW, preLv ${sc.preLv?.toFixed(0)}% minLv ${sc.minLv.toFixed(0)}`,
  }[sc.id];
  if (ex) console.log('          ', ex());
}
console.log(ok ? 'NO-ACTION: all scenarios fail without trainee action' : 'NO-ACTION: PROBLEM');
process.exitCode = ok ? 0 : 1;
