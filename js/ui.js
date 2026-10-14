import { DATA } from '../data/facilities.js';
import { SRC, MANN_FILTERS as MF, DIOXANE as DX } from '../data/network.js';
import { fmt, money, hhmm, esc } from './util.js';
import { touPeriod, elecRate, ZONE_CFGS } from './sim.js';
import * as E from './energy.js';
import { SCENARIOS, startScenario, scenarioStatus } from './scenarios.js';

const $ = (sel, root = document) => root.querySelector(sel);
const A = DATA.assumptions;
const EST = '<span class="est" title="Estimate / training assumption – see Help">est</span>';
const REAL = '<span class="real">sourced</span>';
const KIND = { well: 'Wellhouse', wtp: 'Well WTP', asr: 'ASR/RCW', surface: 'Surface WTP' };
const TOU_LBL = { offPeak: 'OFF-PEAK', midPeak: 'MID-PEAK', onPeak: 'ON-PEAK' };
const MUNI_ORDER = ['Kitchener', 'Kitchener/Waterloo', 'Waterloo', 'Cambridge', 'Woolwich', 'Wilmot', 'Townships'];
const st = x => x === 'real' ? REAL : EST;

export class UI {
  constructor(sim) {
    this.sim = sim; this.view = 'board'; this.fpSite = null; this.fpZone = null; this.lastBoard = 0;
    this.initTabs(); this.initSpeed(); this.initScenarios(); this.renderHelp();
    sim.on('ack', () => this.refreshSoon = true);
  }
  initTabs() { for (const b of document.querySelectorAll('#tabs button')) b.onclick = () => this.show(b.dataset.view); }
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
      if (!sel.value) { this.sim.scenario = null; this.showPanel(false); $('#scShow').classList.add('hidden'); return; }
      this.onRestart?.(SCENARIOS.find(s => s.id === sel.value));
    };
  }
  beginScenario(sc) {
    startScenario(this.sim, sc);
    this.renderScenarioPanel(sc);
    this.sim.speed = 60; this.sim.paused = false;
  }
  showPanel(on) { $('#scenarioPanel').classList.toggle('hidden', !on); document.body.classList.toggle('sc-on', on); $('#scShow').classList.toggle('hidden', on || !this.sim.scenario); window.dispatchEvent(new Event('resize')); }
  renderScenarioPanel(sc) {
    const p = $('#scenarioPanel'); this.showPanel(true);
    p.innerHTML = `<button style="float:right" id="scClose">hide</button><h3>${esc(sc.title)}</h3><p>${esc(sc.brief)}</p><div id="scAct"></div><div id="scObj"></div>
      <details><summary class="dim">Hints</summary><ul>${sc.hints.map(h => `<li>${esc(h)}</li>`).join('')}</ul></details>`;
    $('#scClose').onclick = () => this.showPanel(false);
    $('#scShow').onclick = () => this.showPanel(true);
  }
  renderScenarioActions() {
    const sc = this.sim.scenario; const el = $('#scAct'); if (!el) return;
    const acts = (sc.actions?.(this.sim) || []);
    const note = sc.decisionNote ? `<div class="dim">${esc(sc.decisionNote(this.sim) || '')}</div>` : '';
    const h = (acts.length ? `<div class="dim">${esc(sc.actionTitle || 'Field actions / decisions')}</div><div class="scact">${acts.map(a => `<button data-act="${a.id}" ${a.disabled ? 'disabled' : ''} title="${esc(a.title || '')}">${esc(a.label)}</button>`).join('')}</div>` : '') + note;
    if (el.dataset.h !== h) {
      el.innerHTML = h; el.dataset.h = h;
      for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => { const a = (sc.actions(this.sim) || []).find(x => x.id === b.dataset.act); if (a) { const r = a.run(this.sim); if (r && r !== 'ok') alert(r); } this.refreshSoon = true; };
    }
  }

  // ---------------- per-frame ----------------
  update(now) {
    const sim = this.sim; const t = sim.time;
    $('#simDate').textContent = t.toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    $('#simTime').textContent = hhmm(t) + ':' + String(t.getSeconds()).padStart(2, '0');
    const tp = touPeriod(t); const tou = $('#tou'); tou.className = 'tou ' + tp; tou.textContent = `RPP ${TOU_LBL[tp]} ${(elecRate(t) * 100).toFixed(1)}¢ · OZP $${E.ozp(t).v.toFixed(0)}/MWh`;
    const pa = sim.peakNow; const ici = $('#ici');
    if (ici) { const on = pa?.alert; ici.className = 'ici' + (on ? '' : ' off'); ici.textContent = on ? `ICI PEAK ALERT HE${pa.window[0]}–${pa.window[1]}` : 'ICI: no alert'; }
    if (now - this.lastBoard < 400 && !this.refreshSoon) return;
    this.lastBoard = now; this.refreshSoon = false;
    const T = sim.totals();
    $('#kpis').innerHTML = `<div><span>Supply</span>${fmt(T.supplyLs)} L/s</div><div><span>Demand</span>${fmt(T.demandLs)} L/s</div>
      <div><span>${T.since && new Date(T.since).getHours() + new Date(T.since).getMinutes() > 0 ? 'Delivered since ' + hhmm(new Date(T.since)) : 'Delivered today'}</span>${fmt(T.m3)} m³</div><div><span>Power</span>${fmt(T.kw)} kW</div><div><span>Class A now</span>${fmt(T.classAKw)} kW</div><div><span>Energy today</span>${fmt(T.kwh)} kWh · ${money(T.elec + T.diesel)}</div>
      <div><span>Chemicals today</span>${money(T.chem)}</div><div><span>Grand R. @ Doon</span>${sim.river.flow.toFixed(1)} m³/s</div>`;
    $('#almCount').textContent = sim.alarms.unackedCount();
    this.banner();
    if (this.view === 'board') this.renderBoard();
    if (this.view === 'net') this.renderNet();
    if (this.view === 'alarms') this.renderAlarms();
    if (this.view === 'costs') this.renderCosts();
    if (this.fpSite) this.updateFaceplate();
    if (this.fpZone) this.renderZoneFp();
    if (sim.scenario) {
      this.renderScenarioActions();
      const s = scenarioStatus(sim); const el = $('#scObj');
      if (el) el.innerHTML = s.map(o => `<div class="obj ${o.st}">${esc(o.text)}</div>`).join('') + `<div class="dim">Score: ${s.filter(o => o.st === 'pass').length}/${s.length}</div>`;
    }
  }

  banner() {
    const al = this.sim.alarms.sorted().filter(a => !a.acked);
    const b = $('#alarmBanner'); b.classList.toggle('hasCrit', al.some(a => a.pri === 1 && a.active));
    if (!al.length) { b.innerHTML = '<span class="dim">No unacknowledged alarms</span>'; return; }
    const a = al[0];
    b.innerHTML = `<span class="alm-badge p${a.pri}">P${a.pri}</span> <span>${hhmm(new Date(a.t))}</span> <b>${esc(a.text)}</b> <span class="dim">(${al.length} unacked)</span>
      <button id="bnAck">ACK</button>${a.siteId && this.sim.sites.has(a.siteId) ? '<button id="bnGo">Faceplate</button>' : ''}<button id="bnAll">ACK ALL</button>`;
    $('#bnAck').onclick = () => { this.sim.alarms.ack(a.id); this.refreshSoon = true; };
    $('#bnAll').onclick = () => { this.sim.alarms.ackAll(); this.refreshSoon = true; };
    if ($('#bnGo')) $('#bnGo').onclick = () => this.openSite(a.siteId);
  }

  pumpsHtml(s) {
    const tile = p => `<span class="pump ${p.state === 'RUN' ? 'RUN' : p.trip ? 'TRIP' : p.mode === 'OFF' ? 'OFFm' : 'STOP'} ${p.mode === 'HAND' ? 'hand' : ''}" title="${p.id}: ${p.state} (${p.mode})">${p.mode === 'HAND' ? 'H' : p.mode === 'OFF' ? 'O' : ''}</span>`;
    let h = s.wells.map(tile).join('');
    if (s.hl?.length) h += '<span class="pump sep"></span>' + s.hl.map(tile).join('');
    if (s.boosters) h += '<span class="pump sep"></span>' + s.boosters.map(tile).join('');
    return `<span class="pumps">${h}</span>`;
  }
  pwrBadge(pw) {
    if (!pw) return '';
    if (!pw.on) return '<span class="pwr OFF">NO POWER</span>';
    if (!pw.grid) return '<span class="pwr GEN">ON GEN</span>';
    if (pw.latch) return '<span class="pwr LATCH">RESTART REQ</span>';
    if (pw.gen && pw.gen.state === 'RUN') return '<span class="pwr GEN">GEN (parallel)</span>';
    return '';
  }
  siteAlarmBadge(id) {
    const al = this.sim.alarms.forSite(id).filter(a => a.active); if (!al.length) return '';
    const p = Math.min(...al.map(a => a.pri)); return `<span class="alm-badge p${p}">${al.length}</span>`;
  }

  zoneTile(z) {
    const sim = this.sim; const c = z.cfg;
    const alarm = sim.alarms.sorted().some(a => a.active && a.id.startsWith(z.id + ':'));
    if (c.node) return `<div class="zone node ${alarm ? 'alarm' : ''}" data-zone="${z.id}"><h4>${esc(c.name)}</h4><div class="bar"><i style="width:${z.level.toFixed(1)}%"></i></div>
      <div class="kv"><span>Level</span><span>${z.level.toFixed(1)}% of ${fmt(z.volM3)} m³</span></div><div class="kv"><span>In / out</span><span>${fmt(z.inLs)} / ${fmt(z.outLs)} L/s</span></div></div>`;
    return `<div class="zone ${c.closed ? 'closed' : ''} ${alarm ? 'alarm' : ''}" data-zone="${z.id}"><h4 title="${esc(c.name)}">${esc(c.name)}</h4>
      ${c.closed ? `<div class="tag">closed zone · supply-balance proxy</div>` : `<div class="bar"><i style="width:${z.level.toFixed(1)}%"></i></div>`}
      ${c.closed ? '' : `<div class="kv"><span>Storage</span><span>${z.level.toFixed(1)}% of ${fmt(z.volM3)} m³</span></div>`}
      <div class="kv"><span>Demand / in</span><span>${fmt(z.demandLs, 0)} / ${fmt(z.inLs, 0)} L/s</span></div>
      ${z.outLs > 0.5 ? `<div class="kv"><span>Transfer out</span><span>${fmt(z.outLs)} L/s</span></div>` : ''}
      <div class="kv"><span>Pressure ${EST}</span><span style="color:${z.press < 275 ? 'var(--crit)' : 'inherit'}">${fmt(z.press)} kPa · ${fmt(z.press * 0.145)} psi</span></div>
      ${c.hgl ? `<div class="kv"><span>HGL ${c.hglSt === 'real' ? '' : EST}</span><span>${c.hgl} m</span></div>` : ''}
      ${z.leakLs > 0 ? `<div class="kv"><span style="color:var(--crit)">MAIN BREAK</span><span>${fmt(z.leakLs)} L/s</span></div>` : ''}</div>`;
  }

  renderBoard() {
    const sim = this.sim; const m = sim.sites.get('MWTP'); const P = m.plant;
    const groups = {};
    for (const z of sim.zones.values()) (groups[z.cfg.muni] ||= []).push(z);
    const zoneHtml = MUNI_ORDER.filter(k => groups[k]).map(k => `<div class="zgrp">${esc(k)}</div><div class="zones">${groups[k].map(z => this.zoneTile(z)).join('')}</div>`).join('');
    const mann = `<div class="mann" data-site="MWTP"><h3>Mannheim WTP · Grand River (Hidden Valley intake) ${this.siteAlarmBadge('MWTP')} ${P.ftw ? '<span class="ilk">FILTER-TO-WASTE</span>' : ''} ${this.pwrBadge(m.pw)}</h3>
      <div class="kv"><span>River flow (02GA048)</span><span>${sim.river.flow.toFixed(1)} m³/s</span></div>
      <div class="kv"><span>Raw turbidity ${EST}</span><span>${sim.river.turbRaw.toFixed(1)} NTU</span></div>
      <div class="kv"><span>Plant flow / capacity</span><span>${fmt(P.flow)} / ${fmt(P.cap)} L/s (${P.mode} SP ${fmt(P.flowSp)})</span></div>
      <div class="kv"><span>Filters in service</span><span>${m.filters.filter(f => f.state === 'SERVICE').length}/4 ${m.filters.filter(f => f.state === 'WASH').map(f => f.id + ' ' + MF.steps[f.step][0]).join(' ')}</span></div>
      <div class="kv"><span>PACl dose / jar test</span><span>${P.paclSp.toFixed(0)} / ${P.paclReq.toFixed(0)} mg/L</span></div>
      <div class="kv"><span>Filtered turbidity</span><span style="color:${P.filtered > 0.3 ? 'var(--crit)' : 'inherit'}">${P.filtered.toFixed(3)} NTU</span></div>
      <div class="kv"><span>Total Cl₂ leaving</span><span>${m.cl2.res.toFixed(2)} mg/L</span></div>
      <div class="kv"><span>Clearwells (15,280 m³)</span><span>${m.cwLevel.toFixed(1)}%</span></div>
      <div class="kv"><span>ASR/RCW recovery</span><span>${fmt(m.asrPrev || 0)} L/s</span></div>
      <div class="kv"><span>To Mannheim reservoir</span><span>${fmt(m.flowOut)} L/s</span></div>
      <div class="kv"><span>Zone 4/5/6 PS out</span><span>${['Z4PS', 'Z5PS', 'Z6PS'].map(id => fmt(sim.links.get(id).q)).join(' / ')} L/s</span></div>
      <div class="kv"><span>Class A load now</span><span>${fmt(sim.classAKw)} kW</span></div></div>`;
    let rows = '';
    for (const z of sim.zones.values()) {
      if (!z.cfg.sites.length) continue;
      rows += `<tr class="grp"><td colspan="11">${esc(z.cfg.name)} — ${z.cfg.closed ? 'closed zone' : 'storage ' + z.level.toFixed(1) + '%'} · demand ${fmt(z.demandLs)} L/s</td></tr>`;
      for (const id of z.cfg.sites) {
        const s = sim.sites.get(id);
        rows += `<tr class="site" data-site="${id}"><td>${esc(s.cfg.name)}${s.standbySite ? ' <span class="dim">(standby)</span>' : ''}${this.pwrBadge(s.pw)}</td><td>${KIND[s.kind]}</td><td>${this.pumpsHtml(s)}</td>
          <td class="num">${fmt(s.flowOut, 1)}</td><td class="num">${fmt(s.today.m3)}</td>
          <td class="num">${s.cwVol ? s.cwLevel.toFixed(0) + '% CW' : '—'}</td>
          <td class="num">${s.cl2 ? s.cl2.res.toFixed(2) : '—'}</td><td class="num">${fmt(s.kw)}</td><td class="num">${money(s.today.elec + s.today.chem + s.today.diesel + s.today.ga)}</td>
          <td>${s.interlock ? `<span class="ilk">${esc(s.interlock)}</span>` : ''}${this.siteAlarmBadge(id)}</td><td class="dim">${s.cls}${s.cfg.locQuality === 'real' ? '' : ' · loc est'}</td></tr>`;
      }
    }
    $('#view-board').innerHTML = `${mann}${zoneHtml}
      <table class="grid"><thead><tr><th>Site</th><th>Type</th><th>Pumps (wells | high lift)</th><th>Flow L/s</th><th>Today m³</th><th>Clearwell</th><th>Cl₂ mg/L</th><th>kW</th><th>$ today ${EST}</th><th>Alarms</th><th>Class</th></tr></thead><tbody>${rows}</tbody></table>`;
    for (const r of document.querySelectorAll('#view-board [data-site]')) r.onclick = () => this.openSite(r.dataset.site);
    for (const r of document.querySelectorAll('#view-board [data-zone]')) r.onclick = () => this.openZone(r.dataset.zone);
  }

  renderNet() {
    const sim = this.sim; const ae = document.activeElement; if (ae && ae.closest && ae.closest('#view-net') && ae.tagName === 'INPUT') return; // don't clobber typing
    const rows = [...sim.links.values()].map(l => {
      const c = l.cfg; const f = sim.zones.get(c.from).cfg.name, t = sim.zones.get(c.to).cfg.name;
      const pw = c.kind === 'PS' ? (c.site ? sim.sites.get(c.site).pw : l.pw) : null;
      return `<tr class="link ${l.isolated ? 'isol' : ''}"><td><b>${esc(c.name)}</b>${c.note ? ` <span class="dim" title="${esc(c.note)}">ⓘ</span>` : ''}</td><td>${c.kind}</td><td>${esc(f)} → ${esc(t)}</td>
        <td>${['AUTO', 'MAN', 'CLOSED'].map(m => `<button class="mini ${l.mode === m ? 'on' : ''}" data-lm="${l.id}|${m}">${m}</button>`).join('')}</td>
        <td><input type="number" step="1" data-lsp="${l.id}" value="${l.sp}"> %</td><td><input type="number" step="5" data-lq="${l.id}" value="${Math.round(l.manQ)}"></td>
        <td class="num">${fmt(l.q, 1)}</td><td class="num">${fmt(c.cap)}${c.capSt === 'real' ? REAL : EST}</td>
        <td>${c.kind === 'PS' ? `${l.running}/${c.nP} run ${l.pumps.filter(p => p.trip).length ? '<span class="ilk">TRIP</span>' : ''}` : ''}</td><td class="num">${c.kind === 'PS' ? fmt(l.kw) : ''}</td><td>${this.pwrBadge(pw)}${l.isolated ? '<span class="ilk">ISOLATED</span>' : ''}${l.capFrac != null ? `<span class="ilk">${Math.round(l.capFrac * 100)}% CAP</span>` : ''}${c.normallyClosed ? ' <span class="dim">NC</span>' : ''}</td><td class="dim">${l.cls || ''}</td></tr>`;
    }).join('');
    $('#view-net').innerHTML = `<div class="help" style="max-width:none"><h3>Inter-zone transfers (pump stations, PRVs, control valves)</h3>
      <p class="dim">AUTO = PLC/PRV modulates to hold the <i>receiving</i> zone storage at the setpoint (K50 transfer holds the <i>sending</i> zone). MAN = fixed flow. CLOSED = valve shut / station off. Capacities and setpoints are training estimates unless marked sourced; zone names and which station feeds which zone come from the Region WSMP/WSDOMP 2015 and the City of Waterloo WDMP 2017 (see Help).</p>
      <table class="grid"><thead><tr><th>Station / valve</th><th>Type</th><th>From → to</th><th>Mode</th><th>Level SP</th><th>MAN L/s</th><th>Flow L/s</th><th>Cap L/s</th><th>Pumps</th><th>kW</th><th>Status</th><th>Class</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    for (const b of document.querySelectorAll('[data-lm]')) b.onclick = () => { const [id, m] = b.dataset.lm.split('|'); sim.setLink(id, 'mode', m); this.refreshSoon = true; };
    for (const i of document.querySelectorAll('[data-lsp]')) i.onchange = () => { const v = parseFloat(i.value); if (Number.isFinite(v)) sim.setLink(i.dataset.lsp, 'sp', v); };
    for (const i of document.querySelectorAll('[data-lq]')) i.onchange = () => { const v = parseFloat(i.value); if (Number.isFinite(v)) sim.setLink(i.dataset.lq, 'manQ', v); };
  }

  renderAlarms() {
    const al = this.sim.alarms.sorted();
    const rows = al.map(a => `<div class="alarmrow p${a.pri} ${a.acked ? 'acked' : 'unack'} ${a.active ? 'active' : 'cleared'}">
      <span class="t">${hhmm(new Date(a.t))}</span><span class="alm-badge p${a.pri}">P${a.pri}</span><span style="flex:1">${esc(a.text)}${a.count > 1 ? ` ×${a.count}` : ''}</span>
      <span class="dim">${a.active ? 'ACTIVE' : 'RTN'} · ${a.acked ? 'ACKED' : 'UNACK'}</span>${a.acked ? '' : `<button data-ack="${a.id}">ACK</button>`}${a.siteId && this.sim.sites.has(a.siteId) ? `<button data-go="${a.siteId}">Faceplate</button>` : ''}</div>`).join('');
    const ev = this.sim.alarms.events.slice(0, 150).map(e => `<div class="alarmrow"><span class="t">${hhmm(new Date(e.t))}</span><span>${esc(e.text)}</span></div>`).join('');
    $('#view-alarms').innerHTML = `<div class="sprow"><button id="ackAll">ACK ALL</button><span class="dim">ISA-18.2-style states: unacked active = flashing; RTN-unacked stays until acknowledged.</span></div>
      <h3>Alarm summary (${al.length})</h3>${rows || '<p class="dim">No alarms.</p>'}<h3>Event journal</h3>${ev}`;
    $('#ackAll').onclick = () => { this.sim.alarms.ackAll(); this.refreshSoon = true; };
    for (const b of document.querySelectorAll('[data-ack]')) b.onclick = () => { this.sim.alarms.ack(b.dataset.ack); this.refreshSoon = true; };
    for (const b of document.querySelectorAll('[data-go]')) b.onclick = () => this.openSite(b.dataset.go);
  }

  renderCosts() {
    const sim = this.sim; const ch = A.chemicals; const t = sim.time;
    if (document.activeElement && document.activeElement.id === 'rppPlan') return;
    const ga = E.gaMonth(t); const oz = E.ozp(t); const pa = sim.peakNow || E.peakAlert(t);
    const od = E.ontarioDemand(t);
    let zr = '', sr = '';
    for (const z of sim.zones.values()) {
      const y = z.yday;
      zr += `<tr><td>${esc(z.cfg.name)}</td><td class="num">${fmt(z.cfg.avgDemandM3d)}</td><td class="num">${fmt(z.today.m3)}</td><td class="num">${fmt(z.today.kwh)}</td><td class="num">${money(z.today.elec)}</td><td class="num">${money(z.today.chem)}</td>
        <td class="num">${y ? fmt(y.m3) : '—'}</td><td class="num">${y ? money(y.elec + y.chem) : '—'}</td><td class="num">${z.today.m3 > 1 ? ((z.today.elec + z.today.chem) / z.today.m3 * 100).toFixed(1) + '¢' : '—'}</td></tr>`;
    }
    const objs = [...sim.sites.values(), ...[...sim.links.values()].filter(l => l.cfg.kind === 'PS')];
    for (const s of objs) {
      const det = Object.entries(s.today.chemDetail).map(([k, v]) => `${k} ${money(v)}`).join(' · ');
      const nm = s.cfg.name; const isSite = !!s.allPumps;
      sr += `<tr><td>${esc(nm)}</td><td>${s.cls}</td><td class="num">${fmt(s.connKw)}</td><td class="num">${isSite ? fmt(s.cfg.avg2025M3d) : '—'}</td><td class="num">${fmt(s.today.m3)}</td><td class="num">${fmt(s.today.kwh)}</td><td class="num">${s.today.m3 > 1 ? (s.today.kwh / s.today.m3).toFixed(2) : '—'}</td><td class="num">${money(s.today.elec)}</td><td class="num">${s.today.ga ? money(s.today.ga) : ''}</td><td class="num">${s.today.diesel ? money(s.today.diesel) : ''}</td><td class="num">${money(s.today.chem)}</td><td class="dim">${det}</td></tr>`;
    }
    const cA = objs.filter(o => o.cls === 'A').length, cB = objs.filter(o => o.cls === 'B').length, cR = objs.filter(o => o.cls === 'RPP').length;
    const conf = sim.peak.confirmed.map(p => `${p.day} HE${p.he}: ${fmt(p.kw)} kW`).join(' · ') || 'none yet in this run';
    const alertH = sim.peak.alertHours.map(p => `${p.day} HE${p.he}: ${fmt(p.kw)} kW`).join(' · ') || 'none yet';
    const pdfNext = sim.peak.confirmed.length ? sim.peak.confirmed.reduce((a, p) => a + p.kw / 1000, 0) / E.TOP5_2026.reduce((a, b) => a + b.mw, 0) : null;
    const avoidVal = E.DOLLARS_PER_MW_ALL5;
    $('#view-costs').innerHTML = `<div class="help" style="max-width:1200px">
      <h3>Electricity – who pays what (Ontario)</h3>
      <table><tr><th>Customer class (sites in sim)</th><th>Energy price used</th><th>Global Adjustment (GA)</th><th>Basis</th></tr>
      <tr><td><b>Class A</b> (${cA}): Mannheim complex – WTP + Zone 4/5/6 PS (${fmt(sim.sites.get('MWTP').connKw)} kW connected)</td><td>Ontario Zonal Price (hourly) + ${E.DELIVERY_ADDER * 100}¢ delivery ${EST}<br>now: $${oz.v.toFixed(2)}/MWh ${oz.real ? REAL + ' IESO day-ahead OZP' : EST + ' (Jul-2026 hourly avg)'}</td>
        <td><b>GA$ = PDF × monthly GA total</b>. PDF = facility MWh in the base period's 5 peak hours ÷ Ontario MWh in those hours.<br>Assumed PDF Jul 2026–Jun 2027 = ${E.CLASS_A_ASSUMED_PEAK_MW} MW × 5 h ÷ ${fmt(E.TOP5_2025_SUM, 1)} MWh = ${(E.PDF_CURRENT * 1e6).toFixed(1)} ppm ${EST}<br>${ga.month} GA total: ${money(ga.totalDollars)} (${esc(ga.status)}) → ≈ ${money(E.classAGaPerSec(t) * 86400)}/day</td>
        <td>Eligibility: avg monthly peak &gt;5 MW automatic, &gt;1–5 MW opt-in (<a href="${E.ESRC.IESO_ELIG}" target="_blank">IESO</a>); PDF method + 2025-26 top-5 hours (<a href="${E.ESRC.IESO_PDF}" target="_blank">IESO</a>). Region's actual class/PDF not public ${EST}</td></tr>
      <tr><td><b>Class B</b> (${cB}): every account that is not Class A and not on the RPP (here: non-RPP ≈ connected load ≥ ${E.CLASS_B_MIN_KW} kW ${EST})</td><td>OZP + Class B GA rate + ${E.DELIVERY_ADDER * 100}¢ delivery ${EST}<br>now: ${((oz.v + ga.classBRatePerMWh) / 10).toFixed(2)}¢ + ${E.DELIVERY_ADDER * 100}¢</td><td>Class B GA ${ga.month}: <b>$${ga.classBRatePerMWh.toFixed(2)}/MWh</b> (${esc(ga.status)})</td><td><a href="${E.ESRC.IESO_GAB}" target="_blank">IESO GA for Class B</a> · <a href="${E.ESRC.IESO_GA_XML}" target="_blank">monthly GA reports</a></td></tr>
      <tr><td><b>RPP</b> (${cR}): small wells / village plants eligible for the RPP (approximated as &lt; ${E.CLASS_B_MIN_KW} kW ${EST})</td><td>Plan: <select id="rppPlan"><option ${sim.rppPlan === 'TOU' ? 'selected' : ''}>TOU</option><option ${sim.rppPlan === 'TIERED' ? 'selected' : ''}>TIERED</option></select><br>TOU off ${E.RPP.tou.offPeak * 100}¢ · mid ${E.RPP.tou.midPeak * 100}¢ · on ${E.RPP.tou.onPeak * 100}¢; tiered ${E.RPP.tier1 * 100}¢ ≤ ${E.RPP.tierThresholdKwhMonthNonRes} kWh/month, then ${E.RPP.tier2 * 100}¢ (+${E.DELIVERY_ADDER * 100}¢ delivery ${EST})</td><td>included in RPP price</td><td><a href="${E.ESRC.OEB_RPP}" target="_blank">OEB RPP Price Report (prices eff. Nov 1 2025)</a></td></tr>
      <tr><td>Standby generation (peak-shave / outage)</td><td>${money(E.DIESEL_PER_KWH)}/kWh diesel ${EST}</td><td>Generator output reduces grid kW → lowers PDF if run in peak hours</td><td>${EST}</td></tr></table>
      <h3>ICI peak management (Industrial Conservation Initiative)</h3>
      ${(() => { const pj = E.projectNextYear(sim.peak.confirmed); return `<div class="pdfbox"><b>Your peak-avoidance result → next year's Global Adjustment</b> ${EST}<table class="grid"><tr><th>2026 top-5 hour (real)</th><th>Ontario MW</th><th>Mannheim kW</th></tr>${pj.rows.map(r => `<tr><td>${r.date} HE${r.he}</td><td class="num">${fmt(r.mw)}</td><td class="num">${fmt(r.kw)} ${r.simulated ? '<b>(you)</b>' : '<span class="dim">(assumed 2.5 MW – not simulated)</span>'}</td></tr>`).join('')}</table>
      Projected PDF = Σ Mannheim MW in the 5 hours ÷ Σ Ontario MW = <b>${(pj.pdf * 1e5).toFixed(3)}×10⁻⁵</b> (baseline at 2.5 MW: ${(pj.pdfBase * 1e5).toFixed(3)}×10⁻⁵).<br>
      Next-year Class A GA ≈ PDF × 12-month GA ($${fmt(E.GA_12M_TOTAL / 1e9, 2)} B) = <b>${money(pj.ga)}/yr</b> vs ${money(pj.gaBase)}/yr baseline → <b style="color:${pj.saving >= 0 ? 'var(--run)' : 'var(--crit)'}">${pj.saving >= 0 ? 'saving' : 'extra cost'} ${money(Math.abs(pj.saving))}/yr</b>.</div>`; })()}
      <div class="kv" style="max-width:820px"><span>Today Ontario demand ${od.real ? REAL + ' IESO hourly demand 2026' : EST + ' (no data – average curve)'}</span><span>peak ${fmt(pa.mw)} MW at HE${pa.he}; 5th-highest so far this base period ${fmt(pa.fifth)} MW → ${pa.alert ? '<b style="color:var(--crit)">PEAK ALERT</b>' : 'no alert'}</span></div>
      <canvas class="trend" id="trOnt" style="max-width:820px;height:130px"></canvas>
      <div class="dim">Ontario demand MW (blue) with 5th-highest-so-far line (red); Class A load kW by hour (yellow, right scale).</div>
      <p>Confirmed 2026-27 top-5 hours (IESO ICI tracker, Final): ${E.TOP5_2026.map(p => `${p.date} HE${p.he} ${fmt(p.mw)} MW`).join(' · ')} ${REAL}<br>
      Your Class A load in those hours (this run): <b>${conf}</b>${pdfNext ? ` → contribution to next PDF ≈ ${(pdfNext * 1e6).toFixed(2)} ppm` : ''}<br>Class A load during in-sim peak-alert windows: ${alertH}<br>
      <b>Value of peak avoidance</b>: 1 MW drawn in all 5 peak hours ≈ <b>${money(avoidVal)}/yr</b> of GA = 5 h ÷ ${fmt(E.TOP5_2026.reduce((a, b) => a + b.mw, 0))} MW (2026 tracker) × ${money(E.GA_12M_TOTAL)} (GA total Oct 2025–Sep 2026, IESO). ${EST} (settlement uses AQEW, not Ontario demand)</p>
      <p class="dim">Peak-avoidance levers in the sim: fill storage before the alert window, then drop Mannheim WTP flow (MAN) and let the Mannheim reservoir / Kit 4 storage carry HE16–HE19; shift Zone PS pumping; run the Mannheim standby generator in parallel (faceplate → Power) – diesel is cheap compared with the GA a top-5 hour costs.</p>
      <h3>Other assumed rates</h3>
      <table><tr><th>Item</th><th>Value</th><th>Basis</th></tr>
      <tr><td>Pump energy</td><td>P = ρ·g·Q·H / η, η=${A.pumpWireToWaterEff.value}</td><td>${EST} heads (m): well→dist ${A.tdhM.wellDirect}, well→CW ${A.tdhM.wellToClearwell}, high lift ${A.tdhM.highLift}, Mannheim LL ${A.tdhM.mannLowLift}/booster ${A.tdhM.mannBooster}; Zone PS heads in Transfers tab</td></tr>
      <tr><td>NaOCl 12%</td><td>$${ch.naocl12.pricePerL}/L; L = dose·Q/1000/0.12</td><td>${EST}</td></tr>
      <tr><td>Ammonium sulphate 20%</td><td>$${ch.ammSulphate20.pricePerL}/L; Cl₂:N = ${ch.ammSulphate20.cl2ToNRatio}:1</td><td>${EST}</td></tr>
      <tr><td>Cl₂ gas / PACl / polymer / LOX / H₂O₂</td><td>$${ch.cl2gas.pricePerKg} / $${ch.pacl.pricePerKg} / $${ch.polymer.pricePerKg} / $${ch.lox.pricePerKg} / $${ch.h2o2_50.pricePerKg} per kg</td><td>${EST}</td></tr>
      <tr><td>Greenbrook AOP UV energy</td><td>orders removed = (kW ÷ m³/h) ÷ EEO; EEO = ${DX.eeoKwhPerM3Order} × ${DX.scavengerFactor} × (1 + ${DX.h2o2HalfSatMgL}/H₂O₂ mg/L) kWh/m³/order</td><td>${EST} (${esc(DX.eeoSrc)})</td></tr>
      <tr><td>Context: Region wholesale water rate 2026</td><td>$${A.waterRate.wholesalePerM3}/m³</td><td>${REAL} <a href="${A.waterRate.source}" target="_blank">Region of Waterloo</a></td></tr></table>
      <h3>Zones – daily totals</h3><table class="grid"><thead><tr><th>Zone</th><th>Avg m³/d ${EST}</th><th>Today m³</th><th>kWh</th><th>Elec $</th><th>Chem $</th><th>Yesterday m³</th><th>Yesterday $</th><th>¢/m³</th></tr></thead><tbody>${zr}</tbody></table>
      <h3>Sites &amp; pump stations – daily totals</h3><table class="grid"><thead><tr><th>Site / PS</th><th>Class</th><th>Conn. kW ${EST}</th><th>2025 avg m³/d</th><th>Today m³</th><th>Grid kWh</th><th>kWh/m³</th><th>Energy $</th><th>GA (A) $</th><th>Diesel $</th><th>Chem $</th><th>Chemicals</th></tr></thead><tbody>${sr}</tbody></table></div>`;
    $('#rppPlan').onchange = e => { sim.rppPlan = e.target.value; sim.alarms.log(`OPR · RPP plan for small sites = ${sim.rppPlan}`); };
    const curve = od.curve; const ak = sim.peak.todayKw.map(v => v ?? NaN);
    const cv = $('#trOnt'); drawBars(cv, curve, pa.fifth, ak);
  }

  // ---------------- zone faceplate ----------------
  openZone(id) { this.fpSite = null; this.fpZone = id; $('#faceplate').classList.remove('hidden'); this.renderZoneFp(); }
  renderZoneFp() {
    const sim = this.sim; const z = sim.zones.get(this.fpZone); const c = z.cfg; const fp = $('#faceplate');
    const ins = [...sim.links.values()].filter(l => l.cfg.to === z.id), outs = [...sim.links.values()].filter(l => l.cfg.from === z.id);
    const lk = l => `<div class="kv"><span>${esc(l.cfg.name)} (${l.mode})</span><span>${fmt(l.q, 1)} L/s</span></div>`;
    fp.innerHTML = `<button class="close">✕</button><h2>${esc(c.name)}</h2><div class="dim">${esc(c.muni)}${c.ius ? ' · Integrated Urban System' : ''}${c.note ? ' · ' + esc(c.note) : ''}</div>
      <div class="fp-sec"><h3>Storage &amp; pressure</h3>
      <div class="kv"><span>${esc(c.storageName)}</span><span>${fmt(c.storageM3)} m³ ${st(c.storageSt)}</span></div>
      <div class="bar"><i style="width:${z.level}%"></i></div><div class="kv"><span>Level</span><span>${z.level.toFixed(1)}%</span></div>
      ${c.node ? '' : `<div class="kv"><span>Pressure (model) ${EST}</span><span>${fmt(z.press)} kPa / ${fmt(z.press * 0.145)} psi · today's min ${fmt(z.minPress)} kPa</span></div>`}
      ${c.hgl ? `<div class="kv"><span>HGL ${st(c.hglSt)}</span><span>${c.hgl} m</span></div>${c.hglNote ? `<div class="dim">${esc(c.hglNote)}</div>` : ''}` : ''}</div>
      <div class="fp-sec"><h3>Demand</h3><div class="kv"><span>Average day ${EST}</span><span>${fmt(c.avgDemandM3d)} m³/d (${fmt(c.avgDemandM3d / 86.4, 1)} L/s)</span></div>
      <div class="kv"><span>Now</span><span>${fmt(z.demandLs, 1)} L/s${z.leakLs ? ` incl. break ${fmt(z.leakLs)} L/s` : ''}</span></div><div class="kv"><span>Supply in / transfers out</span><span>${fmt(z.inLs, 1)} / ${fmt(z.outLs, 1)} L/s</span></div>
      <div class="kv"><span>Today</span><span>${fmt(z.today.m3)} m³</span></div><p class="dim">${esc(c.demandMethod || '')}</p></div>
      <div class="fp-sec"><h3>Transfers in</h3>${ins.map(lk).join('') || '<span class="dim">none</span>'}<h3>Transfers out</h3>${outs.map(lk).join('') || '<span class="dim">none</span>'}</div>
      <div class="fp-sec"><h3>Trend 24 h – level % (blue), demand L/s (orange), pressure kPa/6 (green)</h3><canvas class="trend" id="trZ"></canvas></div>
      <div class="fp-sec"><h3>Sources in this zone</h3>${c.sites.map(id => `<button data-s="${id}">${esc(sim.sites.get(id).cfg.name)}</button>`).join(' ') || '<span class="dim">none – supplied by transfers</span>'}</div>`;
    fp.querySelector('.close').onclick = () => this.closeFp();
    for (const b of fp.querySelectorAll('[data-s]')) b.onclick = () => this.openSite(b.dataset.s);
    drawTrend($('#trZ'), [{ d: z.trend.series('level'), c: '#4aa3ff', lo: 0, hi: 100 }, { d: z.trend.series('demand'), c: '#ffb020' }, { d: z.trend.series('press').map(v => v / 6), c: '#2ecc71', lo: 0, hi: 100 }]);
  }

  // ---------------- site faceplate ----------------
  closeFp() { this.fpSite = null; this.fpZone = null; $('#faceplate').classList.add('hidden'); }
  openSite(id) {
    this.fpZone = null; this.fpSite = id; const s = this.sim.sites.get(id); const c = s.cfg; const fp = $('#faceplate');
    fp.classList.remove('hidden');
    const treat = [c.greensand && 'greensand Fe/Mn filters', c.aop && `AOP (${c.aop === 'h2o2_uv' ? 'H₂O₂+UV' : 'NaOCl+UV'})`, c.gac && 'GAC contactors', c.uv && 'UV', ...c.chem.map(x => ({ naocl: 'NaOCl 12%', nh4: 'ammonium sulphate', h2o2: 'H₂O₂', cl2gas: 'Cl₂ gas', pacl: 'PACl', polymer: 'polymer', lox: 'LOX/ozone' }[x]))].filter(Boolean).join(' · ');
    const sp = (label, key, val, step, unit, est = true) => `<div class="sprow"><label>${label}${est ? EST : ''}</label><input type="number" step="${step}" data-sp="${key}" value="${(+val).toFixed(step < 1 ? 2 : 0)}"> <span class="dim">${unit}</span></div>`;
    let html = `<button class="close">✕</button><h2>${esc(c.name)}</h2>
      <div class="dim">${KIND[s.kind]} · zone ${esc(this.sim.zones.get(s.zone).cfg.name)} · ${c.lat.toFixed(4)}, ${c.lon.toFixed(4)} ${c.locQuality === 'real' ? '<span class="real">location sourced</span>' : '<span class="est">location approx.</span>'} · electricity class ${s.cls} ${EST}</div>
      <div class="dim">Treatment: ${esc(treat || 'disinfection at Mannheim (ASR blend)')}</div>
      <div class="dim">2025: avg ${fmt(c.avg2025M3d)} m³/d · max day ${fmt(c.maxDay2025M3d)} · peak raw ${fmt(c.peakRawLs2025, 1)} L/s · MDWL limit ${fmt(c.mdwlM3d)} m³/d <span class="real">Summary Rpt</span></div>
      ${c.note ? `<div class="dim">${esc(c.note)}</div>` : ''}
      <div class="fp-sec" id="fpIlk"></div><div class="fp-sec"><h3>Power</h3><div id="fpPwr"></div></div>`;
    if (s.kind === 'surface') {
      html += `<div class="fp-sec"><h3>Raw water / intake</h3><div id="fpRiver"></div><div id="fpPumps"></div>
        <div class="sprow"><label>Plant flow control</label><button data-pm="AUTO">AUTO (level)</button><button data-pm="MAN">MAN</button></div>
        ${sp('Plant flow SP (L/s)', 'flowSp', s.plant.flowSp, 5, 'max ≈625 L/s peak (peer review)', false)}</div>
        <div class="fp-sec"><h3>Coagulation · ozone</h3>${sp('PACl dose', 'paclSp', s.plant.paclSp, 1, 'mg/L')}${sp('Polymer', 'polySp', s.plant.polySp, 0.05, 'mg/L')}${sp('Ozone dose', 'ozoneSp', s.plant.ozoneSp, 0.1, 'mg/L')}<div id="fpProc"></div></div>
        <div class="fp-sec"><h3>Filters (4 – F1/F2 GAC/sand, F3/F4 anthracite/sand <a href="${SRC.MUTTI}" target="_blank" class="real">CWWA 2022</a>)</h3>
        <div class="sprow"><label>PLC auto-backwash</label><button data-abw="1">ON</button><button data-abw="0">OFF</button><span class="dim">initiates at ${MF.termHeadlossM} m headloss, 0.2 NTU or 96 h ${EST}</span></div><div id="fpFilt"></div>
        <div class="dim">Sequence ${EST}: ${MF.steps.map(([n, m]) => `${n} ${m} min`).join(' → ')}. One filter at a time; ≥2 must stay in service. Plant capacity = filters in service × ${MF.capLsEach} L/s ${EST} (≤625).</div></div>`;
    } else {
      html += `<div class="fp-sec"><h3>${s.kind === 'wtp' ? 'Well pumps → clearwell' : 'Well pumps'}</h3><div id="fpPumps"></div>
        ${s.kind === 'wtp' ? sp('Wells START below CW', 'cwStart', s.sp.cwStart, 1, '%') + sp('Wells STOP above CW', 'cwStop', s.sp.cwStop, 1, '%') : ''}
        ${s.kind === 'asr' ? '<p class="dim">AUTO: starts when Mannheim clearwell &lt; 45 %, stops &gt; 75 %.</p>' : ''}</div>`;
      if (s.aop) html += `<div class="fp-sec"><h3>AOP – UV / H₂O₂ (1,4-dioxane)</h3>${sp('UV power', 'uvKw', s.aop.uvKw, 10, `kW (max ${DX.uvKwMax})`)}${sp('H₂O₂ dose', 'h2o2', s.aop.h2o2, 0.5, 'mg/L')}<div id="fpAop"></div>
        <div class="dim">MAC 50 µg/L <a href="${SRC.HCDIOX}" target="_blank" class="real">Health Canada 2021</a> · history: plant shut 2004 at up to 285 µg/L, UV/H₂O₂ selected <a href="${SRC.AWWA06}" target="_blank" class="real">AWWA WQTC 2006</a> · per-well concentrations &amp; kinetics ${EST}</div></div>`;
      if (s.kind === 'wtp') html += `<div class="fp-sec"><h3>Clearwell ${fmt(c.clearwellM3)} m³ <span class="real">AWQR</span> → high-lift pumps</h3><div id="fpCw"></div><div id="fpHl"></div></div>`;
      if (s.kind !== 'asr') html += `<div class="fp-sec"><h3>${s.kind === 'wtp' ? 'High-lift' : 'Well'} control on zone storage (PLC lead/lag)</h3>
        ${sp('Lead START below', 'leadStart', s.sp.leadStart, 0.5, '% zone level')}${sp('Lead STOP above', 'leadStop', s.sp.leadStop, 0.5, '% zone level')}${sp('Lag stagger', 'stagger', s.sp.stagger, 0.5, '% per pump')}
        <p class="dim">Each additional (lag) pump starts/stops one stagger lower. 5-min minimum run / off timers (anti short-cycle). HAND runs regardless of PLC (only hardwired trips or loss of power stop it).</p></div>`;
    }
    if (s.cl2) html += `<div class="fp-sec"><h3>Chlorination ${s.cl2.nh4 ? '+ chloramination (NH₄)' : ''}</h3>
      ${sp(s.kind === 'surface' ? 'Cl₂ gas dose' : 'NaOCl dose', 'cl2Sp', s.cl2.sp, 0.05, 'mg/L')}
      <div class="sprow"><label>Duty metering pump</label><button data-duty="A">A</button><button data-duty="B">B</button></div><div id="fpCl"></div></div>`;
    if (s.uv && s.kind !== 'surface') html += `<div class="fp-sec"><h3>UV</h3><div id="fpUv"></div></div>`;
    html += `<div class="fp-sec"><h3>Trends 24 h</h3><div class="dim">flow L/s (green) · level % (blue) · Cl₂ ×20 (yellow)${s.plant ? ' · filtered NTU ×100 (red)' : s.aop ? ' · AOP effluent 1,4-dioxane µg/L (red)' : ''}</div><canvas class="trend" id="trS"></canvas></div>
      <div class="fp-sec"><h3>Site alarms</h3><div id="fpAl"></div></div>
      <div class="fp-sec dim">Sources: ${c.sources.map(u => `<a href="${u}" target="_blank">${esc(u.replace(/^https?:\/\//, '').slice(0, 48))}…</a>`).join(' · ')}</div>`;
    fp.innerHTML = html;
    fp.querySelector('.close').onclick = () => this.closeFp();
    for (const i of fp.querySelectorAll('[data-sp]')) i.onchange = () => { const v = parseFloat(i.value); if (Number.isFinite(v)) this.sim.setSp(id, i.dataset.sp, v); };
    for (const b of fp.querySelectorAll('[data-duty]')) b.onclick = () => this.sim.setSp(id, 'cl2Duty', b.dataset.duty);
    for (const b of fp.querySelectorAll('[data-pm]')) b.onclick = () => this.sim.setSp(id, 'mode', b.dataset.pm);
    for (const b of fp.querySelectorAll('[data-abw]')) b.onclick = () => this.sim.setSp(id, 'autoBw', b.dataset.abw === '1');
    this.updateFaceplate();
  }
  pumpTiles(s, pumps) {
    return pumps.map(p => `<div class="ptile"><div class="nm">${p.id} <span class="dim">${p.role}</span></div>
      <div class="st ${p.state}">${p.state}${p.trip ? ' – ' + esc(p.trip) : ''}</div>
      <div class="hoa">${['HAND', 'OFF', 'AUTO'].map(m => `<button class="${m[0]} ${p.mode === m ? 'on' : ''}" data-mode="${s.id}|${p.id}|${m}">${m[0] === 'H' ? 'HAND' : m}</button>`).join('')}</div>
      <div>${fmt(p.q, 1)} L/s · ${fmt(p.kw, 1)} kW</div><div class="dim">cap ${fmt(p.qCap, 1)} L/s ${EST}</div><div class="dim">run ${fmt(p.runSec / 60)} min · starts ${p.starts}</div>
      ${p.trip ? `<button data-reset="${s.id}|${p.id}">RESET</button>` : ''}</div>`).join('');
  }
  powerHtml(s) {
    const pw = s.pw; const g = pw.gen;
    return `<div class="kv"><span>Utility supply</span><span>${pw.grid ? 'ON' : '<b style="color:var(--crit)">OFF</b>'}${pw.latch ? ' · <b style="color:var(--warn)">power-fail latch – restart required</b>' : ''}</span></div>
      <div class="kv"><span>Standby generator <span class="real">AWQR</span></span><span>${g ? `${g.state} · ${fmt(g.kw)} kW ${EST}${g.fault ? ' · <b style="color:var(--crit)">FAULT</b>' : ''}` : 'none listed in AWQR 2025'}</span></div>
      ${pw.genFrac < 1 && pw.on ? `<div class="kv"><span>Generator covers</span><span>${(pw.genFrac * 100).toFixed(0)} % of connected load – PLC limits running pumps</span></div>` : ''}
      <div class="sprow">${g ? `<button data-gen="start">Start generator</button><button data-gen="stop">Stop / retransfer to utility</button><button data-gen="reset">Reset gen fault</button>` : ''}<button data-gen="restart">Power-fail restart</button><span id="pwMsg" class="dim"></span></div>`;
  }
  updateFaceplate() {
    const s = this.sim.sites.get(this.fpSite); if (!s) return; const fp = $('#faceplate'); const sim = this.sim;
    const set = (sel, h) => { const e = fp.querySelector(sel); if (e && e.dataset.h !== h) { e.innerHTML = h; e.dataset.h = h; } };
    set('#fpIlk', s.interlock ? `<span class="ilk">INTERLOCK: ${esc(s.interlock)}</span> <button id="ilkReset">Reset interlock</button> <span id="ilkMsg" class="dim"></span>` : `<span class="dim">No interlock active · supply ${fmt(s.flowOut, 1)} L/s · ${fmt(s.kw)} kW · today ${fmt(s.today.m3)} m³</span>`);
    set('#fpPwr', this.powerHtml(s));
    if (s.kind === 'surface') {
      const P = s.plant;
      set('#fpRiver', `<div class="kv"><span>Grand River near Doon 02GA048</span><span>${sim.river.flow.toFixed(1)} m³/s</span></div><div class="kv"><span>Raw turbidity ${EST}</span><span>${sim.river.turbRaw.toFixed(1)} NTU</span></div><div class="kv"><span>Plant flow (actual / capacity)</span><span>${fmt(P.flow)} / ${fmt(P.cap)} L/s · mode ${P.mode}</span></div>`);
      set('#fpPumps', this.pumpTiles(s, [...s.wells, ...s.boosters]));
      set('#fpProc', `<div class="kv"><span>Jar-test suggested PACl ${EST}</span><span>${P.paclReq.toFixed(1)} mg/L</span></div><div class="kv"><span>Settled</span><span>${P.settled.toFixed(2)} NTU</span></div>
        <div class="kv"><span>Filtered (combined)</span><span>${P.filtered.toFixed(3)} NTU ${P.ftw ? '<span class="ilk">FILTER-TO-WASTE</span>' : ''}</span></div><div class="kv"><span>UV dose</span><span>${s.uv.dose.toFixed(0)} mJ/cm²</span></div>
        <div class="kv"><span>Clearwells 15,280 m³</span><span>${s.cwLevel.toFixed(1)}% · to Mannheim res. ${fmt(s.flowOut)} L/s · waste ${fmt(s.wasteLs || 0)} L/s</span></div>`);
      set('#fpFilt', s.filters.map(f => `<div class="ftile ${f.state}"><div class="nm"><b>${f.id}</b> <span class="dim">${f.media}</span></div><div class="st">${f.state}${f.state === 'WASH' ? ' – ' + MF.steps[f.step][0] + ' ' + fmt((MF.steps[f.step][1] * 60 - f.stepT) / 60) + ' min' : ''}</div>
        <div>HL ${f.hl.toFixed(2)} m · ${f.turb.toFixed(3)} NTU</div><div class="dim">${fmt(f.q)} L/s · run ${fmt(f.runH, 1)} h · washes ${f.washes}</div>
        ${f.state === 'SERVICE' ? `<button data-bw="${f.id}">Backwash</button><button data-fo="${f.id}">Out of svc</button>` : f.state === 'WASH' ? (MF.steps[f.step][0] === 'FILTER-TO-WASTE' ? `<button data-skip="${f.id}">Skip FTW</button>` : '') : `<button data-fi="${f.id}">In service</button>`}</div>`).join(''));
      for (const b of fp.querySelectorAll('[data-pm]')) b.classList.toggle('on', b.dataset.pm === P.mode);
      for (const b of fp.querySelectorAll('[data-abw]')) b.classList.toggle('on', (b.dataset.abw === '1') === !!P.autoBw);
      const inp = fp.querySelector('[data-sp=flowSp]'); if (inp && P.mode === 'AUTO' && document.activeElement !== inp) inp.value = P.flowSp.toFixed(0);
      for (const b of fp.querySelectorAll('[data-bw]')) b.onclick = () => { const r = sim.startBackwash('MWTP', b.dataset.bw); if (r !== 'ok') alert(r); this.updateFaceplate(); };
      for (const b of fp.querySelectorAll('[data-skip]')) b.onclick = () => { sim.skipFtw(b.dataset.skip); this.updateFaceplate(); };
      for (const b of fp.querySelectorAll('[data-fo]')) b.onclick = () => { sim.setFilterSvc(b.dataset.fo, false); this.updateFaceplate(); };
      for (const b of fp.querySelectorAll('[data-fi]')) b.onclick = () => { sim.setFilterSvc(b.dataset.fi, true); this.updateFaceplate(); };
    } else {
      set('#fpPumps', this.pumpTiles(s, s.wells));
      if (s.kind === 'wtp') { set('#fpCw', `<div class="bar"><i style="width:${s.cwLevel}%"></i><b style="left:${s.sp.cwStart}%"></b><b style="left:${s.sp.cwStop}%"></b></div><div class="kv"><span>Clearwell level</span><span>${s.cwLevel.toFixed(1)}% · in ${fmt(s.flowIn, 1)} / out ${fmt(s.flowOut, 1)} L/s</span></div>`); set('#fpHl', this.pumpTiles(s, s.hl)); }
      if (s.aop) { const a = s.aop; set('#fpAop', `<div class="kv"><span>Per-well raw ${EST}</span><span>${s.wells.map(p => `${p.id} ${((DX.wellRawUgL[p.id] ?? 20) * (a.mult[p.id] ?? 1)).toFixed(0)}${p.q > 0 ? '' : '(off)'}`).join(' · ')} µg/L</span></div>
        <div class="kv"><span>Blended raw</span><span>${a.raw.toFixed(1)} µg/L</span></div><div class="kv"><span>Log removal (orders)</span><span>${(a.orders || 0).toFixed(2)}</span></div>
        <div class="kv"><span>AOP effluent 1,4-dioxane</span><span style="color:${a.out > DX.macUgL ? 'var(--crit)' : a.out > DX.opTargetUgL ? 'var(--warn)' : 'inherit'}">${a.out.toFixed(1)} µg/L (op. limit ${DX.opTargetUgL} ${EST}, MAC ${DX.macUgL})</span></div>`); }
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
    for (const b of fp.querySelectorAll('[data-gen]')) b.onclick = () => {
      const k = b.dataset.gen; const r = k === 'start' ? sim.startGen(s.id) : k === 'stop' ? sim.stopGen(s.id) : k === 'reset' ? sim.resetGenFault(s.id) : sim.resetPowerLatch(s.id);
      const m = fp.querySelector('#pwMsg'); if (m) m.textContent = r === 'ok' ? '' : r; this.updateFaceplate();
    };
    const ir = fp.querySelector('#ilkReset'); if (ir) ir.onclick = () => { const r = sim.resetInterlock(s.id); if (r !== 'ok') fp.querySelector('#ilkMsg').textContent = r; };
    const cl = s.trend.series('cl2').map(v => v * 20), tb = s.trend.series('turb').map(v => v * 100);
    drawTrend(fp.querySelector('#trS'), [{ d: s.trend.series('level'), c: '#4aa3ff', lo: 0, hi: 100 }, { d: s.trend.series('flow'), c: '#2ecc71' }, { d: cl, c: '#ffd54a', lo: 0, hi: 100 }, ...(s.plant || s.aop ? [{ d: tb, c: '#ff4d4d', lo: 0, hi: 100 }] : [])]);
  }

  renderHelp() {
    const S = DATA.sources;
    const nReal = DATA.sites.filter(s => s.locQuality === 'real').length;
    $('#view-help').innerHTML = `<div class="help">
      <h2>What this is</h2><p>WR-WATER v0.2 is an <b>unofficial training simulator</b> of the Region of Waterloo water supply (Integrated Urban System + township systems). It is not connected to, endorsed by, or validated against the Region's SCADA. Numbers marked ${EST} are training assumptions; everything else is traceable to the public sources below.</p>
      <h2>How to drive it</h2><ul>
      <li><b>Master board</b>: Mannheim panel, real pressure-zone tiles grouped by municipality (dashed = closed zone with no floating storage; its "level" is a supply-balance proxy), and every supply site. Click any tile/row → faceplate.</li>
      <li><b>Transfers</b>: every pump station / PRV / control valve between zones – AUTO (holds receiving-zone level SP), MAN (fixed L/s), CLOSED.</li>
      <li><b>Faceplate</b>: HAND/OFF/AUTO per pump, RESET after trips, setpoints, Cl₂ dose/duty pump, interlock reset, <b>Power</b> (utility/generator/ATS, power-fail restart), Mannheim <b>filters &amp; backwash</b>, Greenbrook <b>AOP</b> (UV kW, H₂O₂), trends, site alarms.</li>
      <li><b>PLC logic</b>: level lead/lag staging, 5-min min-run/off, clearwell low holds high lift, Cl₂ LOW-LOW 60 s → latched shutdown, UV low → shutdown, Mannheim filtered &gt;1 NTU 2 min → filter-to-waste, 1,4-dioxane &gt; MAC 2 min → Greenbrook shutdown, power loss → pumps stop and (without generator) a power-fail latch blocks AUTO restart until the operator restarts the site.</li>
      <li><b>Electricity</b>: Class A (Mannheim complex) pays market price + PDF × GA, Class B pays market + Class B GA, small sites pay OEB RPP (TOU or tiered). IESO-style ICI peak alerts appear on high-demand days (real 2026 Ontario demand). See Daily totals &amp; cost.</li>
      <li><b>Clock</b>: free play starts Tue 14 Jul 2026 05:00 (a real 2026 ICI top-5 day); speeds 1× – 900×.</li></ul>
      <h2>Network (v0.2)</h2><p>${ZONE_CFGS.filter(z => z.ius && !z.node).length} real IUS pressure zones + the Mannheim reservoir node, ${this.sim.links.size} transfers / boosters / PRVs / valves, and ${ZONE_CFGS.filter(z => !z.ius).length} township systems. Per-zone and per-transfer sources and real/estimate status: <code>docs/network.md</code>.</p>
      <h2>Scenarios</h2><table><tr><th>Scenario</th><th>Objectives</th></tr>${SCENARIOS.map(sc => `<tr><td><b>${esc(sc.title)}</b></td><td>${sc.objectives.map(o => esc(o.text)).join('<br>')}</td></tr>`).join('')}</table>
      <p class="dim">Each scenario is tested to FAIL with no trainee action (tests/scenario_noaction.mjs) and to PASS with the intended actions (tests/scenario_action.mjs).</p>
      <h2>Training simplifications to know</h2><ul>
      <li><b>Filtered turbidity</b>: the real Ontario criterion for chemically assisted filtration is ≤ 0.3 NTU in at least 95 % of the measurements each month, and never &gt; 1 NTU (Procedure for Disinfection of Drinking Water in Ontario). The turbidity scenario scores 15-minute readings against that 95 % rule; the board alarm is a simple 0.3 NTU threshold.</li>
      <li><b>Main-break Category 2 reportability</b>: the "correct" answer the main-break scenario scores (Category 2 not reportable vs reportable to MOH/SAC) is a <b>training simplification that needs review by a qualified Ontario operator / the Watermain Disinfection Procedure owner</b>. In particular, how the ≈4 % of customers who lost water and the 140 kPa (20 psi) intrusion rule (an industry convention, not in the Procedure) should drive the decision has not been expert-reviewed.</li>
      <li><b>Peak avoidance</b>: daily GA shown in the cost totals uses the current (2025-based) PDF; the effect of today's load in a real 2026 top-5 hour appears as next year's projected PDF and GA on the cost tab.</li></ul>
      <h2>Data provenance</h2><table>
      <tr><th>Data</th><th>Status</th><th>Source</th></tr>
      <tr><td>Wells per site, treatment trains, clearwell/reservoir volumes, high-lift pump counts, standby power</td><td>${REAL}</td><td><a href="${S.AWQR25}" target="_blank">2025 Annual Water Quality Report</a></td></tr>
      <tr><td>2025 monthly avg, max-day and raw peak flow per site; MDWL limits</td><td>${REAL}</td><td><a href="${S.SUM25}" target="_blank">2025 Operations Summary Report, App. C</a></td></tr>
      <tr><td>IUS pressure-zone names; which wells/plants feed which zone; Mannheim Zone 4/5/6 PS; K50 transfer ≤ 87 L/s; zone demand shares (2031)</td><td>${REAL}</td><td><a href="${SRC.WSMP15}" target="_blank">Water Supply Master Plan Update 2015</a> (Tables 2-2, 2-4, 2-6, 6-1)</td></tr>
      <tr><td>Kitchener/Cambridge/Woolwich transfers, PRV &amp; valve names, HGL targets (Kit 2E/Cam 2W 365 m, Elmira 422, Elmira East 398.5, St Jacobs 385, Breslau N 381), tank operating levels</td><td>${REAL}</td><td><a href="${SRC.WSDOMP15}" target="_blank">Water Supply &amp; Distribution Operations Master Plan 2015</a></td></tr>
      <tr><td>Waterloo zones Wat 4/4B/4C/5/6/7: HGLs, existing demands, MV2/MV3, Erb St valve/PRV, Northfield/Lakeshore/Zone 7 PS</td><td>${REAL}</td><td><a href="${SRC.WATWDMP}" target="_blank">City of Waterloo Water Distribution Master Plan 2017</a> · <a href="${S.WPZ}" target="_blank">City GIS pressure zones</a></td></tr>
      <tr><td>Cam 1W booster PS (target HGL 337 m), Kress Hill PRV</td><td>${REAL} (built status ${EST})</td><td><a href="${SRC.CAM1W}" target="_blank">Cambridge Zone 1W EA 2017</a></td></tr>
      <tr><td>Mannheim WTP 4 filters (GAC/sand + anthracite/sand)</td><td>${REAL}</td><td><a href="${SRC.MUTTI}" target="_blank">CWWA NWWC 2022 – Mannheim WTP</a></td></tr>
      <tr><td>Mannheim service-area capacity constraint and planned fixes (side-stream, Greenbrook, Cam 2W PS 2031)</td><td>${REAL}</td><td><a href="${SRC.MSA}" target="_blank">Region Mannheim Service Area hub</a></td></tr>
      <tr><td>Greenbrook 1,4-dioxane history (shut 2004, up to 285 µg/L; UV/H₂O₂ AOP), MAC 50 µg/L</td><td>${REAL}</td><td><a href="${SRC.AWWA06}" target="_blank">AWWA WQTC 2006 abstract</a> · <a href="${SRC.KITOP}" target="_blank">Kitchener op plan</a> · <a href="${SRC.HCDIOX}" target="_blank">Health Canada</a></td></tr>
      <tr><td>Watermain-break categories &amp; notification rules</td><td>${REAL}</td><td><a href="${SRC.WMDP}" target="_blank">Ontario Watermain Disinfection Procedure (2020)</a> · <a href="${SRC.REG170}" target="_blank">O. Reg. 170/03</a></td></tr>
      <tr><td>RPP TOU/tiered prices; Class B GA monthly rates &amp; totals; day-ahead Ontario zonal price; Ontario hourly demand; ICI top-5 hours; Class A eligibility</td><td>${REAL}</td><td><a href="${E.ESRC.OEB_RPP}" target="_blank">OEB</a> · <a href="${E.ESRC.IESO_GA_XML}" target="_blank">IESO GA</a> · <a href="${E.ESRC.IESO_OZP}" target="_blank">IESO OZP</a> · <a href="${E.ESRC.IESO_DEM}" target="_blank">IESO demand</a> · <a href="${E.ESRC.IESO_PDF}" target="_blank">IESO PDF/top-5</a> · <a href="${E.ESRC.IESO_ELIG}" target="_blank">IESO Class A eligibility</a></td></tr>
      <tr><td>Grand River near Doon 02GA048 daily flow → monthly medians</td><td>${REAL}</td><td><a href="${S.WSC}" target="_blank">ECCC Water Survey of Canada</a></td></tr>
      <tr><td>Site coordinates (${nReal} of ${DATA.sites.length} real)</td><td>mixed</td><td><a href="${S.KGIS}" target="_blank">City of Kitchener open data</a> · OSM · Nominatim</td></tr>
      <tr><td>Absolute zone demands (real shares scaled to 2025 production), Kitchener/Cambridge HGLs not published, storage volumes of towers/tanks, transfer capacities &amp; setpoints, pump heads/efficiency, generator sizes, feeder grouping, filter/backwash/AOP kinetics, per-well 1,4-dioxane, chemical prices, delivery adder, Class A/B assignment and assumed PDF, pressure model</td><td>${EST}</td><td>data/network.js, js/energy.js, data/facilities.js → assumptions, docs/research.md</td></tr></table>
      <h2>Acronyms</h2><p>SCADA · PLC · HOA hand-off-auto · CW clearwell · HL high lift · PS pumping station · PRV pressure-reducing valve · MTV motorized throttle valve · CV check/control valve · ET elevated tank · HGL hydraulic grade line · ATS automatic transfer switch · FTW filter-to-waste · AOP advanced oxidation · MAC maximum acceptable concentration · GA Global Adjustment · PDF peak demand factor · ICI Industrial Conservation Initiative · OZP Ontario zonal price · RPP Regulated Price Plan · TOU time-of-use · IUS Integrated Urban System · MOH Medical Officer of Health · SAC Spills Action Centre · BWA boil-water advisory.</p></div>`;
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
function drawBars(cv, curve, fifth, classKw) {
  if (!cv) return; const w = cv.clientWidth || 800, h = cv.clientHeight || 130;
  if (cv.width !== w) cv.width = w; if (cv.height !== h) cv.height = h;
  const g = cv.getContext('2d'); g.clearRect(0, 0, w, h);
  const lo = 12000, hi = Math.max(27000, ...curve) * 1.02; const bw = w / 24;
  const y = v => h - 12 - (v - lo) / (hi - lo) * (h - 20);
  g.fillStyle = '#2f5f8f'; curve.forEach((v, i) => { g.fillRect(i * bw + 2, y(v), bw - 4, h - 12 - y(v)); });
  if (fifth) { g.strokeStyle = '#ff4d4d'; g.beginPath(); g.moveTo(0, y(fifth)); g.lineTo(w, y(fifth)); g.stroke(); }
  const fin = classKw.filter(Number.isFinite); const kmax = Math.max(1000, ...fin) * 1.1;
  g.fillStyle = '#ffd54a'; classKw.forEach((v, i) => { if (Number.isFinite(v)) g.fillRect(i * bw + bw / 2 - 3, h - 12 - v / kmax * (h - 20), 6, 3); });
  g.fillStyle = '#8696a6'; g.font = '10px monospace'; for (let i = 0; i < 24; i += 3) g.fillText('HE' + (i + 1), i * bw + 2, h - 1);
}
