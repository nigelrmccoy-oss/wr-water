/** Low-poly 3D overview: sites at real/approx coordinates, Region watermains, rivers, Waterloo pressure zones. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DATA } from '../data/facilities.js';
import { STORAGE_ZONE } from '../data/network.js';

const LAT0 = 43.43, LON0 = -80.49;
const KX = Math.cos(LAT0 * Math.PI / 180) * 1113.2, KZ = 1105.4; // 1 unit = 100 m
export const proj = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const ZONE_COLORS = ['#ff7f50', '#ffd700', '#7fff00', '#00ced1', '#ff69b4', '#9370db', '#f4a460', '#40e0d0', '#adff2f', '#ff6347', '#87cefa', '#dda0dd', '#f0e68c', '#98fb98', '#e9967a', '#b0c4de', '#ffa07a', '#20b2aa'];

export class Map3D {
  constructor(canvas, sim, onPick) {
    this.canvas = canvas; this.sim = sim; this.onPick = onPick; this.ready = false; this.markers = []; this.zoneColor = {};
  }
  async init() {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = this.scene = new THREE.Scene(); scene.background = new THREE.Color('#0d1217'); scene.fog = new THREE.Fog('#0d1217', 500, 1100);
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000); this.camera.position.set(-20, 230, 240);
    this.controls = new OrbitControls(this.camera, this.canvas); this.controls.target.set(-30, 0, 0); this.controls.maxPolarAngle = Math.PI * 0.47; this.controls.enableDamping = true;
    scene.add(new THREE.HemisphereLight('#cfe8ff', '#1b2a1b', 1.1)); const sun = new THREE.DirectionalLight('#ffffff', 1.2); sun.position.set(200, 300, 100); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 800), new THREE.MeshLambertMaterial({ color: '#1c2a20' })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
    const grid = new THREE.GridHelper(900, 90, '#24352a', '#24352a'); grid.position.y = 0; scene.add(grid);
    this.legend = [];
    await Promise.all([this.loadRivers(), this.loadMains(), this.loadZones()]);
    this.addSites();
    this.ray = new THREE.Raycaster(); this.mouse = new THREE.Vector2();
    this.canvas.addEventListener('pointermove', e => this.hover(e));
    this.canvas.addEventListener('click', e => this.click(e));
    this.ready = true; this.resize(); this.renderLegend();
  }
  async fetchJson(u) { const res = await fetch(u); if (!res.ok) throw new Error(u + ' ' + res.status); return res.json(); }
  lines(features, colorFn, y) {
    const pos = [], col = []; const c = new THREE.Color();
    for (const f of features) {
      const g = f.geometry; if (!g) continue;
      const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
      c.set(colorFn(f));
      for (const ln of parts) for (let i = 0; i < ln.length - 1; i++) {
        const [x1, z1] = proj(ln[i][1], ln[i][0]), [x2, z2] = proj(ln[i + 1][1], ln[i + 1][0]);
        pos.push(x1, y, z1, x2, y, z2); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
  }
  async loadRivers() {
    try { const d = await this.fetchJson('data/osm_rivers.geojson'); this.scene.add(this.lines(d.features, () => '#2f8fd8', 0.1)); this.legend.push(['#2f8fd8', 'Rivers (OSM): Grand, Speed, Conestogo, Nith']); } catch (e) { console.warn('rivers', e.message); }
  }
  zc(name) { if (!name) return '#888888'; if (!this.zoneColor[name]) this.zoneColor[name] = ZONE_COLORS[Object.keys(this.zoneColor).length % ZONE_COLORS.length]; return this.zoneColor[name]; }
  async loadMains() {
    try {
      const k = await this.fetchJson('data/kitchener_region_watermains.geojson');
      const w = await this.fetchJson('data/waterloo_region_watermains.geojson');
      const norm = z => (z || 'UNKNOWN').toUpperCase().replace(/\s+/g, ' ').trim();
      const raw = f => (f.properties.CATEGORY === 'UNTREATED' || /RAW/i.test(f.properties.PRESSURE_ZONE || '') || f.properties.RAW_WATER === 'Yes' || f.properties.RAW_WATER === 'Y');
      this.mains = this.lines([...k.features, ...w.features], f => raw(f) ? '#c08040' : this.zc(norm(f.properties.PRESSURE_ZONE)), 0.35);
      this.scene.add(this.mains);
      const big = [...k.features.filter(f => (f.properties.PIPE_SIZE || 0) >= 600), ...w.features.filter(f => (f.properties.DIAMETER || 0) >= 600)];
      this.trunk = this.lines(big, () => '#ffffff', 0.6); this.scene.add(this.trunk);
      this.legend.push(['#c08040', 'Raw-water mains'], ['#ffffff', 'Region trunk mains ≥ 600 mm']);
      this.mainsCount = k.features.length + w.features.length;
    } catch (e) { console.warn('mains', e.message); }
  }
  async loadZones() {
    try { const d = await this.fetchJson('data/waterloo_pressure_zones.geojson'); const zl = this.lines(d.features, () => '#b48cff', 0.2); zl.material.transparent = true; zl.material.opacity = 0.6; this.scene.add(zl); this.legend.push(['#b48cff', 'Waterloo pressure-zone boundaries (City GIS, HGL)']); } catch (e) { console.warn('zones', e.message); }
  }
  label(text, x, y, z, color = '#d7dee6') {
    const cv = document.createElement('canvas'); const g = cv.getContext('2d'); g.font = 'bold 26px system-ui'; const w = Math.ceil(g.measureText(text).width) + 12; cv.width = w; cv.height = 34;
    g.font = 'bold 26px system-ui'; g.fillStyle = '#0d1217cc'; g.fillRect(0, 0, w, 34); g.fillStyle = color; g.fillText(text, 6, 26);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
    sp.scale.set(w / 9, 34 / 9, 1); sp.position.set(x, y, z); sp.renderOrder = 10; this.scene.add(sp); return sp;
  }
  addSites() {
    const mat = c => new THREE.MeshLambertMaterial({ color: c });
    for (const s of DATA.sites) {
      const [x, z] = proj(s.lat, s.lon); let m;
      if (s.kind === 'surface') { m = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 7), mat('#5d7f99')); m.position.set(x, 1.5, z); }
      else if (s.kind === 'wtp') { m = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.4, 3.5), mat('#6d8a74')); m.position.set(x, 1.2, z); }
      else if (s.kind === 'asr') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.5, 6), mat('#7a7a9a')); m.position.set(x, 0.75, z); }
      else { m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 6), mat('#8a8f74')); m.position.set(x, 1.1, z); const roof = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.2, 6), mat('#4b4f45')); roof.position.y = 1.7; m.add(roof); }
      m.userData = { site: s.id, name: s.name, est: s.locQuality !== 'real' };
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), new THREE.MeshBasicMaterial({ color: '#7b8794' })); beacon.position.y = (s.kind === 'surface' ? 3.2 : 2.6) + 0.5; m.add(beacon); m.userData.beacon = beacon;
      this.scene.add(m); this.markers.push(m);
      if (s.kind !== 'asr') m.userData.label = this.label(s.id, x, s.kind === 'surface' ? 8 : 5.5, z, s.locQuality === 'real' ? '#9fe8b8' : '#d7dee6');
    }
    for (const t of DATA.storage) {
      const [x, z] = proj(t.lat, t.lon); let m;
      if (t.type === 'tower') { m = new THREE.Group(); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 6, 6), mat('#9aa7b4')); st.position.y = 3; const bowl = new THREE.Mesh(new THREE.SphereGeometry(2, 10, 8), mat('#b9c6d3')); bowl.position.y = 7; m.add(st, bowl); }
      else if (t.type === 'intake') { m = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3, 4), mat('#2f8fd8')); m.position.y = 1.5; }
      else if (t.type === 'recharge') { m = new THREE.Mesh(new THREE.BoxGeometry(4, 0.4, 4), mat('#3a6f8f')); m.position.y = 0.2; }
      else { m = new THREE.Mesh(new THREE.CylinderGeometry(Math.min(4, 1.2 + Math.sqrt(t.volM3) / 100), Math.min(4, 1.2 + Math.sqrt(t.volM3) / 100), 1, 16), mat('#4f6d86')); m.position.y = 0.5; }
      m.position.x = x; m.position.z = z; m.userData = { storage: t.id, name: `${t.name} (${t.volM3 ? t.volM3.toLocaleString() + ' m³' + (t.volEst ? ' est' : '') : ''})`, zone: STORAGE_ZONE[t.id] || t.zone };
      this.scene.add(m); this.markers.push(m);
    }
    this.legend.push(['#9fe8b8', 'Site label green = location from Kitchener GIS / OSM; white = approximate']);
  }
  renderLegend() {
    const zones = Object.entries(this.zoneColor).map(([n, c]) => `<span style="white-space:nowrap"><i style="background:${c}"></i>${n}</span>`).join(' ');
    document.getElementById('mapLegend').innerHTML = `<b>Region of Waterloo – 3D overview</b><br>${this.legend.map(([c, t]) => `<div><i style="background:${c}"></i>${t}</div>`).join('')}
      <div style="margin-top:4px">Treated mains coloured by GIS pressure zone (${this.mainsCount || 0} Region-owned segments, Kitchener + Waterloo open data; Cambridge/townships not published):</div><div style="font-size:11px">${zones}</div>
      <div class="dim">Beacon: green running · grey idle · red alarm/interlock · dark = standby. Click a site for its faceplate. Drag = orbit, wheel = zoom, right-drag = pan.</div>
      <label><input type="checkbox" id="mainsTog" checked> mains</label> <label><input type="checkbox" id="trunkTog" checked> trunk ≥600 mm</label>`;
    document.getElementById('mainsTog').onchange = e => { if (this.mains) this.mains.visible = e.target.checked; };
    document.getElementById('trunkTog').onchange = e => { if (this.trunk) this.trunk.visible = e.target.checked; };
  }
  pick(e) {
    const r = this.canvas.getBoundingClientRect(); this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.mouse, this.camera);
    const hit = this.ray.intersectObjects(this.markers, true)[0]; if (!hit) return null;
    let o = hit.object; while (o && !o.userData.name) o = o.parent; return o;
  }
  hover(e) {
    const tip = document.getElementById('mapTip'); const o = this.pick(e);
    if (!o) { tip.style.display = 'none'; this.canvas.style.cursor = ''; return; }
    this.canvas.style.cursor = o.userData.site ? 'pointer' : '';
    let h = `<b>${o.userData.name}</b>`;
    if (o.userData.site) { const s = this.sim.sites.get(o.userData.site); h += `<br>${s.flowOut.toFixed(1)} L/s · ${s.cl2 ? 'Cl₂ ' + s.cl2.res.toFixed(2) + ' mg/L · ' : ''}${s.kw.toFixed(0)} kW${o.userData.est ? '<br><i>location approximate</i>' : ''}`; }
    if (o.userData.zone) { const z = this.sim.zones.get(o.userData.zone); h += `<br>zone ${z.cfg.name}: ${z.level.toFixed(1)}%`; }
    const r = this.canvas.getBoundingClientRect(); tip.innerHTML = h; tip.style.display = 'block'; tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
  }
  click(e) { const o = this.pick(e); if (o?.userData.site) { this.flyTo = o.position.clone(); this.onPick(o.userData.site); } }
  resize() { const w = this.canvas.clientWidth, h = this.canvas.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  updateStatus() {
    for (const m of this.markers) {
      const id = m.userData.site; if (!id) continue; const s = this.sim.sites.get(id);
      const alarm = s.interlock || this.sim.alarms.forSite(id).some(a => a.active && a.pri <= 2);
      const run = s.flowOut > 0.5 || s.allPumps().some(p => p.state === 'RUN');
      m.userData.beacon.material.color.set(alarm ? '#ff3030' : run ? '#2ecc71' : s.standbySite ? '#30363d' : '#7b8794');
    }
  }
  render(visible) {
    if (!this.ready || !visible) return;
    if (this.canvas.width !== Math.floor(this.canvas.clientWidth * this.renderer.getPixelRatio())) this.resize();
    if (this.flyTo) { this.controls.target.lerp(this.flyTo, 0.08); if (this.controls.target.distanceTo(this.flyTo) < 0.5) this.flyTo = null; }
    this.controls.update(); this.renderer.render(this.scene, this.camera);
  }
}
