// Headless model soak: run N sim days (default 3), report zone level/pressure ranges, transfers, pump cycling, costs.
import { Sim } from '../js/sim.js';
const days = +(process.argv[2] || 3);
const s = new Sim();
const rng = {}; for (const z of s.zones.values()) rng[z.id] = { lo: 100, hi: 0, pLo: 1e9 };
const lq = {}; for (const l of s.links.values()) lq[l.id] = { max: 0, sum: 0 };
let n = 0, nanHit = null;
for (let i = 0; i < days * 17280; i++) {
  s.step(5); n++;
  for (const z of s.zones.values()) { const r = rng[z.id]; r.lo = Math.min(r.lo, z.level); r.hi = Math.max(r.hi, z.level); if (!z.cfg.node) r.pLo = Math.min(r.pLo, z.press); if (!Number.isFinite(z.level) && !nanHit) nanHit = z.id; }
  for (const l of s.links.values()) { lq[l.id].max = Math.max(lq[l.id].max, l.q); lq[l.id].sum += l.q; }
}
let bad = 0;
for (const z of s.zones.values()) {
  const r = rng[z.id]; const y = z.yday || {};
  const flag = (!z.cfg.closed && r.lo < 20) || (!z.cfg.node && r.pLo < 275) ? '  <-- CHECK' : '';
  if (flag) bad++;
  console.log(z.id.padEnd(7), 'level', (r.lo.toFixed(0) + '–' + r.hi.toFixed(0) + '%').padEnd(9), 'pmin', (z.cfg.node ? '—' : r.pLo.toFixed(0)).padStart(4), 'kPa', 'yday m3', (y.m3 || 0).toFixed(0).padStart(7), 'avg', z.cfg.avgDemandM3d.toFixed(0).padStart(6), '$', ((y.elec || 0) + (y.chem || 0)).toFixed(0).padStart(6), flag);
}
console.log('transfers (avg / max L/s):', Object.entries(lq).map(([k, v]) => `${k} ${(v.sum / n).toFixed(0)}/${v.max.toFixed(0)}`).join(' · '));
let maxStarts = 0, who = '';
for (const st of s.sites.values()) for (const p of st.allPumps()) { const perDay = p.starts / days; if (perDay > maxStarts) { maxStarts = perDay; who = st.id + ' ' + p.id; } }
console.log('max starts/day', maxStarts.toFixed(1), who);
console.log('active alarms:', [...s.alarms.list.values()].filter(a => a.active).map(a => a.text));
const m = s.sites.get('MWTP'); console.log('MWTP flow', m.plant.flow.toFixed(0), 'cap', m.plant.cap.toFixed(0), 'filt', m.plant.filtered.toFixed(3), 'filters', m.filters.map(f => `${f.id}:${f.state} hl${f.hl.toFixed(2)} w${f.washes}`).join(' '), 'cl2', m.cl2.res.toFixed(2));
const g = s.sites.get('GRB').aop; console.log('GRB AOP raw', g.raw.toFixed(1), 'out', g.out.toFixed(2), 'µg/L');
const T = s.totals(); console.log('yday Class A GA $', (m.yday?.ga || 0).toFixed(0), 'peak records', JSON.stringify(s.peak.confirmed.slice(0, 3)), 'alert hours', s.peak.alertHours.length);
let yd = { m3: 0, kwh: 0, elec: 0, chem: 0, ga: 0 }; for (const x of [...s.sites.values(), ...s.links.values()]) { const y = x.yday; if (!y) continue; if (!x.cfg.from) yd.m3 += y.m3; yd.kwh += y.kwh; yd.elec += y.elec; yd.chem += y.chem; yd.ga += y.ga; }
console.log('yesterday system: m3', yd.m3.toFixed(0), 'kWh', yd.kwh.toFixed(0), 'elec $', yd.elec.toFixed(0), 'GA(A) $', yd.ga.toFixed(0), 'chem $', yd.chem.toFixed(0), 'kWh/m3', (yd.kwh / yd.m3).toFixed(3));
if (nanHit) { console.log('FAIL: NaN in', nanHit); process.exitCode = 1; }
else if (bad) { console.log(`FAIL: ${bad} zone(s) below 20 % storage or < 275 kPa`); process.exitCode = 1; } else console.log('SOAK OK');
