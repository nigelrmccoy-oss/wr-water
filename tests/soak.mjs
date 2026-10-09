// Headless model soak: run N sim days, report zone level ranges, pump cycling and cost totals.
import { Sim } from '../js/sim.js';
const days = +(process.argv[2] || 2);
const s = new Sim();
const rng = {}; for (const z of s.zones.values()) rng[z.id] = [100, 0];
for (let i = 0; i < days * 17280; i++) { s.step(5); for (const z of s.zones.values()) { rng[z.id][0] = Math.min(rng[z.id][0], z.level); rng[z.id][1] = Math.max(rng[z.id][1], z.level); } }
let bad = 0;
for (const z of s.zones.values()) { const [lo, hi] = rng[z.id]; console.log(z.id.padEnd(4), 'level', lo.toFixed(0) + '–' + hi.toFixed(0) + '%', 'yday m3', (z.yday?.m3 || 0).toFixed(0), 'avg25', z.cfg.avgDemandM3d, 'kWh', (z.yday?.kwh || 0).toFixed(0), '$', ((z.yday?.elec || 0) + (z.yday?.chem || 0)).toFixed(0)); if (lo < 20) bad++; }
let maxStarts = 0, who = '';
for (const st of s.sites.values()) for (const p of st.allPumps()) { const perDay = p.starts / days; if (perDay > maxStarts) { maxStarts = perDay; who = st.id + ' ' + p.id; } }
console.log('max starts/day', maxStarts.toFixed(1), who);
console.log('active alarms:', [...s.alarms.list.values()].filter(a => a.active).map(a => a.text));
const m = s.sites.get('MWTP'); console.log('MWTP flow', m.plant.flow.toFixed(0), 'filt', m.plant.filtered.toFixed(2), 'cl2', m.cl2.res.toFixed(2), 'yday $', (m.yday.elec + m.yday.chem).toFixed(0), m.yday.chemDetail);
if (bad) { console.log('FAIL: zone below 20%'); process.exitCode = 1; } else console.log('SOAK OK');
