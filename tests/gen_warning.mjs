// v0.3.2: (1) generator-running warning appears in the ICI decision note BEFORE the 14:00 alert window; (2) no NaN in any zone pressure
// (free play and every scenario); (3) initial jar-test dose equals the first computed one.
import { Sim } from '../js/sim.js';
import { SCENARIOS, startScenario } from '../js/scenarios.js';
let bad = 0; const fail = m => { console.log('FAIL', m); bad++; };
{ const s = new Sim(); const p0 = s.sites.get('MWTP').plant.paclReq; s.step(5); const p1 = s.sites.get('MWTP').plant.paclReq;
  if (Math.abs(p0 - p1) > 0.1) fail(`initial paclReq ${p0.toFixed(2)} != first computed ${p1.toFixed(2)}`); else console.log('paclReq init', p0.toFixed(2), 'first', p1.toFixed(2)); }
{ const s = new Sim(); const sc = SCENARIOS.find(x => x.id === 'icipeak'); startScenario(s, sc);
  const before = sc.decisionNote(s); if (/GENERATOR RUNNING/.test(before)) fail('warning shown with generator off');
  for (let i = 0; i < 20; i++) s.step(5);
  s.startGen('MWTP'); for (let i = 0; i < 240; i++) s.step(5);
  const hr = s.time.getHours(), note = sc.decisionNote(s);
  console.log('time', s.time.toTimeString().slice(0, 5), 'gen', s.sites.get('MWTP').pw.gen.state, '|', note.slice(0, 120));
  if (hr >= 14) fail('test must run before 14:00'); if (s.sites.get('MWTP').pw.gen.state !== 'RUN') fail('generator not running'); if (!/GENERATOR RUNNING/.test(note)) fail('no generator warning before the ICI window'); }
for (const id of [null, ...SCENARIOS.map(x => x.id)]) {
  const s = new Sim(); if (id) startScenario(s, SCENARIOS.find(x => x.id === id));
  for (let i = 0; i < 3600; i++) { s.step(5); if (i % 60 === 0) for (const z of s.zones.values()) if (!Number.isFinite(z.press) || !Number.isFinite(z.minPress)) { fail(`NaN/inf press in ${z.id} (${id || 'free'}) press=${z.press} min=${z.minPress}`); break; } }
}
console.log(bad ? `GEN_WARNING/PRESS FAILED (${bad})` : 'GEN WARNING + NO-NaN PRESSURE OK'); process.exit(bad ? 1 : 0);
