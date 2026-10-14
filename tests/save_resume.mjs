// Save → restore round trip: a restored sim must evolve identically to the original (mid main-break scenario).
globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
const { Sim } = await import('../js/sim.js');
const { SCENARIOS, startScenario, scenarioStatus } = await import('../js/scenarios.js');
const { snapshot, restore } = await import('../js/save.js');
const sc = SCENARIOS.find(x => x.id === 'mainbreak');
const a = new Sim(); startScenario(a, sc); for (let i = 0; i < 300; i++) a.step(5);
sc.actions(a).find(x => x.id === 'crew').run(a);
const j = snapshot(a); console.log('snapshot bytes', j.length);
const b = restore(j);
for (let i = 0; i < 720; i++) { a.step(5); }
const stA = scenarioStatus(a).map(o => o.st).join(); const wA = a.zones.get('WAT4').level;
// restore again and run same steps -> compare
const c = restore(j); for (let i = 0; i < 720; i++) c.step(5);
console.log('orig after 1h', stA, wA.toFixed(3), '| restored', scenarioStatus(c).map(o => o.st).join(), c.zones.get('WAT4').level.toFixed(3), c.time.toTimeString().slice(0,8), a.time.toTimeString().slice(0,8), 'crewT kept', !!sc.crewT);
const ok = stA === scenarioStatus(c).map(o => o.st).join() && Math.abs(wA - c.zones.get('WAT4').level) < 1e-6 && a.time.getTime() === c.time.getTime() && !!sc.crewT;
console.log(ok ? 'SAVE/RESUME OK: restored run is identical to the original' : 'SAVE/RESUME FAIL');
process.exitCode = ok ? 0 : 1;
