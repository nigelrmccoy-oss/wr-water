import { DATA } from '../data/facilities.js';
import { fmt, money, hhmm, esc } from './util.js';
import { touPeriod, elecRate } from './sim.js';
import { SCENARIOS, startScenario, scenarioStatus } from './scenarios.js';

const $ = (sel, root = document) => root.querySelector(sel);
const A = DATA.assumptions;
const EST = '<span class="est" title="Estimate / training assumption – see Help">est</span>';
const KIND = { well: 'Wellhouse', wtp: 'Well WTP', asr: 'ASR/RCW', surface: 'Surface WTP' };
const TOU_LBL = { offPeak: 'OFF-PEAK', midPeak: 'MID-PEAK', onPeak: 'ON-PEAK' };

export class UI {
  constructor(sim) {
    this.sim = sim; this.view = 'board'; this.fpSite = null; this.fpZone = null; this.lastBoard = 0;
    this.initTabs(); this.initSpeed(); this.initScenarios(); this.renderHelp();
    sim.on('ack', () => this.refreshSoon = true);
  }
  initTabs() {
    for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => this.show(b.dataset.view);
  }
  show(v) {
    this.view = v;
    for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('on', b.dataset.view === v);
    for (const s of document.querySelectorAll('.view')) s.classList.toggle('on', s.id === 'view-' + v);
    this.onView?.(v); this.lastBoard = 0;
  }
  initSpeed() {
    for (const b of document.querySelectorAll('#speed button')) b.onclick = () => {
      const v = +b.dataset.speed; if (v === 0) this.sim.paused = !this.sim.paused; else { this.sim.speed = v; this.sim.paused = false; }
      for (const x of document.querySelectorAll('#speed button')) x.classList.toggle('on', (+x.dataset.speed === 0 && this.sim.paused) || (+x.dataset.speed === this.sim.speed && !this.sim.paused && +x.dataset.speed));
    };
  }
  initScenarios() {
    const sel = $('#scenarioSel');
    for (const sc of SCENARIOS) sel.insertAdjacentHTML('beforeend', `<option value="${sc.id}">Scenario: ${esc(sc.title)}</option>`);
    sel.onchange = () => {
      if (!sel.value) { this.sim.scenario = null; $('#scenarioPanel').classList.add('hidden'); return; }
      this.onRestart?.(SCENARIOS.find(s => s.id === sel.value));
    };
  }
  beginScenario(sc) {
    startScenario(this.sim, sc);
    const p = $('#scenarioPanel'); p.classList.remove('hidden');
    p.innerHTML = `<button style="float:right" id="scClose">hide</button><h3>${esc(sc.title)}</h3><p>${esc(sc.brief)}</p><div id="scObj"></div>
      <details><summary class="dim">Hints</summary><ul>${sc.hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul></details>`;
    $('#scClose').onclick = () => p.classList.add('hidden');
    this.sim.speed = 60; this.sim.paused = false;
  }

  // ---------------- per-frame ----------------
  update(now) {
    const sim = this.sim; const t = sim.time;
    $('#simDate').textContent = t.toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    $('#simTime').textContent = hhmm(t) + ':' + String(t.getSeconds()).padStart(2, '0');
    const tp = touPeriod(t); const tou = $('#tou'); tou.className = 'tou ' + tp; tou.textContent = `${TOU_LBL[tp]} ${(elecRate(t) * 100).toFixed(1)}¢/kWh`;
    if (now - this.lastBoard < 400 && !this.refreshSoon) return;
    this.lastBoard = now; this.refreshSoon = false;
    const T = sim.totals();
    $('#kpis').innerHTML = `<div><span>Supply</span>${fmt(T.supplyLs)} L/s</div><div><span>Demand</span>${fmt(T.demandLs)} L/s</div>
      <div><span>Today</span>${fmt(T.m3)} m³</div><div><span>Power</span>${fmt(T.kw)} kW</div><div><span>Energy today</span>${fmt(T.kwh)} kWh · ${money(T.elec)}</div>
      <div><span>Chemicals today</span>${money(T.chem)}</div><div><span>Grand R. @ Doon</span>${sim.river.flow.toFixed(1)} m³/s</div>`;
    const n = sim.alarms.unackedCount(); $('#almCount').textContent = n;
    this.banner();
    if (this.view === 'board') this.renderBoard();
    if (this.view === 'alarms') this.renderAlarms();
    if (this.view === 'costs') this.renderCosts();
    if (this.fpSite) this.updateFaceplate();
    if (this.fpZone) this.renderZoneFp();
    if (sim.scenario) {
      const st = scenarioStatus(sim); const el = $('#scObj');
      if (el) el.innerHTML = st.map(o => `<div class="obj ${o.st}">${esc(o.text)}</div>`).join('') + `<div class="dim">Score: ${st.filter(o => o.st === 'pass').length}/${st.length}</div>`;
    }
  }

  banner() {
    const al = this.sim.alarms.sorted().filter(a => !a.acked);
    const b = $('#alarmBanner'); b.classList.toggle('hasCrit', al.some(a => a.pri === 1 && a.active));
    if (!al.length) { b.innerHTML = '<span class="dim">No unacknowledged alarms</span>'; return; }
    const a = al[0];
    b.innerHTML = `<span class="alm-badge p${a.pri}">P${a.pri}</span> <span>${hhmm(new Date(a.t))}</span> <b>${esc(a.text)}</b> <span class="dim">(${al.length} unacked)</span>
      <button id="bnAck">ACK</button>${a.siteId ? '<button id="bnGo">Faceplate</button>' : ''}<button id="bnAll">ACK ALL</button>`;
    $('#bnAck').onclick = () => { this.sim.alarms.ack(a.id); this.refreshSoon = true; };
    $('#bnAll').onclick = () => { this.sim.alarms.ackAll(); this.refreshSoon = true; };
    if (a.siteId) $('#bnGo').onclick = () => this.openSite(a.siteId);
  }

  pumpsHtml(s) {
    const tile = p => `<span class="pump ${p.state === 'RUN' ? 'RUN' : p.trip ? 'TRIP' : p.mode === 'OFF' ? 'OFFm' : 'STOP'} ${p.mode === 'HAND' ? 'hand' : ''}" title="${p.id}: ${p.state} (${p.mode})">${p.mode === 'HAND' ? 'H' : p.mode === 'OFF' ? 'O' : ''}</span>`;
    let h = s.wells.map(tile).join('');
    if (s.hl?.length) h += '<span class="pump sep"></span>' + s.hl.map(tile).join('');
    if (s.boosters) h += '<span class="pump sep"></span>' + s.boosters.map(tile).join('');
    return `<span class="pumps">${h}</span>`;
  }
  siteAlarmBadge(id) {
    const al = this.sim.alarms.forSite(id).filter(a => a.active); if (!al.length) return '';
    const p = Math.min(...al.map(a => a.pri)); return `<span class="alm-badge p${p}">${al.length}</span>`;
  }

  renderBoard() {
    const sim = this.sim; const m = sim.sites.get('MWTP'); const P = m.plant;
    const zoneHtml = [...sim.zones.values()].map(z => {
      const alarm = sim.alarms.sorted().some(a => a.active && a.id.startsWith(z.id + ':'));
      return `<div class="zone ${alarm ? 'alarm' : ''}" data-zone="${z.id}"><h4 title="${esc(z.cfg.name)}">${esc(z.cfg.name)}</h4>
        <div class="bar"><i style="width:${z.level.toFixed(1)}%"></i></div>
        <div class="kv"><span>Storage</span><span>${z.level.toFixed(1)}% of ${fmt(z.volM3)} m³</span></div>
        <div class="kv"><span>Demand / supply</span><span>${fmt(z.demandLs, 0)} / ${fmt(z.inLs, 0)} L/s</span></div>
        <div class="kv"><span>Pressure ${EST}</span><span>${fmt(z.press)} kPa · ${fmt(z.press * 0.145)} psi</span></div>
        <div class="kv"><span>Today</span><span>${fmt(z.today.m3)} m³ · ${money(z.today.elec + z.today.chem)}</span></div></div>`;
    }).join('');
    const mann = `<div class="mann" data-site="MWTP"><h3>Mannheim WTP · Grand River (Hidden Valley intake) ${this.siteAlarmBadge('MWTP')} ${P.ftw ? '<span class="ilk">FILTER-TO-WASTE</span>' : ''}</h3>
      <div class="kv"><span>River flow (02GA048)</span><span>${sim.river.flow.toFixed(1)} m³/s</span></div>
      <div class="kv"><span>Raw turbidity ${EST}</span><span>${sim.river.turbRaw.toFixed(1)} NTU</span></div>
      <div class="kv"><span>Intake / plant flow</span><span>${fmt(P.flow)} L/s (${P.mode} SP ${fmt(P.flowSp)})</span></div>
      <div class="kv"><span>PACl dose / jar test</span><span>${P.paclSp.toFixed(0)} / ${P.paclReq.toFixed(0)} mg/L</span></div>
      <div class="kv"><span>Settled turbidity</span><span>${P.settled.toFixed(2)} NTU</span></div>
      <div class="kv"><span>Filtered turbidity</span><span style="color:${P.filtered > 0.3 ? 'var(--crit)' : 'inherit'}">${P.filtered.toFixed(3)} NTU</span></div>
      <div class="kv"><span>Ozone / UV dose</span><span>${P.ozoneSp.toFixed(1)} mg/L / ${m.uv.dose.toFixed(0)} mJ/cm²</span></div>
      <div class="kv"><span>Total Cl₂ leaving</span><span>${m.cl2.res.toFixed(2)} mg/L</span></div>
      <div class="kv"><span>Clearwells (15,280 m³)</span><span>${m.cwLevel.toFixed(1)}%</span></div>
      <div class="kv"><span>ASR/RCW recovery</span><span>${fmt(m.asrPrev || 0)} L/s</span></div>
      <div class="kv"><span>To Mannheim PS res.</span><span>${fmt(m.flowOut)} L/s</span></div>
      <div class="kv"><span>Today</span><span>${fmt(m.today.m3)} m³ · ${fmt(m.today.kwh)} kWh</span></div></div>`;
    let rows = '';
    for (const z of sim.zones.values()) {
      rows += `<tr class="grp"><td colspan="11">${esc(z.cfg.name)} — storage ${z.level.toFixed(1)}% · demand ${fmt(z.demandLs)} L/s</td></tr>`;
      for (const id of z.cfg.sites) {
        const s = sim.sites.get(id);
        rows += `<tr class="site" data-site="${id}"><td>${esc(s.cfg.name)}${s.standbySite ? ' <span class="dim">(standby)</span>' : ''}</td><td>${KIND[s.kind]}</td><td>${this.pumpsHtml(s)}</td>
          <td class="num">${fmt(s.flowOut, 1)}</td><td class="num">${fmt(s.today.m3)}</td>
          <td class="num">${s.cwVol ? s.cwLevel.toFixed(0) + '% CW' : '—'}</td>
          <td class="num">${s.cl2 ? s.cl2.res.toFixed(2) : '—'}</td><td class="num">${fmt(s.kw)}</td><td class="num">${money(s.today.elec + s.today.chem)}</td>
          <td>${s.interlock ? `<span class="ilk">${esc(s.interlock)}</span>` : ''}${this.siteAlarmBadge(id)}</td><td class="dim">${s.cfg.locQuality === 'real' ? '' : 'loc est'}</td></tr>`;
      }
    }
    $('#view-board').innerHTML = `<div class="zones">${zoneHtml}</div>${mann}
      <table class="grid"><thead><tr><th>Site</th><th>Type</th><th>Pumps (wells | high lift)</th><th>Flow L/s</th><th>Today m³</th><th>Clearwell</th><th>Cl₂ mg/L</th><th>kW</th><th>$ today ${EST}</th><th>Alarms</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    for (const r of document.querySelectorAll('#view-board [data-site]')) r.onclick = () => this.openSite(r.dataset.site);
    for (const r of document.querySelectorAll('#view-board [data-zone]')) r.onclick = () => this.openZone(r.dataset.zone);
  }

  renderAlarms() {
    const al = this.sim.alarms.sorted();
    const rows = al.map(a => `<div class="alarmrow p${a.pri} ${a.acked ? 'acked' : 'unack'} ${a.active ? 'active' : 'cleared'}">
      <span class="t">${hhmm(new Date(a.t))}</span><span class="alm-badge p${a.pri}">P${a.pri}</span><span style="flex:1">${esc(a.text)}${a.count > 1 ? ` ×${a.count}` : ''}</span>
      <span class="dim">${a.active ? 'ACTIVE' : 'RTN'} · ${a.acked ? 'ACKED' : 'UNACK'}</span>${a.acked ? '' : `<button data-ack="${a.id}">ACK</button>`}${a.siteId ? `<button data-go="${a.siteId}">Faceplate</button>` : ''}</div>`).join('');
    const ev = this.sim.alarms.events.slice(0, 120).map(e => `<div class="alarmrow"><span class="t">${hhmm(new Date(e.t))}</span><span>${esc(e.text)}</span></div>`).join('');
    $('#view-alarms').innerHTML = `<div class="sprow"><button id="ackAll">ACK ALL</button><span class="dim">ISA-18.2-style states: unacked active = flashing; RTN-unacked stays until acknowledged.</span></div>
      <h3>Alarm summary (${al.length})</h3>${rows || '<p class="dim">No alarms.</p>'}<h3>Event journal</h3>${ev}`;
    $('#ackAll').onclick = () => { this.sim.alarms.ackAll(); this.refreshSoon = true; };
    for (const b of document.querySelectorAll('[data-ack]')) b.onclick = () => { this.sim.alarms.ack(b.dataset.ack); this.refreshSoon = true; };
    for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => this.openSite(b.dataset.go);
  }

  renderCosts() {
    const sim = this.sim; const c = A.electricity.commodity; const ch = A.chemicals;
    let zr = '', sr = '';
    for (const z of sim.zones.values()) {
      const y = z.yday;
      zr += `<tr><td>${esc(z.cfg.name)}</td><td class="num">${fmt(z.cfg.avgDemandM3d)}</td><td class="num">${fmt(z.today.m3)}</td><td class="num">${fmt(z.today.kwh)}</td><td class="num">${money(z.today.elec)}</td><td class="num">${money(z.today.chem)}</td>
        <td class="num">${y ? fmt(y.m3) : '—'}</td><td class="num">${y ? money(y.elec + y.chem) : '—'}</td><td class="num">${z.today.m3 > 1 ? ((z.today.elec + z.today.chem) / z.today.m3 * 100).toFixed(1) + '¢' : '—'}</td></tr>`;
    }
    for (const s of sim.sites.values()) {
      const det = Object.entries(s.today.chemDetail).map(([k, v]) => `${k} ${money(v)}`).join(' · ');
      sr += `<tr><td>${esc(s.cfg.name)}</td><td class="num">${fmt(s.cfg.avg2025M3d)}</td><td class="num">${fmt(s.cfg.mdwlM3d)}</td><td class="num">${fmt(s.today.m3)}</td><td class="num">${fmt(s.today.kwh)}</td><td class="num">${s.today.m3 > 1 ? (s.today.kwh / s.today.m3).toFixed(2) : '—'}</td><td class="num">${money(s.today.elec)}</td><td class="num">${money(s.today.chem)}</td><td class="dim">${det}</td></tr>`;
    }
    $('#view-costs').innerHTML = `<div class="help">
      <h3>Assumed rates (edit in data/facilities.js → assumptions)</h3>
      <table><tr><th>Item</th><th>Value</th><th>Basis</th></tr>
      <tr><td>Electricity commodity</td><td>off ${c.offPeak * 100}¢ · mid ${c.midPeak * 100}¢ · on ${c.onPeak * 100}¢ /kWh</td><td><span class="real">sourced</span> <a href="${c.source}" target="_blank">OEB RPP TOU, Nov 1 2025</a> – proxy; large sites are really Class A/B (HOEP+GA)</td></tr>
      <tr><td>Delivery/regulatory adder</td><td>${A.electricity.deliveryAdderPerKwh.value * 100}¢/kWh</td><td>${EST} ${esc(A.electricity.deliveryAdderPerKwh.note)}</td></tr>
      <tr><td>Pump energy</td><td>P = ρ·g·Q·H / η, η=${A.pumpWireToWaterEff.value}</td><td>${EST} heads (m): well→dist ${A.tdhM.wellDirect}, well→CW ${A.tdhM.wellToClearwell}, high lift ${A.tdhM.highLift}, Mannheim LL ${A.tdhM.mannLowLift}/booster ${A.tdhM.mannBooster}/HL ${A.tdhM.mannHighLift}</td></tr>
      <tr><td>NaOCl 12%</td><td>$${ch.naocl12.pricePerL}/L; L = dose·Q/1000/0.12</td><td>${EST}</td></tr>
      <tr><td>Ammonium sulphate 20%</td><td>$${ch.ammSulphate20.pricePerL}/L; Cl₂:N = ${ch.ammSulphate20.cl2ToNRatio}:1</td><td>${EST}</td></tr>
      <tr><td>Cl₂ gas / PACl / polymer / LOX / H₂O₂</td><td>$${ch.cl2gas.pricePerKg} / $${ch.pacl.pricePerKg} / $${ch.polymer.pricePerKg} / $${ch.lox.pricePerKg} / $${ch.h2o2_50.pricePerKg} per kg</td><td>${EST}</td></tr>
      <tr><td>Context: Region wholesale water rate 2026</td><td>$${A.waterRate.wholesalePerM3}/m³</td><td><span class="real">sourced</span> <a href="${A.waterRate.source}" target="_blank">Region of Waterloo</a></td></tr></table>
      <h3>Zones – daily totals</h3><table class="grid"><thead><tr><th>Zone</th><th>2025 avg m³/d</th><th>Today m³</th><th>kWh</th><th>Elec $</th><th>Chem $</th><th>Yesterday m³</th><th>Yesterday $</th><th>¢/m³</th></tr></thead><tbody>${zr}</tbody></table>
      <h3>Sites – daily totals</h3><table class="grid"><thead><tr><th>Site</th><th>2025 avg m³/d</th><th>MDWL m³/d</th><th>Today m³</th><th>kWh</th><th>kWh/m³</th><th>Elec $</th><th>Chem $</th><th>Chemicals</th></tr></thead><tbody>${sr}</tbody></table></div>`;
  }

  // ---------------- zone faceplate ----------------
  openZone(id) { this.fpSite = null; this.fpZone = id; $('#faceplate').classList.remove('hidden'); this.renderZoneFp(); }
  renderZoneFp() {
    const z = this.sim.zones.get(this.fpZone); const c = z.cfg; const fp = $('#faceplate');
    fp.innerHTML = `<button class="close">✕</button><h2>${esc(c.name)}</h2>
      <div class="fp-sec"><h3>Storage &amp; pressure</h3>
      <div class="kv"><span>${esc(c.storageName)}</span><span>${fmt(c.storageM3)} m³ <span class="real">AWQR</span></span></div>
      ${z.towerEstM3 ? `<div class="kv"><span>+ elevated tanks</span><span>${fmt(z.towerEstM3)} m³ ${EST}</span></div>` : ''}
      <div class="bar"><i style="width:${z.level}%"></i></div><div class="kv"><span>Level</span><span>${z.level.toFixed(1)}%</span></div>
      <div class="kv"><span>Pressure (model) ${EST}</span><span>${fmt(z.press)} kPa / ${fmt(z.press * 0.145)} psi</span></div>
      ${c.hgl ? `<div class="kv"><span>HGL (City of Waterloo GIS)</span><span>${c.hgl} m</span></div>` : ''}</div>
      <div class="fp-sec"><h3>Demand</h3><div class="kv"><span>2025 avg (sum of sources)</span><span>${fmt(c.avgDemandM3d)} m³/d</span></div>
      <div class="kv"><span>Now</span><span>${fmt(z.demandLs, 1)} L/s</span></div><div class="kv"><span>Supply in</span><span>${fmt(z.inLs, 1)} L/s</span></div>
      <div class="kv"><span>Today</span><span>${fmt(z.today.m3)} m³</span></div><p class="dim">${esc(c.demandMethod)}</p></div>
      <div class="fp-sec"><h3>Trend 24 h – level % (blue), demand L/s (orange)</h3><canvas class="trend" id="trZ"></canvas></div>
      <div class="fp-sec"><h3>Sources</h3>${c.sites.map(id => `<button data-s="${id}">${esc(this.sim.sites.get(id).cfg.name)}</button>`).join(' ')}</div>`;
    fp.querySelector('.close').onclick = () => this.closeFp();
    for (const b of fp.querySelectorAll('[data-s]')) b.onclick = () => this.openSite(b.dataset.s);
    drawTrend($('#trZ'), [{ d: z.trend.series('level'), c: '#4aa3ff', lo: 0, hi: 100 }, { d: z.trend.series('demand'), c: '#ffb020' }]);
  }

  // ---------------- site faceplate ----------------
  closeFp() { this.fpSite = null; this.fpZone = null; $('#faceplate').classList.add('hidden'); }
  openSite(id) {
    this.fpZone = null; this.fpSite = id; const s = this.sim.sites.get(id); const c = s.cfg; const fp = $('#faceplate');
    fp.classList.remove('hidden');
    const treat = [c.greensand && 'greensand Fe/Mn filters', c.aop && `AOP (${c.aop === 'h2o2_uv' ? 'H₂O₂+UV' : 'NaOCl+UV'})`, c.gac && 'GAC contactors', c.uv && 'UV', ...c.chem.map(x => ({ naocl: 'NaOCl 12%', nh4: 'ammonium sulphate', h2o2: 'H₂O₂', cl2gas: 'Cl₂ gas', pacl: 'PACl', polymer: 'polymer', lox: 'LOX/ozone' }[x]))].filter(Boolean).join(' · ');
    const sp = (label, key, val, step, unit, est = true) => `<div class="sprow"><label>${label}${est ? EST : ''}</label><input type="number" step="${step}" data-sp="${key}" value="${(+val).toFixed(step < 1 ? 2 : 0)}"> <span class="dim">${unit}</span></div>`;
    let html = `<button class="close">✕</button><h2>${esc(c.name)}</h2>
      <div class="dim">${KIND[s.kind]} · zone ${esc(this.sim.zones.get(s.zone).cfg.name)} · ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)} ${c.locQuality === 'real' ? '<span class="real">location sourced</span>' : '<span class="est">location approx.</span>'}</div>
      <div class="dim">Treatment: ${esc(treat || 'disinfection at Mannheim (ASR blend)')}</div>
      <div class="dim">2025: avg ${fmt(c.avg2025M3d)} m³/d · max day ${fmt(c.maxDay2025M3d)} · peak raw ${fmt(c.peakRawLs2025, 1)} L/s · MDWL limit ${fmt(c.mdwlM3d)} m³/d <span class="real">Summary Rpt</span></div>
      ${c.note ? `<div class="dim">${esc(c.note)}</div>` : ''}
      <div class="fp-sec" id="fpIlk"></div>`;
    if (s.kind === 'surface') {
      html += `<div class="fp-sec"><h3>Raw water / intake</h3><div id="fpRiver"></div><div id="fpPumps"></div>
        <div class="sprow"><label>Plant flow control</label><button data-pm="AUTO">AUTO (level)</button><button data-pm="MAN">MAN</button></div>
        ${sp('Plant flow SP (L/s)', 'flowSp', s.plant.flowSp, 5, 'max ≈625 L/s peak (peer review)', false)}</div>
        <div class="fp-sec"><h3>Coagulation · ozone · filtration</h3>${sp('PACl dose', 'paclSp', s.plant.paclSp, 1, 'mg/L')}${sp('Polymer', 'polySp', s.plant.polySp, 0.05, 'mg/L')}${sp('Ozone dose', 'ozoneSp', s.plant.ozoneSp, 0.1, 'mg/L')}<div id="fpProc"></div></div>`;
    } else {
      html += `<div class="fp-sec"><h3>${s.kind === 'wtp' ? 'Well pumps → clearwell' : 'Well pumps'}</h3><div id="fpPumps"></div>
        ${s.kind === 'wtp' ? sp('Wells START below CW', 'cwStart', s.sp.cwStart, 1, '%') + sp('Wells STOP above CW', 'cwStop', s.sp.cwStop, 1, '%') : ''}
        ${s.kind === 'asr' ? '<p class="dim">AUTO: starts when Mannheim clearwell &lt; 45 %, stops &gt; 75 %.</p>' : ''}</div>`;
      if (s.kind === 'wtp') html += `<div class="fp-sec"><h3>Clearwell ${fmt(c.clearwellM3)} m³ <span class="real">AWQR</span> → high-lift pumps</h3><div id="fpCw"></div><div id="fpHl"></div></div>`;
      if (s.kind !== 'asr') html += `<div class="fp-sec"><h3>${s.kind === 'wtp' ? 'High-lift' : 'Well'} control on zone storage (PLC lead/lag)</h3>
        ${sp('Lead START below', 'leadStart', s.sp.leadStart, 0.5, '% zone level')}${sp('Lead STOP above', 'leadStop', s.sp.leadStop, 0.5, '% zone level')}${sp('Lag stagger', 'stagger', s.sp.stagger, 0.5, '% per pump')}
        <p class="dim">Each additional (lag) pump starts/stops one stagger lower. 5-min minimum run / off timers (anti short-cycle). HAND runs regardless of PLC (only hardwired trips stop it).</p></div>`;
    }
    if (s.cl2) html += `<div class="fp-sec"><h3>Chlorination ${s.cl2.nh4 ? '+ chloramination (NH₄)' : ''}</h3>
      ${sp(s.kind === 'surface' ? 'Cl₂ gas dose' : 'NaOCl dose', 'cl2Sp', s.cl2.sp, 0.05, 'mg/L')}
      <div class="sprow"><label>Duty metering pump</label><button data-duty="A">A</button><button data-duty="B">B</button></div><div id="fpCl"></div></div>`;
    if (s.uv && s.kind !== 'surface') html += `<div class="fp-sec"><h3>UV</h3><div id="fpUv"></div></div>`;
    html += `<div class="fp-sec"><h3>Trends 24 h</h3><div class="dim">flow L/s (green) · level % (blue) · Cl₂ ×20 (yellow)${s.plant ? ' · filtered NTU ×100 (red)' : ''}</div><canvas class="trend" id="trS"></canvas></div>
      <div class="fp-sec"><h3>Site alarms</h3><div id="fpAl"></div></div>
      <div class="fp-sec dim">Sources: ${c.sources.map(u => `<a href="${u}" target="_blank">${esc(u.replace(/^https?:\/\//, '').slice(0, 48))}…</a>`).join(' · ')}</div>`;
    fp.innerHTML = html;
    fp.querySelector('.close').onclick = () => this.closeFp();
    for (const i of fp.querySelectorAll('[data-sp]')) i.onchange = () => { const v = parseFloat(i.value); if (Number.isFinite(v)) this.sim.setSp(id, i.dataset.sp, v); };
    for (const b of fp.querySelectorAll('[data-duty]')) b.onclick = () => this.sim.setSp(id, 'cl2Duty', b.dataset.duty);
    for (const b of fp.querySelectorAll('[data-pm]')) b.onclick = () => this.sim.setSp(id, 'mode', b.dataset.pm);
    this.updateFaceplate();
  }
  pumpTiles(s, pumps) {
    return pumps.map(p => `<div class="ptile"><div class="nm">${p.id} <span class="dim">${p.role}</span></div>
      <div class="st ${p.state}">${p.state}${p.trip ? ' – ' + esc(p.trip) : ''}</div>
      <div class="hoa">${['HAND', 'OFF', 'AUTO'].map(m => `<button class="${m[0]} ${p.mode === m ? 'on' : ''}" data-mode="${s.id}|${p.id}|${m}">${m[0] === 'H' ? 'HAND' : m}</button>`).join('')}</div>
      <div>${fmt(p.q, 1)} L/s · ${fmt(p.kw, 1)} kW</div><div class="dim">cap ${fmt(p.qCap, 1)} L/s ${EST}</div><div class="dim">run ${fmt(p.runSec / 60)} min · starts ${p.starts}</div>
      ${p.trip ? `<button data-reset="${s.id}|${p.id}">RESET</button>` : ''}</div>`).join('');
  }
  updateFaceplate() {
    const s = this.sim.sites.get(this.fpSite); if (!s) return; const fp = $('#faceplate'); const sim = this.sim;
    const set = (sel, h) => { const e = fp.querySelector(sel); if (e && e.dataset.h !== h) { e.innerHTML = h; e.dataset.h = h; } };
    set('#fpIlk', s.interlock ? `<span class="ilk">INTERLOCK: ${esc(s.interlock)}</span> <button id="ilkReset">Reset interlock</button> <span id="ilkMsg" class="dim"></span>` : `<span class="dim">No interlock active · supply ${fmt(s.flowOut, 1)} L/s · ${fmt(s.kw)} kW · today ${fmt(s.today.m3)} m³</span>`);
    if (s.kind === 'surface') {
      const P = s.plant;
      set('#fpRiver', `<div class="kv"><span>Grand River near Doon 02GA048</span><span>${sim.river.flow.toFixed(1)} m³/s</span></div><div class="kv"><span>Raw turbidity ${EST}</span><span>${sim.river.turbRaw.toFixed(1)} NTU</span></div><div class="kv"><span>Plant flow (actual)</span><span>${fmt(P.flow)} L/s · mode ${P.mode}</span></div>`);
      set('#fpPumps', this.pumpTiles(s, [...s.wells, ...s.boosters]));
      set('#fpProc', `<div class="kv"><span>Jar-test suggested PACl ${EST}</span><span>${P.paclReq.toFixed(1)} mg/L</span></div><div class="kv"><span>Settled</span><span>${P.settled.toFixed(2)} NTU</span></div>
        <div class="kv"><span>Filtered (combined)</span><span>${P.filtered.toFixed(3)} NTU ${P.ftw ? '<span class="ilk">FILTER-TO-WASTE</span>' : ''}</span></div><div class="kv"><span>UV dose</span><span>${s.uv.dose.toFixed(0)} mJ/cm²</span></div>
        <div class="kv"><span>Clearwells 15,280 m³</span><span>${s.cwLevel.toFixed(1)}% · to Mannheim PS ${fmt(s.flowOut)} L/s</span></div>`);
      for (const b of fp.querySelectorAll('[data-pm]')) b.classList.toggle('on', b.dataset.pm === P.mode);
      const inp = fp.querySelector('[data-sp=flowSp]'); if (inp && P.mode === 'AUTO' && document.activeElement !== inp) inp.value = P.flowSp.toFixed(0);
    } else {
      set('#fpPumps', this.pumpTiles(s, s.wells));
      if (s.kind === 'wtp') { set('#fpCw', `<div class="bar"><i style="width:${s.cwLevel}%"></i><b style="left:${s.sp.cwStart}%"></b><b style="left:${s.sp.cwStop}%"></b></div><div class="kv"><span>Clearwell level</span><span>${s.cwLevel.toFixed(1)}% · in ${fmt(s.flowIn, 1)} / out ${fmt(s.flowOut, 1)} L/s</span></div>`); set('#fpHl', this.pumpTiles(s, s.hl)); }
    }
    if (s.cl2) {
      const c = s.cl2;
      set('#fpCl', `<div class="kv"><span>Dose applied</span><span>${(c.doseNow || 0).toFixed(2)} mg/L (pump ${c.duty} ${c.fault[c.duty] ? '<b style="color:var(--crit)">FAILED</b>' : 'OK'})</span></div>
        <div class="kv"><span>Demand ${EST}</span><span>${c.demand.toFixed(2)} mg/L</span></div><div class="kv"><span>${c.nh4 ? 'Total' : 'Free'} Cl₂ residual (analyzer)</span><span style="color:${c.res < 0.8 ? 'var(--crit)' : 'inherit'}">${c.res.toFixed(2)} mg/L</span></div>
        <div class="dim">Alarms ${EST}: LO ${A.alarmLimits.cl2Lo} · LOLO ${A.alarmLimits.cl2LoLo} (60 s → shutdown) · HI ${A.alarmLimits.cl2Hi} mg/L</div>`);
      for (const b of fp.querySelectorAll('[data-duty]')) b.classList.toggle('on', b.dataset.duty === c.duty);
    }
    if (s.uv && s.kind !== 'surface') set('#fpUv', `<div class="kv"><span>UV dose ${EST}</span><span>${s.uv.dose.toFixed(0)} mJ/cm² (LO &lt; 40 → shutdown)</span></div>`);
    const al = sim.alarms.forSite(s.id);
    set('#fpAl', al.length ? al.map(a => `<div class="alarmrow p${a.pri} ${a.acked ? '' : 'unack'} ${a.active ? 'active' : 'cleared'}"><span class="t">${hhmm(new Date(a.t))}</span><span style="flex:1">${esc(a.text)}</span>${a.acked ? '<span class="dim">acked</span>' : `<button data-ack="${a.id}">ACK</button>`}</div>`).join('') : '<span class="dim">none</span>');
    for (const b of fp.querySelectorAll('[data-mode]')) b.onclick = () => { const [si, pi, m] = b.dataset.mode.split('|'); sim.setMode(si, pi, m); this.updateFaceplate(); };
    for (const b of fp.querySelectorAll('[data-reset]')) b.onclick = () => { const [si, pi] = b.dataset.reset.split('|'); const r = sim.resetPump(si, pi); if (r !== 'ok') alert(r); this.updateFaceplate(); };
    for (const b of fp.querySelectorAll('#fpAl [data-ack]')) b.onclick = () => { sim.alarms.ack(b.dataset.ack); this.updateFaceplate(); };
    const ir = fp.querySelector('#ilkReset'); if (ir) ir.onclick = () => { const r = sim.resetInterlock(s.id); if (r !== 'ok') fp.querySelector('#ilkMsg').textContent = r; };
    const cl = s.trend.series('cl2').map(v => v * 20), tb = s.trend.series('turb').map(v => v * 100);
    drawTrend(fp.querySelector('#trS'), [{ d: s.trend.series('level'), c: '#4aa3ff', lo: 0, hi: 100 }, { d: s.trend.series('flow'), c: '#2ecc71' }, { d: cl, c: '#ffd54a', lo: 0, hi: 100 }, ...(s.plant ? [{ d: tb, c: '#ff4d4d', lo: 0, hi: 100 }] : [])]);
  }

  renderHelp() {
    const S = DATA.sources;
    const nReal = DATA.sites.filter(s => s.locQuality === 'real').length;
    $('#view-help').innerHTML = `<div class="help">
      <h2>What this is</h2><p>WR-WATER v0.1 is an <b>unofficial training simulator</b> of the Region of Waterloo water supply (Integrated Urban System + township systems). It is not connected to, endorsed by, or validated against the Region's SCADA. Numbers marked ${EST} are training assumptions; everything else is traceable to the public sources below.</p>
      <h2>How to drive it</h2><ul>
      <li><b>Master board</b>: zone tiles (storage, demand, pressure, daily totals), the Mannheim WTP panel and every supply site. Click any row/tile → faceplate.</li>
      <li><b>Pump squares</b>: green RUN · grey STOP · dark "O" = OFF · yellow outline "H" = HAND · flashing red = TRIP. Wells first, then high-lift (after the gap).</li>
      <li><b>Faceplate</b>: HAND/OFF/AUTO per pump, RESET after trips, level setpoints (lead/lag), Cl₂ dose and duty metering pump, interlock reset, 24 h trends, site alarms.</li>
      <li><b>PLC logic</b>: AUTO pumps stage on level (start below / stop above setpoint, each lag pump offset by the stagger), 5-min min-run/min-off, clearwell low-level holds high lift, hardwired high float stops wells, Cl₂ LOW-LOW 60 s → latched site shutdown, UV low → shutdown, Mannheim filtered &gt;1 NTU 2 min → filter-to-waste.</li>
      <li><b>Alarms</b>: P1 critical / P2 high / P3 low; unacked flash; return-to-normal stays until acked.</li>
      <li><b>Clock</b>: starts Wed 15 Jul 2026 05:00; speeds 1× – 900×. Electricity uses OEB summer TOU periods.</li></ul>
      <h2>Data provenance</h2><table>
      <tr><th>Data</th><th>Status</th><th>Source</th></tr>
      <tr><td>Wells per site, treatment trains, clearwell/reservoir volumes, high-lift pump counts, standby power</td><td><span class="real">sourced</span></td><td><a href="${S.AWQR25}" target="_blank">2025 Annual Water Quality Report (IUS + rural)</a></td></tr>
      <tr><td>2025 monthly avg, max-day and raw peak flow per site; MDWL Schedule C limits</td><td><span class="real">sourced</span></td><td><a href="${S.SUM25}" target="_blank">2025 Water &amp; Wastewater Operations Summary Report, App. C</a></td></tr>
      <tr><td>IUS avg day 2024 152,167 m³/d; max week 183,216</td><td><span class="real">sourced</span></td><td><a href="${S.WWMR25}" target="_blank">2025 Water &amp; Wastewater Monitoring Report</a></td></tr>
      <tr><td>Mannheim WTP available capacity 475 sustainable / 625 L/s peak</td><td><span class="real">sourced*</span></td><td><a href="${S.PEER}" target="_blank">Water Supply Peer Review (App. B)</a> *search-result excerpt</td></tr>
      <tr><td>Grand River near Doon 02GA048 daily flow 2015–2025 → monthly medians</td><td><span class="real">sourced</span></td><td><a href="${S.WSC}" target="_blank">ECCC Water Survey of Canada (api.weather.gc.ca)</a></td></tr>
      <tr><td>Site coordinates (${nReal} of ${DATA.sites.length} sites real: Kitchener GIS / OSM; rest approximate near community/street)</td><td>mixed</td><td><a href="${S.KGIS}" target="_blank">City of Kitchener open data</a> · OpenStreetMap · Nominatim</td></tr>
      <tr><td>Regional watermains (Kitchener + Waterloo, Region-owned), Waterloo pressure zones (HGL)</td><td><span class="real">sourced</span></td><td>City of Kitchener &amp; City of Waterloo ArcGIS open data (data/*.geojson)</td></tr>
      <tr><td>Electricity TOU prices</td><td><span class="real">sourced</span> (proxy)</td><td><a href="${S.OEB}" target="_blank">OEB</a></td></tr>
      <tr><td>Filtered turbidity ≤0.3 NTU criterion</td><td><span class="real">sourced</span></td><td><a href="${S.PROC}" target="_blank">Procedure for Disinfection of Drinking Water in Ontario</a></td></tr>
      <tr><td>Zone groupings, zone demand split, diurnal curve, pump capacities per well, heads, efficiencies, chemical prices &amp; demands, alarm limits (except regulatory), river turbidity curve, coagulation response, pressures, tower volumes</td><td>${EST}</td><td>See data/facilities.js → assumptions and README.md</td></tr></table>
      <h2>Acronyms</h2><p>SCADA supervisory control &amp; data acquisition · PLC programmable logic controller · HOA hand-off-auto · CW clearwell · HL high lift · LL low lift · MDWL municipal drinking water licence · ASR aquifer storage &amp; recovery · RCW recovery well · AOP advanced oxidation · GAC granular activated carbon · PACl polyaluminum chloride · LOX liquid oxygen · NTU turbidity unit · HGL hydraulic grade line · TOU time-of-use · IUS Integrated Urban System.</p></div>`;
  }
}

export function drawTrend(cv, series) {
  if (!cv) return; const w = cv.clientWidth || 500, h = cv.clientHeight || 120;
  if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
  g.strokeStyle = '#222a32'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, h * i / 4); g.lineTo(w, h * i / 4); g.stroke(); }
  for (const s of series) {
    const d = s.d; if (!d.length) continue;
    const fin = d.filter(Number.isFinite); if (!fin.length) continue;
    const lo = s.lo ?? Math.min(0, ...fin), hi = s.hi ?? Math.max(...fin) * 1.1 + 1e-6;
    g.strokeStyle = s.c; g.lineWidth = 1.5; g.beginPath(); let first = true;
    d.forEach((v, i) => { if (!Number.isFinite(v)) return; const x = w - (d.length - 1 - i) * (w / 1440), y = h - (v - lo) / (hi - lo) * (h - 4) - 2; first ? g.moveTo(x, y) : g.lineTo(x, y); first = false; });
    g.stroke();
  }
  g.fillStyle = '#8696a6'; g.font = '10px monospace'; g.fillText('-24 h', 3, h - 3); g.fillText('now', w - 22, h - 3);
}
