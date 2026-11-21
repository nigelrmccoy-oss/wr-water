/** OSM scenery tiles around WR sites: parse Overpass geom, fetch via cache-then-network. */
import { mapCache, keyFor } from './mapcache.js';
import { overpassQuery, tileQuery, lastSource } from './overpass.js';

export const TILE_DEG = 0.03; // ~3.3 km
export const MAX_BUILDINGS = 200; // largest footprints per tile
export const ATTR = '© OpenStreetMap contributors';

export function tileId(s, w) { return `${s.toFixed(4)},${w.toFixed(4)}`; }

/** Unique tiles covering every supply site (and a 1-tile halo). */
export function tilesForSites(sites) {
  const seen = new Set(), out = [];
  const origin = (lat, lon) => [Math.floor(lat / TILE_DEG) * TILE_DEG, Math.floor(lon / TILE_DEG) * TILE_DEG];
  for (const s of sites) {
    const [s0, w0] = origin(s.lat, s.lon);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      const s = +(s0 + di * TILE_DEG).toFixed(6), w = +(w0 + dj * TILE_DEG).toFixed(6);
      const id = tileId(s, w);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, s, w, n: +(s + TILE_DEG).toFixed(6), e: +(w + TILE_DEG).toFixed(6) });
    }
  }
  return out;
}

function ring(geom) {
  if (!geom || geom.length < 2) return null;
  return geom.map(p => [p.lon, p.lat]);
}

function footprintArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length - 1; i < n; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a) * 0.5 * 111320 * 111320 * Math.cos(43.43 * Math.PI / 180); // m², approx
}

const ROAD = /^(motorway|trunk|primary|secondary|tertiary|residential|unclassified)$/;
const WATER_WAY = /^(riverbank|river)$/;
const WATER_MADE = /^(water_tower|water_works|reservoir_covered|wastewater_plant)$/;

export function parseOsm(json) {
  const roads = [], buildings = [], water = [], towers = [];
  for (const el of json.elements || []) {
    const tags = el.tags || {};
    if (el.type === 'node' && WATER_MADE.test(tags.man_made) && el.lat != null) {
      towers.push({ lon: el.lon, lat: el.lat, kind: tags.man_made, name: tags.name || tags.man_made });
      continue;
    }
    const g = ring(el.geometry); if (!g) continue;
    if (tags.highway && ROAD.test(tags.highway)) { roads.push({ pts: g, kind: tags.highway }); continue; }
    if (tags.building) {
      if (g.length >= 4) buildings.push({ ring: g, h: Number(tags.height) || (Number(tags['building:levels']) || 2) * 3.5 });
      continue;
    }
    if (tags.natural === 'water' || WATER_WAY.test(tags.waterway) || tags.landuse === 'reservoir' || tags.landuse === 'basin' || tags.man_made === 'reservoir_covered') {
      if (g.length >= 4) water.push({ ring: g });
      continue;
    }
    if (WATER_MADE.test(tags.man_made) && el.geometry[0]) {
      towers.push({ lon: el.geometry[0].lon, lat: el.geometry[0].lat, kind: tags.man_made, name: tags.name || tags.man_made });
    }
  }
  if (buildings.length > MAX_BUILDINGS) {
    buildings.sort((a, b) => footprintArea(b.ring) - footprintArea(a.ring));
    buildings.length = MAX_BUILDINGS;
  }
  return { roads, buildings, water, towers };
}

/** Cache first, then Overpass. Returns { features, source } or null. */
export async function loadTile(tile, { cache = mapCache, query = overpassQuery } = {}) {
  const key = keyFor('osm', tile.id);
  const hit = await cache.get(key);
  if (hit && hit.roads) return { features: hit, source: 'cache' };
  const res = await query(tileQuery(tile.s, tile.w, tile.n, tile.e));
  if (!res) return null;
  const features = parseOsm(res.json);
  await cache.put(key, features);
  return { features, source: res.source };
}

export async function loadAllTiles(sites, onTile, { cache = mapCache, query = overpassQuery, concurrency = 2 } = {}) {
  const tiles = tilesForSites(sites);
  let i = 0, loaded = 0, fromCache = 0, fromNet = 0, misses = 0, stop = false;
  async function worker() {
    while (!stop) {
      const t = tiles[i++]; if (!t) return;
      const r = await loadTile(t, { cache, query });
      if (!r) { if (++misses >= 3) stop = true; continue; }
      misses = 0; loaded++;
      if (r.source === 'cache') fromCache++; else fromNet++;
      onTile?.(r.features, t, r.source);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { total: tiles.length, loaded, fromCache, fromNet, source: lastSource };
}
