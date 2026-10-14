// Scripted "good operator" for each scenario: proves every scenario is passable with the intended actions.
import { Sim } from '../js/sim.js';
import { SCENARIOS, startScenario, scenarioStatus } from '../js/scenarios.js';
const MIN = 60e3;
const ackAll = s => s.alarms.ackAll();
const PLAYS = {
  trip(s, sc, el) {
    if (el >= 5 && el < 6) { ackAll(s); s.setMode('PKW', 'K31', 'HAND'); s.setMode('PKW', 'K33', 'HAND'); for (const id of ['K80', 'K81', 'K82']) s.setMode('WOO', id, 'HAND'); }
    if (el >= 36 && el < 37) s.resetPump('STR', 'HL-1');
  },
  turb(s, sc, el) { // follow the jar test (≈1.15×), and trim plant flow while settled turbidity is high
    const P = s.sites.get('MWTP').plant;
    if (Math.floor(el) % 10 === 0 && el - Math.floor(el) < 0.09) { const want = Math.round(P.paclReq * 1.15); if (Math.abs(want - P.paclSp) >= 2) s.setSp('MWTP', 'paclSp', want); }
    if (el >= 60 && el < 61) s.setSp('MWTP', 'flowSp', 420);
  },
  cl2(s, sc, el) { if (el >= 4 && el < 5) { ackAll(s); s.setSp('ERB', 'cl2Duty', 'B'); } if (el >= 6 && el < 7) s.resetInterlock('ERB'); },
  outage(s, sc, el) {
    const m = s.sites.get('MWTP');
    if (el >= 4 && el < 5) { ackAll(s); s.resetGenFault('MWTP'); }
    if (el >= 6 && el < 7) { s.resetPowerLatch('MWTP'); s.setLink('MANITOU', 'mode', 'AUTO'); for (const id of ['K31', 'K33']) s.setMode('PKW', id, 'HAND'); for (const id of ['K80', 'K81']) s.setMode('WOO', id, 'HAND'); }
    if (sc.restoreT && s.feeders.MANN.up) { // staggered restart: one site per 60 s
      const t = s.time.getTime(); if (!sc._last || t - sc._last >= 60e3) { const id = ['K26', 'K25', 'K29', 'K24', 'K93', 'K94', 'K23', 'K21', 'K21A', 'K91', 'K92', 'ASR5', 'RCW2', 'RCW3', 'RCW4', 'MWTP'].find(x => s.sites.get(x).pw.latch); if (id) { s.resetPowerLatch(id); sc._last = t; } }
    }
  },
  mainbreak(s, sc, el) {
    const A = n => sc.actions(s).find(a => a.id === n);
    if (el >= 7 && el < 8) { ackAll(s); A('crew').run(s); s.setLink('ERBBV', 'mode', 'AUTO'); s.setLink('ERBBV', 'sp', 75); s.setLink('ERBPRV', 'sp', 75); s.setLink('MV2', 'sp', 70); for (const p of s.sites.get('ERB').wells) s.setMode('ERB', p.id, 'HAND'); s.setMode('LAU', 'W25', 'HAND'); s.setLink('STJM', 'manQ', 30); }
    if (el >= 300 && el < 301) s.setLink('STJM', 'mode', 'AUTO');
    if (sc.arriveT && !sc.isoT) A('iso').run(s);
    if (sc.isoT && !sc.decision && s.time.getTime() - sc.isoT > 10 * MIN) A(sc.correct()).run(s);
  },
  backwash(s, sc, el) {
    if (el >= 2 && el < 3) s.startBackwash('MWTP', 'F2');
    if (sc.f2T && !s.sites.get('MWTP').filters.some(f => f.state === 'WASH') && !sc.f1T) s.startBackwash('MWTP', 'F1');
  },
  dioxane(s, sc, el) {
    if (sc.alarmT && !sc.ackT) ackAll(s);
    if (el >= 15 && el < 16) { s.setSp('GRB', 'uvKw', 280); s.setSp('GRB', 'h2o2', 10); }
    if (el >= 40 && el < 41) s.setMode('GRB', 'K5A', 'OFF');
  },
  icipeak(s, sc, el) {
    const h = s.time.getHours() + s.time.getMinutes() / 60;
    if (el >= 1 && el < 2) { for (const id of ['Z4PS', 'Z5PS', 'Z6PS']) s.setLink(id, 'sp', 95); for (const id of ['K31', 'K33']) s.setMode('PKW', id, 'HAND'); }
    if (h >= 13.9 && h < 13.95) { s.startGen('MWTP'); }
    if (h >= 18.05 && h < 18.1) { s.stopGen('MWTP'); for (const id of ['Z4PS', 'Z5PS', 'Z6PS']) s.setLink(id, 'sp', 72); }
  },
};
const DEBUG = process.env.DEBUG;
let ok = true;
for (const sc of SCENARIOS) {
  if (DEBUG && sc.id !== DEBUG) continue;
  const s = new Sim(); startScenario(s, sc); const t0 = s.time.getTime();
  const steps = Math.ceil((sc.durationH || 9) * 720);
  for (let i = 0; i < steps; i++) { const el = (s.time.getTime() - t0) / MIN; PLAYS[sc.id]?.(s, sc, el); s.step(5);
    if (DEBUG && i % 180 === 0) console.log(s.time.toTimeString().slice(0, 5), [...s.zones.values()].filter(z => ['KIT4', 'KIT5', 'KIT6', 'WAT4', 'WAT5'].includes(z.id)).map(z => `${z.id} ${z.level.toFixed(0)}% ${z.press.toFixed(0)}kPa in${z.inLs.toFixed(0)} out${z.outLs.toFixed(0)} d${z.demandLs.toFixed(0)}`).join(' | '), '||', [...s.links.values()].filter(l => ['Z4PS', 'MV3', 'ERBBV', 'ERBPRV', 'MV2', 'STJM'].includes(l.id)).map(l => `${l.id} ${l.q.toFixed(0)}`).join(' '), 'cA', s.classAKw.toFixed(0)); }
  const st = scenarioStatus(s).map(o => o.st);
  const pass = st.every(x => x === 'pass');
  console.log(sc.id.padEnd(9), st.join(',').padEnd(40), pass ? 'OK (all objectives pass with scripted actions)' : 'PROBLEM');
  if (!pass) { ok = false; console.log('   ', scenarioStatus(s).filter(o => o.st !== 'pass').map(o => o.text).join(' | ')); }
}
console.log(ok ? 'ACTION: every scenario passable' : 'ACTION: PROBLEM');
process.exitCode = ok ? 0 : 1;
