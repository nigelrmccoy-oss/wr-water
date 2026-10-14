// Mass-balance assertion: over free play and every scenario (no action), water in = water out + Δstorage within 0.5 %.
//   in  = raw well pumping + river intake (Mannheim) + ASR recovery
//   out = customer demand actually delivered (incl. main-break leakage) + reservoir/clearwell overflow + Mannheim waste (FTW, backwash)
//   Δstorage = zones (reservoirs/towers, closed-zone proxies) + clearwells
import { Sim } from '../js/sim.js';
import { SCENARIOS, startScenario } from '../js/scenarios.js';
function stored(s) { let v = 0; for (const z of s.zones.values()) v += z.level / 100 * z.volM3; for (const x of s.sites.values()) if (x.cwVol) v += x.cwLevel / 100 * x.cwVol; return v; }
function run(label, s, hours) {
  const v0 = stored(s); let inn = 0, del = 0, spill = 0, waste = 0, unserved = 0; const dt = 5;
  for (let i = 0; i < hours * 720; i++) {
    s.step(dt);
    for (const x of s.sites.values()) {
      inn += (x.kind === 'wtp' || x.kind === 'surface' ? x.flowIn : x.flowOut) * dt / 1000;
      spill += (x.cwSpill || 0) * dt / 1000; waste += (x.wasteLs || 0) * dt / 1000;
    }
    for (const z of s.zones.values()) { del += (z.demandLs - (z.unservedLs || 0)) * dt / 1000; spill += (z.spillLs || 0) * dt / 1000; unserved += (z.unservedLs || 0) * dt / 1000; }
  }
  const dv = stored(s) - v0, resid = inn - del - spill - waste - dv, pct = 100 * Math.abs(resid) / Math.max(inn, 1);
  const ok = pct < 0.5;
  console.log(label.padEnd(10), `${hours}h in ${inn.toFixed(0)} delivered ${del.toFixed(0)} spill ${spill.toFixed(0)} waste ${waste.toFixed(0)} Δstore ${dv.toFixed(0)} unserved ${unserved.toFixed(0)} → residual ${resid.toFixed(1)} m³ (${pct.toFixed(3)} %)`, ok ? 'OK' : 'FAIL');
  return ok;
}
let ok = run('free-play', new Sim(), 24);
for (const sc of SCENARIOS) { const s = new Sim(); startScenario(s, sc); ok = run(sc.id, s, sc.durationH) && ok; }
console.log(ok ? 'MASS BALANCE OK (all < 0.5 %)' : 'MASS BALANCE FAIL');
process.exitCode = ok ? 0 : 1;
