/** Overpass client: local Ontario instance first, then public mirrors. Fail soft. */
export const UA = 'wr-water/0.4 (Region of Waterloo training sim; https://github.com/nigelrmccoy-oss/wr-water)';
export const ENDPOINTS = [
  { id: 'local', url: 'http://127.0.0.1:12346/api/interpreter', timeoutMs: 5000 },
  { id: 'overpass-api.de', url: 'https://overpass-api.de/api/interpreter', timeoutMs: 20000 },
  { id: 'kumi', url: 'https://overpass.kumi.systems/api/interpreter', timeoutMs: 20000 },
];

export let lastSource = null; // endpoint id or 'cache' or null
export let lastError = '';
const coolUntil = new Map(); // endpoint id → epoch ms; skip a downed server for a while

async function tryEndpoint(ep, ql, fetchFn) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ep.timeoutMs);
  try {
    const url = ep.url + (ep.url.includes('?') ? '&' : '?') + 'client=' + encodeURIComponent('wr-water/0.4');
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
    if (typeof window === 'undefined') headers['User-Agent'] = UA; // browsers forbid setting UA
    const res = await fetchFn(url, { method: 'POST', headers, body: 'data=' + encodeURIComponent(ql), signal: ctrl.signal });
    if (!res.ok) throw new Error(`${ep.id} HTTP ${res.status}`);
    const json = await res.json();
    if (!json || !Array.isArray(json.elements)) throw new Error(`${ep.id} bad body`);
    return json;
  } finally { clearTimeout(t); }
}

/** Query endpoints in order. Returns { json, source } or null. */
export async function overpassQuery(ql, { fetchFn = fetch, endpoints = ENDPOINTS } = {}) {
  lastError = '';
  for (const ep of endpoints) {
    if (Date.now() < (coolUntil.get(ep.id) || 0)) continue;
    try {
      const json = await tryEndpoint(ep, ql, fetchFn);
      lastSource = ep.id;
      coolUntil.delete(ep.id);
      return { json, source: ep.id };
    } catch (e) {
      lastError = (e && e.name === 'AbortError') ? `${ep.id} timeout` : String(e?.message || e);
      // local is either still starting or down — don't retry it on every tile
      coolUntil.set(ep.id, Date.now() + (ep.id === 'local' ? 120000 : 30000));
    }
  }
  return null;
}

export function tileQuery(s, w, n, e, timeoutS = 25) {
  const bb = `${s},${w},${n},${e}`;
  return `[out:json][timeout:${timeoutS}];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$"](${bb});
  way["building"](${bb});
  way["natural"="water"](${bb});
  way["waterway"~"^(riverbank|river)$"](${bb});
  way["landuse"~"^(reservoir|basin)$"](${bb});
  way["man_made"~"^(water_tower|water_works|reservoir_covered|wastewater_plant)$"](${bb});
  node["man_made"~"^(water_tower|water_works|reservoir_covered)$"](${bb});
);
out geom;`;
}
