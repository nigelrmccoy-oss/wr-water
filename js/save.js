/** Save / resume (localStorage). Serialises the dynamic state of the Sim (not the static cfg), the alarm list/journal and the
 *  running scenario's own state; trends are not saved (they restart empty). */
import { Sim } from './sim.js';
import { SCENARIOS } from './scenarios.js';
export const SAVE_KEY = 'wrwater.save.v3';
const SKIP = new Set(['cfg', 'trend', 'allPumps', 'listeners']);
function plain(v, depth = 0) {
  if (v == null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (v instanceof Date) return { __date: v.getTime() };
  if (v instanceof Map) return { __map: [...v.entries()].map(([k, x]) => [k, plain(x, depth + 1)]) };
  if (Array.isArray(v)) return v.map(x => plain(x, depth + 1));
  if ('cfg' in v && depth > 0 && v.id && v.today) return { __ref: v.id }; // reference to a zone/site/link object
  const o = {}; for (const [k, x] of Object.entries(v)) { if (SKIP.has(k) || typeof x === 'function') continue; o[k] = plain(x, depth + 1); } return o;
}
function revive(v) {
  if (v == null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(revive);
  if ('__date' in v) return new Date(v.__date);
  if ('__map' in v) return new Map(v.__map.map(([k, x]) => [k, revive(x)]));
  const o = {}; for (const [k, x] of Object.entries(v)) o[k] = revive(x); return o;
}
function assignDeep(t, src) {
  for (const [k, v] of Object.entries(src)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Map) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) assignDeep(t[k], v);
    else if (Array.isArray(v) && Array.isArray(t[k]) && v.length === t[k].length && v.every(x => x && typeof x === 'object')) v.forEach((x, i) => (t[k][i] && typeof t[k][i] === 'object' ? assignDeep(t[k][i], x) : (t[k][i] = x)));
    else t[k] = v;
  }
}
export function snapshot(sim) {
  const sc = sim.scenario;
  const scState = sc ? Object.fromEntries(Object.entries(sc).filter(([k, v]) => !['objectives', 'hints', 'start', 'title', 'brief', 'id', 'durationH', 'actionTitle', 'erb', 'g'].includes(k) && typeof v !== 'function')) : null;
  return JSON.stringify({
    v: 3, savedAt: Date.now(), time: sim.time.getTime(), day: sim.day, month: sim.month, speed: sim.speed, rppPlan: sim.rppPlan, river: sim.river,
    totalsSince: sim.totalsSince, peak: sim.peak, feeders: sim.feeders, injected: sim.injected,
    zones: Object.fromEntries([...sim.zones].map(([k, z]) => [k, plain(z)])),
    sites: Object.fromEntries([...sim.sites].map(([k, s]) => [k, plain(s)])),
    links: Object.fromEntries([...sim.links].map(([k, l]) => [k, plain(l)])),
    alarms: { list: [...sim.alarms.list.entries()], events: sim.alarms.events.slice(0, 300) },
    scenario: sc ? { id: sc.id, state: plain(scState) } : null,
  });
}
export function restore(json) {
  const d = typeof json === 'string' ? JSON.parse(json) : json;
  if (d.v !== 3) throw new Error('unsupported save version');
  const sim = new Sim();
  sim.time = new Date(d.time); sim.day = d.day; sim.month = d.month; sim.speed = d.speed; sim.rppPlan = d.rppPlan; sim.river = d.river;
  sim.totalsSince = d.totalsSince; sim.peak = d.peak; sim.feeders = d.feeders || {}; sim.injected = d.injected || {};
  for (const [k, v] of Object.entries(d.zones)) if (sim.zones.has(k)) assignDeep(sim.zones.get(k), revive(v));
  for (const [k, v] of Object.entries(d.sites)) if (sim.sites.has(k)) assignDeep(sim.sites.get(k), revive(v));
  for (const [k, v] of Object.entries(d.links)) if (sim.links.has(k)) assignDeep(sim.links.get(k), revive(v));
  sim.alarms.list = new Map(d.alarms.list); sim.alarms.events = d.alarms.events;
  if (d.scenario) {
    const sc = SCENARIOS.find(s => s.id === d.scenario.id);
    if (sc) { Object.assign(sc, revive(d.scenario.state)); sim.scenario = sc; sc.hooks?.(sim); }
  }
  sim.alarms.log('Session RESUMED from saved state');
  return sim;
}
export function saveLocal(sim) { const j = snapshot(sim); localStorage.setItem(SAVE_KEY, j); return j.length; }
export function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; } }
export function loadLocal() { const j = localStorage.getItem(SAVE_KEY); return j ? restore(j) : null; }
export function saveInfo() { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY)); return d ? { savedAt: d.savedAt, simTime: d.time, scenario: d.scenario?.id || null } : null; } catch { return null; } }
