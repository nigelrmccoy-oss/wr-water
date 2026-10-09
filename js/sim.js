/**
 * wr-water v0.1 process + PLC-ish model. Mass balance per zone storage, per-site pumps with
 * HOA, level-based lead/lag staging, anti-short-cycle timers, chlorine residual, interlocks,
 * Mannheim WTP (Grand River) coag/filtration/turbidity model, energy + chemical cost totals.
 * Every coefficient not in data/facilities.js "sources" is a TRAINING ESTIMATE.
 */
import { DATA } from '../data/facilities.js';
import { clamp, lag, hash01, MONTHS } from './util.js';

const A = DATA.assumptions;
const G = 9.81;
const TREND_N = 24 * 60;          // 24 h at 1-min samples
const TREND_DT = 60;

export class AlarmManager {
  constructor(sim) { this.sim = sim; this.list = new Map(); this.events = []; }
  raise(id, siteId, text, pri = 2) {
    const a = this.list.get(id);
    if (a && a.active) return;
    if (a) { a.active = true; a.acked = false; a.t = this.sim.time.getTime(); a.text = text; a.count++; }
    else this.list.set(id, { id, siteId, text, pri, active: true, acked: false, t: this.sim.time.getTime(), count: 1 });
    this.log(`ALM ${pri === 1 ? 'CRIT' : pri === 2 ? 'HIGH' : 'LOW'} · ${text}`, siteId);
  }
  clear(id) {
    const a = this.list.get(id);
    if (!a || !a.active) return;
    a.active = false; this.log(`RTN · ${a.text}`, a.siteId);
    if (a.acked) this.list.delete(id);
  }
  set(cond, id, siteId, text, pri) { cond ? this.raise(id, siteId, text, pri) : this.clear(id); }
  ack(id) {
    const a = this.list.get(id); if (!a) return;
    a.acked = true; a.ackT = this.sim.time.getTime(); this.log(`ACK · ${a.text}`, a.siteId);
    if (!a.active) this.list.delete(id);
    this.sim.emit('ack', a);
  }
  ackAll(siteId) { for (const a of [...this.list.values()]) if (!a.acked && (!siteId || a.siteId === siteId)) this.ack(a.id); }
  log(text, siteId) { this.events.unshift({ t: this.sim.time.getTime(), text, siteId }); if (this.events.length > 400) this.events.pop(); }
  sorted() { return [...this.list.values()].sort((a, b) => (a.acked - b.acked) || (b.active - a.active) || (a.pri - b.pri) || (b.t - a.t)); }
  unackedCount() { let n = 0; for (const a of this.list.values()) if (!a.acked) n++; return n; }
  forSite(id) { return this.sorted().filter(a => a.siteId === id); }
}

class Trend {
  constructor(keys) { this.keys = keys; this.data = Object.fromEntries(keys.map(k => [k, new Float32Array(TREND_N).fill(NaN)])); this.i = 0; this.n = 0; }
  push(vals) { for (const k of this.keys) this.data[k][this.i] = vals[k] ?? NaN; this.i = (this.i + 1) % TREND_N; this.n = Math.min(this.n + 1, TREND_N); }
  series(k) { const out = []; const d = this.data[k]; for (let j = 0; j < this.n; j++) out.push(d[(this.i - this.n + j + TREND_N) % TREND_N]); return out; }
}

function diurnalRaw(h) {
  // residential + ICI blend: low overnight, AM peak ~07:30, evening peak ~19:30 (shape ESTIMATE)
  const am = Math.exp(-0.5 * ((h - 7.5) / 1.6) ** 2);
  const pm = Math.exp(-0.5 * ((h - 19.5) / 2.2) ** 2);
  const day = Math.exp(-0.5 * ((h - 13) / 3.5) ** 2);
  return 0.55 + 0.75 * am + 0.55 * pm + 0.3 * day;
}
let DIURNAL_NORM = 1;
{ let s = 0; for (let i = 0; i < 1440; i++) s += diurnalRaw(i / 60); DIURNAL_NORM = s / 1440; }
export const diurnal = h => diurnalRaw(h) / DIURNAL_NORM;

export function touPeriod(d) {
  // OEB RPP TOU, summer (May–Oct) / winter (Nov–Apr); weekends off-peak; holidays ignored
  const dow = d.getDay(), h = d.getHours(), m = d.getMonth() + 1;
  if (dow === 0 || dow === 6 || h < 7 || h >= 19) return 'offPeak';
  const summer = m >= 5 && m <= 10;
  const mid = h >= 11 && h < 17;
  if (summer) return mid ? 'onPeak' : 'midPeak';
  return mid ? 'midPeak' : 'onPeak';
}
export function elecRate(d) { const c = A.electricity.commodity; return c[touPeriod(d)] + A.electricity.deliveryAdderPerKwh.value; }

function newTotals() { return { m3: 0, kwh: 0, elec: 0, chem: 0, chemDetail: {} }; }

export class Sim {
  constructor() {
    this.time = new Date(2026, 6, 15, 5, 0, 0); // Wed 15 Jul 2026 05:00 local
    this.listeners = {};
    this.alarms = new AlarmManager(this);
    this.speed = 60; this.paused = false;
    this.zones = new Map(); this.sites = new Map();
    this.towers = DATA.storage;
    this.scenario = null; this.injected = {};
    this.trendAcc = 0;
    this.river = { flow: 12, turbRaw: 6, stormBoost: 0 };
    this.day = this.time.getDate();
    const towersByZone = {};
    for (const t of DATA.storage) if (t.type === 'tower' && !(DATA.zones.find(z => z.id === t.zone).storageName.includes('standpipe'))) towersByZone[t.zone] = (towersByZone[t.zone] || 0) + t.volM3;
    for (const z of DATA.zones) {
      const vol = z.storageM3 + (towersByZone[z.id] || 0);
      this.zones.set(z.id, { cfg: z, id: z.id, volM3: vol, towerEstM3: towersByZone[z.id] || 0, level: 68 + 8 * hash01(z.id), demandLs: 0, inLs: 0, press: 0, demandMult: 1, leakLs: 0,
        today: newTotals(), yday: null, trend: new Trend(['level', 'demand', 'inflow', 'press']) });
    }
    for (const s of DATA.sites) this.sites.set(s.id, this.buildSite(s));
    // seed: run a quiet 6 h warm-up so pumps settle into a plausible state
    const quiet = this.alarms; this.alarms = { raise() {}, clear() {}, set() {}, log() {} };
    const t0 = new Date(this.time); this.time = new Date(t0.getTime() - 6 * 3600e3);
    for (let i = 0; i < 6 * 3600 / 5; i++) this.step(5, true);
    this.alarms = quiet; this.time = t0;
    for (const z of this.zones.values()) { z.today = newTotals(); z.trend = new Trend(z.trend.keys); }
    for (const s of this.sites.values()) { s.today = newTotals(); s.trend = new Trend(s.trend.keys); for (const p of s.allPumps()) p.starts = 0; }
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, x) { for (const fn of this.listeners[ev] || []) fn(x); }

  buildSite(c) {
    const kind = c.kind;
    const avgLs = c.avg2025M3d / 86.4;
    const mdwlLs = c.mdwlM3d / 86.4;
    const standby = c.avg2025M3d <= 0;
    let capLs;
    if (standby) capLs = mdwlLs * 0.6;                         // ESTIMATE for sites with no 2025 production
    else capLs = Math.max(avgLs * 1.25, Math.min(c.peakRawLs2025 || mdwlLs, mdwlLs));
    if (kind === 'surface') capLs = A.iusContext.mannheimWtpAvailLs.peak; // 625 L/s (peer review)
    if (kind === 'asr') capLs = Math.min(c.peakRawLs2025 || mdwlLs, mdwlLs);
    const util = avgLs / Math.max(capLs, 1e-6);
    const r = hash01(c.id);
    const base = util > 0.75;
    const sp = base ? { start: 96 + 2 * r, stop: 99.5 } : { start: 58 + 22 * r, stop: 0 };
    if (!base) sp.stop = Math.min(97, sp.start + 14 + 6 * r);
    const mkPump = (id, role, q, h) => ({ id, role, mode: 'AUTO', state: 'STOP', q: 0, qCap: q, head: h, runSec: 0, offSec: 999, starts: 0, trip: null, kw: 0 });
    const s = {
      cfg: c, id: c.id, kind, zone: c.zone, capLs, util, standbySite: standby,
      sp: { leadStart: sp.start, leadStop: sp.stop, stagger: 4, cwStart: 55, cwStop: 92 },
      wells: [], hl: [], cwLevel: 70, cwVol: c.clearwellM3 || 0,
      cl2: null, uv: c.uv ? { dose: 0, sp: 60, fault: false } : null,
      flowOut: 0, flowIn: 0, kw: 0, interlock: null,
      today: newTotals(), yday: null,
      trend: new Trend(['flow', 'level', 'cl2', 'turb', 'kw']),
    };
    const wellHead = kind === 'wtp' ? A.tdhM.wellToClearwell : kind === 'asr' ? A.tdhM.asr : A.tdhM.wellDirect;
    if (kind === 'surface') {
      s.wells = ['LL-1', 'LL-2'].map(id => mkPump(id, 'lowlift', 420, A.tdhM.mannLowLift));
      s.boosters = ['B-1', 'B-2', 'B-3'].map(id => mkPump(id, 'booster', 315, A.tdhM.mannBooster));
      s.plant = { mode: 'AUTO', flowSp: 497, flow: 480, paclSp: 22, paclReq: 12, polySp: 0.1, ozoneSp: 1.5, settled: 1.0, filtered: 0.08, ftw: false, ftwTimer: 0, okTimer: 0, highTurbTimer: 0 };
      s.cwLevel = 60;
    } else {
      const perWell = capLs * (kind === 'wtp' ? 1.08 : 1.0) / c.dutyMax;
      s.wells = c.wells.map(id => mkPump(id, kind === 'wtp' ? 'well' : 'well', perWell, wellHead));
      if (kind === 'wtp') {
        const n = c.highLiftPumps || 2; const duty = Math.max(1, n - 1);
        s.hl = Array.from({ length: n }, (_, i) => mkPump(`HL-${i + 1}`, 'highlift', capLs * 1.0 / duty, A.tdhM.highLift));
        s.hlDuty = duty;
      }
    }
    if (standby || kind === 'asr') for (const p of [...s.wells, ...s.hl]) p.mode = 'OFF';
    if (standby) s.cwLevel = 85;
    if (kind === 'asr' && c.avg2025M3d > 300) s.wells[0].mode = 'AUTO';
    if (c.chem.includes('naocl') && kind !== 'surface') {
      const demand = c.greensand ? A.chlorineDemandMgL.greensand : A.chlorineDemandMgL.groundwater;
      s.cl2 = { sp: +(demand + 1.45).toFixed(2), demand, duty: 'A', fault: { A: false, B: false }, res: 1.4, nh4: c.chem.includes('nh4'), lolotimer: 0 };
    }
    if (kind === 'surface') s.cl2 = { sp: 3.6, demand: A.chlorineDemandMgL.river, duty: 'A', fault: { A: false, B: false }, res: 1.2, nh4: true, lolotimer: 0 };
    s.allPumps = () => [...s.wells, ...(s.hl || []), ...(s.boosters || [])];
    return s;
  }

  monthFactor() { return DATA.season2025[MONTHS[this.time.getMonth()]] ?? 1; }

  // ---------------- main step ----------------
  step(dt, warm = false) {
    this.time = new Date(this.time.getTime() + dt * 1000);
    const hr = this.time.getHours() + this.time.getMinutes() / 60 + this.time.getSeconds() / 3600;
    if (this.time.getDate() !== this.day) this.rollDay();
    const mf = this.monthFactor();
    const rate = elecRate(this.time);
    this.updateRiver(dt);
    if (this.scenario && !warm) this.scenario.tick?.(this, dt);

    for (const z of this.zones.values()) {
      const noise = 1 + 0.03 * Math.sin(this.time.getTime() / 7.3e5 + hash01(z.id) * 50);
      z.demandLs = z.cfg.avgDemandM3d / 86.4 * mf * diurnal(hr) * noise * z.demandMult + z.leakLs;
      z.inLs = 0;
    }
    for (const s of this.sites.values()) {
      if (s.kind === 'surface') this.stepMannheim(s, dt, rate);
      else this.stepSite(s, dt, rate);
    }
    for (const z of this.zones.values()) {
      const net = (z.inLs - z.demandLs) / 1000 * dt; // m3
      z.level = clamp(z.level + net / z.volM3 * 100, 0, 100);
      if (z.level >= 100 && z.inLs > z.demandLs) this.alarms.raise(`${z.id}:ovf`, null, `${z.cfg.name}: storage OVERFLOW`, 2);
      else if (z.level < 99) this.alarms.clear(`${z.id}:ovf`);
      const c = z.cfg; const loss = 40 * (z.demandLs / Math.max(c.avgDemandM3d / 86.4, 0.01) - 1);
      z.press = c.pMin + (c.pMax - c.pMin) * (z.level / 100) - Math.max(loss, -20) - (z.level < 10 ? (10 - z.level) * 25 : 0);
      z.today.m3 += z.demandLs / 1000 * dt;
      this.alarms.set(z.level < 25, `${z.id}:lvlLo`, null, `${c.name}: storage LOW ${z.level.toFixed(0)}%`, 2);
      this.alarms.set(z.level < 10, `${z.id}:lvlLoLo`, null, `${c.name}: storage LOW-LOW ${z.level.toFixed(0)}%`, 1);
      this.alarms.set(z.press < A.alarmLimits.pressLoKpa, `${z.id}:pLo`, null, `${c.name}: LOW PRESSURE ${z.press.toFixed(0)} kPa`, 1);
    }
    this.trendAcc += dt;
    if (this.trendAcc >= TREND_DT) {
      this.trendAcc -= TREND_DT;
      for (const z of this.zones.values()) z.trend.push({ level: z.level, demand: z.demandLs, inflow: z.inLs, press: z.press });
      for (const s of this.sites.values()) s.trend.push({ flow: s.flowOut, level: s.cwVol ? s.cwLevel : this.zones.get(s.zone).level, cl2: s.cl2 ? s.cl2.res : NaN, turb: s.plant ? s.plant.filtered : NaN, kw: s.kw });
    }
  }

  rollDay() {
    this.day = this.time.getDate();
    for (const x of [...this.zones.values(), ...this.sites.values()]) { x.yday = x.today; x.today = newTotals(); }
    this.alarms.log('Midnight: daily totals rolled over');
  }

  updateRiver(dt) {
    const m = this.time.getMonth() + 1;
    const base = DATA.grandRiverMonthly[m]?.median ?? 14;
    const target = base * (1 + 0.05 * Math.sin(this.time.getTime() / 3.1e7)) + this.river.stormBoost;
    this.river.flow = lag(this.river.flow, target, dt, 3 * 3600);
    const turbT = 2 + 0.35 * Math.pow(Math.max(this.river.flow, 0.5), 1.15); // ESTIMATE rating curve
    this.river.turbRaw = lag(this.river.turbRaw, turbT, dt, 1800);
  }

  // PLC staging on a level: returns desired running count for AUTO pumps
  staging(level, sp, nAvail, wasRunning) {
    let want = 0;
    for (let i = 0; i < nAvail; i++) {
      const st = sp.start - i * sp.stagger, so = sp.stop - i * sp.stagger;
      const running = i < wasRunning;
      if (running ? level < so : level < st) want = i + 1;
    }
    return want;
  }

  runPumps(s, pumps, want, dt, maxRun) {
    // HAND runs regardless (hardwired), OFF/TRIP stop, AUTO pumps follow `want` with 5-min min run/off
    const autos = pumps.filter(p => p.mode === 'AUTO' && !p.trip);
    let runningAuto = autos.filter(p => p.state === 'RUN').length;
    const hand = pumps.filter(p => p.mode === 'HAND' && !p.trip).length;
    want = Math.min(want, Math.max(0, maxRun - hand));
    for (const p of pumps) {
      if (p.trip) { p.state = 'TRIP'; continue; }
      if (p.mode === 'OFF') { p.state = 'STOP'; continue; }
      if (p.mode === 'HAND') { p.state = 'RUN'; continue; }
    }
    // stop extras (longest-running first) once min run satisfied
    if (runningAuto > want) {
      for (const p of autos.filter(p => p.state === 'RUN').sort((a, b) => b.runSec - a.runSec)) {
        if (runningAuto <= want) break;
        if (p.runSec >= 300 || s.interlock) { p.state = 'STOP'; p.runSec = 0; p.offSec = 0; runningAuto--; }
      }
    } else if (runningAuto < want) {
      for (const p of autos.filter(p => p.state !== 'RUN').sort((a, b) => b.offSec - a.offSec)) {
        if (runningAuto >= want) break;
        if (p.offSec >= 300) { p.state = 'RUN'; p.runSec = 0; p.starts++; runningAuto++; }
      }
    }
    for (const p of pumps) {
      if (p.state === 'RUN') { p.runSec += dt; } else { p.offSec += dt; }
    }
  }

  pumpPower(p, q) { // kW
    p.q = q; p.kw = q > 0 ? G * (q / 1000) * p.head / A.pumpWireToWaterEff.value : 0; return p.kw;
  }

  addEnergy(s, kw, dt, rate) {
    const kwh = kw * dt / 3600; s.today.kwh += kwh; s.today.elec += kwh * rate;
    const z = this.zones.get(s.zone); z.today.kwh += kwh; z.today.elec += kwh * rate;
  }
  addChem(s, key, cost) {
    s.today.chem += cost; s.today.chemDetail[key] = (s.today.chemDetail[key] || 0) + cost;
    this.zones.get(s.zone).today.chem += cost;
  }

  chlorinate(s, qLs, dt, extraDemand = 0) {
    const c = s.cl2; if (!c) return;
    const pumpOk = !c.fault[c.duty];
    const dose = pumpOk && qLs > 0 ? c.sp : 0;
    const target = Math.max(0, dose - c.demand - extraDemand);
    c.res = qLs > 0 ? lag(c.res, target, dt, c.tau || 420) : lag(c.res, c.res * 0.97, dt, 3600);
    c.doseNow = dose;
    // chemical use
    const m3 = qLs / 1000 * dt; const ch = A.chemicals;
    if (dose > 0) {
      if (s.kind === 'surface') this.addChem(s, 'Cl₂ gas', dose * m3 / 1000 * ch.cl2gas.pricePerKg);
      else this.addChem(s, 'NaOCl 12%', dose * m3 / 1000 / ch.naocl12.kgClPerL * ch.naocl12.pricePerL);
    }
    if (c.nh4 && qLs > 0) {
      const kgN = Math.max(c.res, 0.5) / ch.ammSulphate20.cl2ToNRatio * m3 / 1000;
      const L = kgN / ch.ammSulphate20.nFraction / 0.2 / ch.ammSulphate20.densityKgL;
      this.addChem(s, '(NH₄)₂SO₄ 20%', L * ch.ammSulphate20.pricePerL);
    }
    const L = A.alarmLimits; const lbl = c.nh4 ? 'total Cl₂' : 'free Cl₂';
    const flowing = qLs > 0.5;
    this.alarms.set(flowing && c.res < L.cl2Lo && c.res >= L.cl2LoLo, `${s.id}:cl2Lo`, s.id, `${s.cfg.name}: ${lbl} LOW ${c.res.toFixed(2)} mg/L`, 2);
    this.alarms.set(flowing && c.res < L.cl2LoLo, `${s.id}:cl2LoLo`, s.id, `${s.cfg.name}: ${lbl} LOW-LOW ${c.res.toFixed(2)} mg/L`, 1);
    this.alarms.set(flowing && c.res > L.cl2Hi, `${s.id}:cl2Hi`, s.id, `${s.cfg.name}: ${lbl} HIGH ${c.res.toFixed(2)} mg/L`, 2);
    this.alarms.set(c.fault[c.duty], `${s.id}:meter`, s.id, `${s.cfg.name}: NaOCl metering pump ${c.duty} FAIL (no flow)`, 2);
    // PLC interlock: Cl2 LOLO for 60 s → shut down supply (AUTO pumps); latched until operator reset
    c.lolotimer = flowing && c.res < L.cl2LoLo ? c.lolotimer + dt : 0;
    if (c.lolotimer > 60 && !s.interlock) { s.interlock = 'Cl₂ LOW-LOW shutdown'; this.alarms.raise(`${s.id}:ilk`, s.id, `${s.cfg.name}: INTERLOCK – ${s.interlock}`, 1); }
  }

  stepSite(s, dt, rate) {
    const z = this.zones.get(s.zone);
    const inj = this.injected[s.id] || {};
    // UV
    if (s.uv) {
      s.uv.dose = s.uv.fault ? 5 : s.uv.sp * (0.95 + 0.05 * Math.sin(this.time.getTime() / 9e5));
      const anyFlow = s.flowOut > 0.5;
      this.alarms.set(anyFlow && s.uv.dose < 40, `${s.id}:uv`, s.id, `${s.cfg.name}: UV dose LOW ${s.uv.dose.toFixed(0)} mJ/cm²`, 1);
      if (anyFlow && s.uv.dose < 40 && !s.interlock) { s.interlock = 'UV dose low shutdown'; this.alarms.raise(`${s.id}:ilk`, s.id, `${s.cfg.name}: INTERLOCK – ${s.interlock}`, 1); }
    }
    let kw = 0;
    if (s.kind === 'wtp') {
      // wells → clearwell (level control), high lift → zone
      let wantW = s.interlock ? 0 : this.staging(s.cwLevel, { start: s.sp.cwStart, stop: s.sp.cwStop, stagger: Math.min(6, 30 / s.cfg.dutyMax) }, s.cfg.dutyMax, s.wells.filter(p => p.mode === 'AUTO' && p.state === 'RUN').length);
      if (s.cwLevel > 98) wantW = 0;
      this.runPumps(s, s.wells, wantW, dt, s.cfg.dutyMax);
      if (s.cwLevel > 99) for (const p of s.wells) if (p.state === 'RUN') { p.state = 'STOP'; } // hardwired HiHi float
      let qIn = 0; for (const p of s.wells) { const q = p.state === 'RUN' ? p.qCap * (inj.wellDerate ?? 1) : 0; qIn += q; kw += this.pumpPower(p, q); }
      const cwLowCut = s.cwLevel < 15 || (s.cwLowLatch && s.cwLevel < 30);
      s.cwLowLatch = cwLowCut;
      this.alarms.set(cwLowCut, `${s.id}:cwLo`, s.id, `${s.cfg.name}: clearwell LOW ${s.cwLevel.toFixed(0)}% – PLC holding high lift`, 2);
      const wantH = s.interlock || cwLowCut ? 0 : this.staging(z.level, { start: s.sp.leadStart, stop: s.sp.leadStop, stagger: s.sp.stagger }, s.hlDuty, s.hl.filter(p => p.mode === 'AUTO' && p.state === 'RUN').length);
      this.runPumps(s, s.hl, wantH, dt, s.hlDuty);
      const lowSuction = s.cwLevel < 5;
      let qOut = 0; for (const p of s.hl) { const q = p.state === 'RUN' && !lowSuction ? p.qCap : 0; qOut += q; kw += this.pumpPower(p, q); }
      this.alarms.set(lowSuction && s.hl.some(p => p.state === 'RUN'), `${s.id}:cwLoLo`, s.id, `${s.cfg.name}: clearwell LOW-LOW – high lift low suction cut-out`, 1);
      this.alarms.set(s.cwLevel > 97, `${s.id}:cwHi`, s.id, `${s.cfg.name}: clearwell HIGH ${s.cwLevel.toFixed(0)}%`, 3);
      s.cwLevel = clamp(s.cwLevel + (qIn - qOut) / 1000 * dt / s.cwVol * 100, 0, 100);
      s.flowIn = qIn; s.flowOut = qOut;
      this.chlorinate(s, qIn > 0 ? qIn : qOut, dt);
      if (s.cfg.aop === 'h2o2_uv' && qIn > 0) this.addChem(s, 'H₂O₂ 50%', 5 * qIn / 1000 * dt / 1000 / 0.5 * A.chemicals.h2o2_50.pricePerKg);
      const proc = (s.cfg.greensand ? A.processKwhPerM3.greensand : 0) + (s.uv ? A.processKwhPerM3.uv : 0) + (s.cfg.aop ? A.processKwhPerM3.aop : 0);
      kw += proc * qIn * 3.6;
    } else {
      // direct-to-distribution wells (and ASR → Mannheim clearwell)
      const lvl = s.kind === 'asr' ? this.sites.get('MWTP').cwLevel : z.level;
      const spx = s.kind === 'asr' ? { start: 45, stop: 75, stagger: 0 } : { start: s.sp.leadStart, stop: s.sp.leadStop, stagger: s.sp.stagger };
      const want = s.interlock ? 0 : this.staging(lvl, spx, s.cfg.dutyMax, s.wells.filter(p => p.mode === 'AUTO' && p.state === 'RUN').length);
      this.runPumps(s, s.wells, want, dt, s.cfg.dutyMax);
      let q = 0; for (const p of s.wells) { const qq = p.state === 'RUN' ? p.qCap * (inj.wellDerate ?? 1) : 0; q += qq; kw += this.pumpPower(p, qq); }
      if (s.uv && s.interlock) q = 0;
      s.flowIn = q; s.flowOut = q;
      this.chlorinate(s, q, dt);
      if (s.uv) kw += A.processKwhPerM3.uv * q * 3.6;
    }
    for (const p of s.allPumps()) this.alarms.set(!!p.trip, `${s.id}:${p.id}:trip`, s.id, `${s.cfg.name}: ${p.id} TRIPPED – ${p.trip}`, 1);
    s.kw = kw; this.addEnergy(s, kw, dt, rate);
    if (s.kind === 'asr') this.sites.get('MWTP').asrIn = (this.sites.get('MWTP').asrIn || 0) + s.flowOut;
    else z.inLs += s.flowOut;
    s.today.m3 += s.flowOut / 1000 * dt;
  }

  stepMannheim(s, dt, rate) {
    const P = s.plant; const z = this.zones.get(s.zone); const L = A.alarmLimits;
    // ASR/RCW recovered water from the previous step's site loop is blended into clearwells
    const asr = s.asrPrev || 0; s.asrPrev = s.asrIn || 0; s.asrIn = 0;
    if (P.mode === 'AUTO') P.flowSp = clamp(497 + 14 * (72 - z.level), 150, A.iusContext.mannheimWtpAvailLs.peak);
    if (s.interlock) P.flowSp = 0;
    const llAvail = s.wells.filter(p => !p.trip && p.mode !== 'OFF');
    const bAvail = s.boosters.filter(p => !p.trip && p.mode !== 'OFF');
    const cap = Math.min(llAvail.length * 420, bAvail.length * 315, A.iusContext.mannheimWtpAvailLs.peak * 1.05);
    const target = Math.min(P.flowSp, cap);
    P.flow = P.flow + clamp(target - P.flow, -1.5 * dt, 1.5 * dt);
    const nLL = P.flow > 1 ? Math.ceil(P.flow / 420) : 0, nB = P.flow > 1 ? Math.ceil(P.flow / 315) : 0;
    this.runPumps(s, s.wells, nLL, dt, 2); this.runPumps(s, s.boosters, nB, dt, 3);
    const llRun = s.wells.filter(p => p.state === 'RUN'), bRun = s.boosters.filter(p => p.state === 'RUN');
    const qPossible = Math.min(llRun.length * 420, bRun.length * 315);
    P.flow = Math.min(P.flow, qPossible);
    let kw = 0;
    for (const p of s.wells) kw += this.pumpPower(p, p.state === 'RUN' ? P.flow / llRun.length : 0);
    for (const p of s.boosters) kw += this.pumpPower(p, p.state === 'RUN' ? P.flow / bRun.length : 0);
    // coagulation / filtration (ESTIMATED jar-test-like response)
    const raw = this.river.turbRaw;
    P.paclReq = 10 + 0.3 * raw;
    const def = Math.max(0, (P.paclReq - P.paclSp) / P.paclReq);
    const loading = (P.flow / A.iusContext.mannheimWtpAvailLs.peak) ** 2;
    const filtT = 0.05 + 0.03 * loading + 2.5 * def ** 1.5 * Math.sqrt(raw / 50) + (this.injected.MWTP?.filterBreak || 0);
    P.settled = lag(P.settled, raw * (0.05 + 0.6 * def), dt, 900);
    P.filtered = P.flow > 1 ? lag(P.filtered, filtT, dt, 900) : P.filtered;
    P.highTurbTimer = P.filtered > L.filterToWasteNtu ? P.highTurbTimer + dt : 0;
    if (!P.ftw && P.highTurbTimer > 120) { P.ftw = true; this.alarms.raise('MWTP:ftw', 'MWTP', 'Mannheim WTP: FILTER-TO-WASTE interlock – filtered turbidity > 1.0 NTU', 1); }
    if (P.ftw) { P.okTimer = P.filtered < L.filteredTurbAlarm ? P.okTimer + dt : 0; if (P.okTimer > 300) { P.ftw = false; P.okTimer = 0; this.alarms.clear('MWTP:ftw'); this.alarms.log('Mannheim WTP: filters returned to service', 'MWTP'); } }
    this.alarms.set(P.filtered > L.filteredTurbAlarm, 'MWTP:turb', 'MWTP', `Mannheim WTP: filtered turbidity HIGH ${P.filtered.toFixed(2)} NTU (>0.3)`, 1);
    this.alarms.set(raw > 50, 'MWTP:raw', 'MWTP', `Grand River raw turbidity HIGH ${raw.toFixed(0)} NTU`, 3);
    this.alarms.set(P.paclSp < P.paclReq * 0.8 && raw > 20, 'MWTP:coag', 'MWTP', `Mannheim WTP: coagulant under-dosed (jar test suggests ≈${P.paclReq.toFixed(0)} mg/L)`, 2);
    const qToCw = P.ftw ? 0 : P.flow;
    // UV + chlorine on filtered water
    s.uv.dose = s.uv.fault ? 5 : s.uv.sp;
    this.chlorinate(s, qToCw, dt, 0.008 * raw);
    // clearwell → Mannheim PS reservoir (transfer, P-control on clearwell level)
    const qTr = clamp(qToCw + asr + 20 * (s.cwLevel - 60), 0, 1000);
    s.cwLevel = clamp(s.cwLevel + (qToCw + asr - qTr) / 1000 * dt / s.cwVol * 100, 0, 100);
    s.flowIn = P.flow; s.flowOut = qTr; s.qToCw = qToCw;
    z.inLs += qTr;
    kw += G * (qTr / 1000) * A.tdhM.mannHighLift / A.pumpWireToWaterEff.value;  // Mannheim PS high lift (lumped)
    kw += A.processKwhPerM3.mannheim * P.flow * 3.6;
    // chemicals (product basis, ESTIMATE)
    const m3 = P.flow / 1000 * dt, ch = A.chemicals;
    this.addChem(s, 'PACl', P.paclSp * m3 / 1000 * ch.pacl.pricePerKg);
    this.addChem(s, 'Polymer', P.polySp * m3 / 1000 * ch.polymer.pricePerKg);
    this.addChem(s, 'LOX (ozone)', P.ozoneSp * m3 / 1000 * ch.lox.kgPerKgO3 * ch.lox.pricePerKg);
    for (const p of s.allPumps()) this.alarms.set(!!p.trip, `${s.id}:${p.id}:trip`, s.id, `${s.cfg.name}: ${p.id} TRIPPED – ${p.trip}`, 1);
    s.kw = kw; this.addEnergy(s, kw, dt, rate);
    s.today.m3 += qTr / 1000 * dt;
  }

  // ---------------- operator commands ----------------
  findPump(siteId, pumpId) { return this.sites.get(siteId)?.allPumps().find(p => p.id === pumpId); }
  setMode(siteId, pumpId, mode) { const p = this.findPump(siteId, pumpId); if (!p) return; p.mode = mode; this.alarms.log(`OPR · ${siteId} ${pumpId} → ${mode}`, siteId); this.emit('cmd', { siteId, pumpId, mode }); }
  tripPump(siteId, pumpId, reason) { const p = this.findPump(siteId, pumpId); if (!p) return; p.trip = reason; p.state = 'TRIP'; p.tripT = this.time.getTime(); this.alarms.log(`EVT · ${siteId} ${pumpId} trip: ${reason}`, siteId); }
  resetPump(siteId, pumpId) {
    const p = this.findPump(siteId, pumpId); if (!p || !p.trip) return 'not tripped';
    if (p.lockoutUntil && this.time.getTime() < p.lockoutUntil) return `motor cooling – reset available at ${new Date(p.lockoutUntil).toTimeString().slice(0, 5)}`;
    p.trip = null; p.state = 'STOP'; p.offSec = 0; this.alarms.log(`OPR · ${siteId} ${pumpId} RESET`, siteId); this.emit('cmd', { siteId, pumpId, reset: true }); return 'ok';
  }
  resetInterlock(siteId) {
    const s = this.sites.get(siteId); if (!s?.interlock) return;
    if (s.uv && s.uv.fault) return 'UV fault still present';
    if (s.cl2 && s.cl2.fault[s.cl2.duty]) return 'duty metering pump still failed – select standby first';
    this.alarms.log(`OPR · ${siteId} interlock RESET (${s.interlock})`, siteId); s.interlock = null; this.alarms.clear(`${siteId}:ilk`);
    if (s.cl2) { s.cl2.lolotimer = 0; } this.emit('cmd', { siteId, ilkReset: true }); return 'ok';
  }
  setSp(siteId, key, val) {
    const s = this.sites.get(siteId);
    if (key in s.sp) s.sp[key] = val;
    else if (key === 'cl2Sp') s.cl2.sp = val;
    else if (key === 'cl2Duty') s.cl2.duty = val;
    else if (s.plant && key in s.plant) { s.plant[key] = val; if (key === 'flowSp') s.plant.mode = 'MAN'; }
    this.alarms.log(`OPR · ${siteId} ${key} = ${typeof val === 'number' ? val.toFixed(2) : val}`, siteId);
    this.emit('cmd', { siteId, key, val });
  }

  totals() {
    const t = newTotals(); let kw = 0, supplyLs = 0, demandLs = 0;
    for (const s of this.sites.values()) { t.m3 += s.today.m3; t.kwh += s.today.kwh; t.elec += s.today.elec; t.chem += s.today.chem; kw += s.kw; }
    for (const z of this.zones.values()) { supplyLs += z.inLs; demandLs += z.demandLs; }
    return { ...t, kw, supplyLs, demandLs };
  }
}
