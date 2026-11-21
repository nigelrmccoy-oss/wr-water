// v0.4: cache hit/miss, version-prefixed keys, LRU eviction at a small cap (oldest-used first)
import { MapCache, MemoryStore, keyFor, CACHE_VER } from '../js/mapcache.js';
import { parseOsm, tilesForSites, tileId } from '../js/scenery.js';

let bad = 0; const fail = m => { console.log('FAIL', m); bad++; };

const cap = 220; // two ~98 B rows fit; a third evicts the oldest-used
const c = new MapCache({ capBytes: cap, backend: new MemoryStore() });

// miss
if (await c.get(keyFor('osm', 'a')) !== null) fail('empty cache should miss');

await c.put(keyFor('osm', 'a'), { n: 'A', pad: 'x'.repeat(80) });
await c.put(keyFor('osm', 'b'), { n: 'B', pad: 'y'.repeat(80) });
const a1 = await c.get(keyFor('osm', 'a'));
if (!a1 || a1.n !== 'A') fail('hit a');
const b1 = await c.get(keyFor('osm', 'b'));
if (!b1 || b1.n !== 'B') fail('hit b');
console.log('hit/miss ok');

// version prefix
const ka = keyFor('osm', 'a');
if (!ka.startsWith(CACHE_VER + ':')) fail('key not version-prefixed: ' + ka);
if (await c.get('v3:osm:a') !== null) fail('foreign version should miss');
console.log('version key', ka);

// LRU: touch A so it is newest, then insert C large enough to evict the oldest-used (B)
await c.get(keyFor('osm', 'a')); // A becomes most-recently used
await c.put(keyFor('osm', 'c'), { n: 'C', pad: 'z'.repeat(80) });
const after = {
  a: await c.get(keyFor('osm', 'a')),
  b: await c.get(keyFor('osm', 'b')),
  c: await c.get(keyFor('osm', 'c')),
};
const st = await c.stats();
console.log('after LRU', { hasA: !!after.a, hasB: !!after.b, hasC: !!after.c, count: st.count, bytes: st.bytes, cap, notice: st.notice });
if (!after.a) fail('A was recently used and should be kept');
if (!after.c) fail('C was just written and should be kept');
if (after.b) fail('B was oldest-used and should have been evicted');
if (st.bytes > cap) fail('cache over cap after eviction: ' + st.bytes);

// parseOsm fixture
const parsed = parseOsm({ elements: [
  { type: 'way', tags: { highway: 'residential' }, geometry: [{ lon: -80.5, lat: 43.45 }, { lon: -80.51, lat: 43.45 }] },
  { type: 'way', tags: { building: 'yes', 'building:levels': '3' }, geometry: [{ lon: -80.5, lat: 43.45 }, { lon: -80.5001, lat: 43.45 }, { lon: -80.5001, lat: 43.4501 }, { lon: -80.5, lat: 43.4501 }, { lon: -80.5, lat: 43.45 }] },
  { type: 'way', tags: { natural: 'water' }, geometry: [{ lon: -80.52, lat: 43.46 }, { lon: -80.521, lat: 43.46 }, { lon: -80.521, lat: 43.461 }, { lon: -80.52, lat: 43.461 }, { lon: -80.52, lat: 43.46 }] },
  { type: 'node', lat: 43.47, lon: -80.49, tags: { man_made: 'water_tower' } },
]});
if (parsed.roads.length !== 1 || parsed.buildings.length !== 1 || parsed.water.length !== 1 || parsed.towers.length !== 1) fail('parseOsm counts ' + JSON.stringify({ r: parsed.roads.length, b: parsed.buildings.length, w: parsed.water.length, t: parsed.towers.length }));
if (Math.abs(parsed.buildings[0].h - 10.5) > 0.01) fail('building height ' + parsed.buildings[0].h);

const tiles = tilesForSites([{ lat: 43.45, lon: -80.50 }, { lat: 43.451, lon: -80.501 }]);
if (tiles.length < 1 || tiles.length > 9) fail('tile clustering ' + tiles.length);
const ids = new Set(tiles.map(t => t.id));
if (ids.size !== tiles.length) fail('duplicate tiles');
console.log('tiles for two nearby sites', tiles.length, 'first', tiles[0].id, tileId(tiles[0].s, tiles[0].w));

await c.clear();
if ((await c.stats()).count !== 0) fail('clear left rows');

console.log(bad ? `MAPCACHE FAILED (${bad})` : 'MAPCACHE OK');
process.exit(bad ? 1 : 0);
