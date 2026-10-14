/**
 * wr-water v0.3.1 process + PLC-ish model.
 *  - real IUS pressure zones (data/network.js) + inter-zone transfers (pump stations, PRVs, control valves)
 *  - per-site pumps with HOA, level lead/lag staging, anti-short-cycle, chlorination, interlocks
 *  - Mannheim WTP (Grand River): coag/ozone/4 filters with headloss, breakthrough and backwash sequence
 *  - Greenbrook AOP (UV/H2O2) with per-well 1,4-dioxane
 *  - utility power, standby generators (ATS), power-fail restart latch, feeder inrush re-trip
 *  - Ontario electricity: RPP (TOU/tiered), Class B (market + GA), Class A (market + PDF × GA) with ICI peak tracking
 * Every coefficient not traceable to data/*.js "sources"/SRC is a TRAINING ESTIMATE.
 */
import { DATA } from '../data/facilities.js';
import { IUS_ZONES, SITE_ZONE, LINKS, NHB_IUS_TRANSFER_AVG_LS, MANN_FILTERS as MF, DIOXANE as DX } from '../data/network.js';
import * as E from './energy.js';
import { clamp, lag, hash01, MONTHS } from './util.js';

const A = DATA.assumptions;
const G = 9.81;
const TREND_N = 24 * 60;
const TREND_DT = 60;
export const touPeriod = E.touPeriod;
export function elecRate(d) { return E.RPP.tou[E.touPeriod(d)] + E.DELIVERY_ADDER; }

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
  log(text, siteId) { this.events.unshift({ t: this.sim.time.getTime(), text, siteId }); if (this.events.length > 500) this.events.pop(); }
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
  const am = Math.exp(-0.5 * ((h - 7.5) / 1.6) ** 2);
  const pm = Math.exp(-0.5 * ((h - 19.5) / 2.2) ** 2);
  const day = Math.exp(-0.5 * ((h - 13) / 3.5) ** 2);
  return 0.55 + 0.75 * am + 0.55 * pm + 0.3 * day;
}
let DIURNAL_NORM = 1;
{ let s = 0; for (let i = 0; i < 1440; i++) s += diurnalRaw(i / 60); DIURNAL_NORM = s / 1440; }
export const diurnal = h => diurnalRaw(h) / DIURNAL_NORM;

function newTotals() { return { m3: 0, kwh: 0, elec: 0, chem: 0, ga: 0, diesel: 0, chemDetail: {} }; }
const OLD_IUS = new Set(['K4M', 'K5', 'W4', 'CAM']);

/** zone configs for v0.2: real IUS pressure zones + v0.1 township systems */
export function buildZoneConfigs() {
  const iusSites = DATA.sites.filter(s => SITE_ZONE[s.id]);
  const iusProd = iusSites.reduce((a, s) => a + s.avg2025M3d, 0) + NHB_IUS_TRANSFER_AVG_LS * 86.4;
  const sumW = IUS_ZONES.reduce((a, z) => a + z.weight, 0);
  const out = IUS_ZONES.map(z => ({ ...z, ius: true, sites: [], avgDemandM3d: z.weight / sumW * iusProd,
    demandMethod: z.node ? 'Supply node – no customer demand.' : `Share from ${z.weightSrc}; all IUS zone shares scaled so the IUS total = 2025 production of IUS sources (${Math.round(iusProd).toLocaleString('en-CA')} m³/d incl. ≈${NHB_IUS_TRANSFER_AVG_LS} L/s K50 transfer est). Absolute value = ESTIMATE.` }));
  for (const z of DATA.zones) {
    if (OLD_IUS.has(z.id)) continue;
    const c = { ...z, ius: false, muni: z.id === 'NHB' ? 'Wilmot' : 'Townships', sites: [], storageSt: 'real' };
    if (z.id === 'NHB') { c.avgDemandM3d = z.avgDemandM3d - NHB_IUS_TRANSFER_AVG_LS * 86.4; c.demandMethod = `NH3/NH4 + K50 2025 production minus ≈${NHB_IUS_TRANSFER_AVG_LS} L/s average K50 transfer to the IUS (ESTIMATE; transfer cap 87 L/s real – Wilmot Agreement).`; }
    out.push(c);
  }
  // ESTIMATE: typical customer ground elevation below the zone HGL ("service depth", m). Not published; 50–64 m spread by a
  // deterministic hash so zones differ (real Ontario zones are designed for ≈ 275–690 kPa static). Wat 4 pinned at 50 m (main-break tuning).
  for (const z of out) if (z.ius && !z.node) { z.serviceDepthM = z.serviceDepthM ?? (z.id === 'WAT4' ? 50 : Math.round(50 + 14 * hash01(z.id + 'elev'))); z.custElevM = z.hgl - z.serviceDepthM; }
  const byId = Object.fromEntries(out.map(z => [z.id, z]));
  for (const s of DATA.sites) byId[SITE_ZONE[s.id] || s.zone].sites.push(s.id);
  return out;
}
export const ZONE_CFGS = buildZoneConfigs();

export class Sim {
  constructor(opts = {}) {
    this.time = new Date(2026, 6, 14, 5, 0, 0); // Tue 14 Jul 2026 05:00 local (an actual 2026 ICI top-5 day)
    this.listeners = {};
    this.alarms = new AlarmManager(this);
    this.speed = 60; this.paused = false;
    this.zones = new Map(); this.sites = new Map(); this.links = new Map();
    this.towers = DATA.storage;
    this.scenario = null; this.injected = {}; this.feeders = {};
    this.rppPlan = 'TOU';
    this.trendAcc = 0;
    this.river = { flow: 12, turbRaw: 6, stormBoost: 0 };
    this.day = this.time.getDate(); this.month = this.time.getMonth();
    this.peak = { hourAcc: 0, hourKwS: 0, curHour: this.time.getHours(), todayKw: new Array(24).fill(null), confirmed: [], alertHours: [] };
    this.totalsExtra = newTotals();
    for (const z of ZONE_CFGS) {
      const vol = z.storageM3;
      this.zones.set(z.id, { cfg: z, id: z.id, volM3: vol, level: z.closed ? 70 : 66 + 10 * hash01(z.id), demandLs: 0, inLs: 0, outLs: 0, press: 0, minPress: 999, demandMult: 1, leakLs: 0, isoFrac: 0,
        today: newTotals(), yday: null, trend: new Trend(['level', 'demand', 'inflow', 'press']) });
    }
    for (const s of DATA.sites) this.sites.set(s.id, this.buildSite(s));
    for (const c of LINKS) this.links.set(c.id, this.buildLink(c));
    this.classify();
    // warm-up: 8 h quiet so pumps/valves settle
    const quiet = this.alarms; this.alarms = { raise() {}, clear() {}, set() {}, log() {}, list: new Map() };
    const t0 = new Date(this.time); this.time = new Date(t0.getTime() - 8 * 3600e3);
    for (let i = 0; i < 8 * 3600 / 5; i++) this.step(5, true);
    this.alarms = quiet; this.time = t0; this.day = t0.getDate();
    this.resetTotals();
  }
  resetTotals() {
    for (const z of this.zones.values()) { z.today = newTotals(); z.trend = new Trend(z.trend.keys); z.minPress = 999; }
    for (const s of this.sites.values()) { s.today = newTotals(); s.trend = new Trend(s.trend.keys); for (const p of s.allPumps()) p.starts = 0; }
    for (const l of this.links.values()) l.today = newTotals();
    this.totalsExtra = newTotals(); this.totalsSince = this.time.getTime();
    this.peak.todayKw = new Array(24).fill(null); this.peak.hourAcc = 0; this.peak.hourKwS = 0; this.peak.curHour = this.time.getHours();
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, x) { for (const fn of this.listeners[ev] || []) fn(x); }
  zoneOf(siteId) { return SITE_ZONE[siteId] || DATA.sites.find(s => s.id === siteId).zone; }

  mkPower(hasGen) { return { grid: true, gen: hasGen ? { state: 'STANDBY', kw: 0, auto: true, fault: false, t: 0, manual: false } : null, latch: false, lostT: null, retransferT: 0, on: true, genFrac: 1, genKwNow: 0 }; }

  buildSite(c) {
    const kind = c.kind;
    const zone = this.zoneOf(c.id);
    const avgLs = c.avg2025M3d / 86.4;
    const mdwlLs = c.mdwlM3d / 86.4;
    const standby = c.avg2025M3d <= 0;
    let capLs;
    if (standby) capLs = mdwlLs * 0.6;
    else capLs = Math.max(avgLs * 1.25, Math.min(c.peakRawLs2025 || mdwlLs, mdwlLs));
    if (kind === 'surface') capLs = A.iusContext.mannheimWtpAvailLs.peak;
    if (kind === 'asr') capLs = Math.min(c.peakRawLs2025 || mdwlLs, mdwlLs);
    const util = avgLs / Math.max(capLs, 1e-6);
    const r = hash01(c.id);
    const base = util > 0.75;
    const sp = base ? { start: 96 + 2 * r, stop: 99.5 } : { start: 58 + 22 * r, stop: 0 };
    if (!base) sp.stop = Math.min(97, sp.start + 14 + 6 * r);
    const mkPump = (id, role, q, h) => ({ id, role, mode: 'AUTO', state: 'STOP', q: 0, qCap: q, head: h, runSec: 0, offSec: 999, starts: 0, trip: null, kw: 0 });
    const s = {
      cfg: c, id: c.id, kind, zone, capLs, util, standbySite: standby,
      sp: { leadStart: sp.start, leadStop: sp.stop, stagger: 4, cwStart: 55, cwStop: 92 },
      wells: [], hl: [], cwLevel: 70, cwVol: c.clearwellM3 || 0,
      cl2: null, uv: c.uv ? { dose: 0, sp: 60, fault: false } : null,
      flowOut: 0, flowIn: 0, kw: 0, interlock: null,
      today: newTotals(), yday: null, monthKwh: 0,
      trend: new Trend(['flow', 'level', 'cl2', 'turb', 'kw']),
      pw: this.mkPower(!!c.standbyPower),
    };
    const wellHead = kind === 'wtp' ? A.tdhM.wellToClearwell : kind === 'asr' ? A.tdhM.asr : A.tdhM.wellDirect;
    if (kind === 'surface') {
      s.wells = ['LL-1', 'LL-2'].map(id => mkPump(id, 'lowlift', 420, A.tdhM.mannLowLift));
      s.boosters = ['B-1', 'B-2', 'B-3'].map(id => mkPump(id, 'booster', 315, A.tdhM.mannBooster));
      s.plant = { mode: 'AUTO', flowSp: 497, flow: 480, paclSp: 14, paclReq: 13.6, polySp: 0.1, ozoneSp: 1.5, settled: 1.0, filtered: 0.08, ftw: false, ftwTimer: 0, okTimer: 0, highTurbTimer: 0, cap: 625, autoBw: true, bwWater: 0 };
      s.filters = Array.from({ length: MF.n }, (_, i) => ({ id: `F${i + 1}`, media: MF.media[i], state: 'SERVICE', step: -1, stepT: 0, solids: (0.15 + 0.2 * i) * MF.breakVolM3 * 1.5, hl: 0.5, turb: 0.05, q: 0, runH: 20 + 22 * i, ripen: 0, skipFtw: false, washes: 0 }));
      s.cwLevel = 60;
    } else {
      const perWell = capLs * (kind === 'wtp' ? 1.08 : 1.0) / c.dutyMax;
      s.wells = c.wells.map(id => mkPump(id, 'well', perWell, wellHead));
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
    if (c.id === 'GRB') s.aop = { uvKw: DX.uvKwDefault, h2o2: DX.h2o2Default, raw: 30, out: 3, outPred: 3, mult: Object.fromEntries(Object.keys(DX.wellRawUgL).map(k => [k, 1])), overT: 0, maxOut: 0, uvFault: false };
    s.allPumps = () => [...s.wells, ...(s.hl || []), ...(s.boosters || [])];
    return s;
  }

  buildLink(c) {
    const l = { cfg: c, id: c.id, mode: c.normallyClosed ? 'CLOSED' : 'AUTO', sp: c.sp, manQ: 0, I: c.normallyClosed ? 0 : 0.3 * c.cap, q: 0, kw: 0, running: 0, today: newTotals(), monthKwh: 0, isolated: false };
    if (c.kind === 'PS') { l.pumps = Array.from({ length: c.nP }, (_, i) => ({ id: `P${i + 1}`, trip: null })); l.pw = c.site ? null : this.mkPower(false); }
    return l;
  }

  pumpKwAt(q, head) { return G * (q / 1000) * head / A.pumpWireToWaterEff.value; }
  classify() {
    for (const s of this.sites.values()) {
      let kw = 0; for (const p of s.allPumps()) kw += this.pumpKwAt(p.qCap, p.head);
      if (s.kind === 'surface') kw += this.pumpKwAt(625, A.tdhM.mannHighLift) + A.processKwhPerM3.mannheim * 625 * 3.6;
      if (s.aop) kw += DX.uvKwMax;
      s.connKw = kw;
    }
    for (const l of this.links.values()) {
      l.connKw = l.cfg.kind === 'PS' ? this.pumpKwAt(l.cfg.cap, l.cfg.headM) : 0;
      if (l.cfg.site) this.sites.get(l.cfg.site).connKw += l.connKw;
    }
    for (const s of this.sites.values()) {
      s.cls = s.id === 'MWTP' ? 'A' : s.connKw >= E.CLASS_B_MIN_KW ? 'B' : 'RPP';
      if (s.pw.gen) s.pw.gen.kw = Math.round(s.connKw * (s.id === 'MWTP' ? 0.55 : 1.0)); // ESTIMATE generator size
    }
    for (const l of this.links.values()) l.cls = l.cfg.site ? this.sites.get(l.cfg.site).cls : (l.connKw >= E.CLASS_B_MIN_KW ? 'B' : 'RPP');
  }

  monthFactor() { return DATA.season2025[MONTHS[this.time.getMonth()]] ?? 1; }

  // ---------------- main step ----------------
  step(dt, warm = false) {
    this.time = new Date(this.time.getTime() + dt * 1000);
    const hr = this.time.getHours() + this.time.getMinutes() / 60 + this.time.getSeconds() / 3600;
    if (this.time.getDate() !== this.day) this.rollDay();
    const mf = this.monthFactor();
    this.updateRiver(dt);
    if (this.scenario && !warm) this.scenario.tick?.(this, dt);
    this.stepFeeders(dt);

    for (const z of this.zones.values()) {
      const noise = 1 + 0.03 * Math.sin(this.time.getTime() / 7.3e5 + hash01(z.id) * 50);
      z.demandLs = z.cfg.avgDemandM3d / 86.4 * mf * diurnal(hr) * noise * z.demandMult * (1 - z.isoFrac) + z.leakLs;
      z.inLs = 0; z.outLs = 0;
    }
    this.classAKw = 0;
    for (const s of this.sites.values()) {
      this.stepPower(s.pw, dt, s.cfg.name, s.id, s.connKw);
      s.powerOn = s.pw.on; s.genFrac = s.pw.genFrac;
      if (s.kind === 'surface') this.stepMannheim(s, dt);
      else this.stepSite(s, dt);
    }
    for (const l of this.links.values()) this.stepLink(l, dt);
    for (const z of this.zones.values()) this.stepZone(z, dt);
    this.stepPeak(dt, warm);
    this.trendAcc += dt;
    if (this.trendAcc >= TREND_DT) {
      this.trendAcc -= TREND_DT;
      for (const z of this.zones.values()) z.trend.push({ level: z.level, demand: z.demandLs, inflow: z.inLs, press: z.press });
      for (const s of this.sites.values()) s.trend.push({ flow: s.flowOut, level: s.cwVol ? s.cwLevel : this.zones.get(s.zone).level, cl2: s.cl2 ? s.cl2.res : NaN, turb: s.plant ? s.plant.filtered : (s.aop ? s.aop.out / 100 : NaN), kw: s.kw });
    }
  }

  stepZone(z, dt) {
    const c = z.cfg;
    const net = (z.inLs - z.outLs - z.demandLs) / 1000 * dt;
    let vNew = z.level / 100 * z.volM3 + net; z.spillLs = 0; z.unservedLs = 0;
    if (vNew > z.volM3) { z.spillLs = (vNew - z.volM3) / dt * 1000; z.today.spill = (z.today.spill || 0) + (vNew - z.volM3); vNew = z.volM3; } // overflow to drain (mass-balance sink)
    if (vNew < 0) { z.unservedLs = -vNew / dt * 1000; z.today.unserved = (z.today.unserved || 0) - vNew; vNew = 0; }         // demand that could not be met
    z.level = vNew / z.volM3 * 100;
    if (c.node) { z.press = NaN; this.alarms.set(z.level < 20, `${z.id}:lvlLo`, null, `${c.name}: level LOW ${z.level.toFixed(0)}%`, 2); return; }
    if (!c.closed) {
      if (z.level >= 100 && z.inLs > z.demandLs + z.outLs) this.alarms.raise(`${z.id}:ovf`, null, `${c.name}: storage OVERFLOW`, 2);
      else if (z.level < 99) this.alarms.clear(`${z.id}:ovf`);
    }
    const avgLs = Math.max(c.avgDemandM3d / 86.4, 0.01);
    if (c.ius) {
      const range = c.closed ? 20 : 8;
      const hl = 6 * Math.min(4, ((z.demandLs - z.leakLs) / avgLs)) ** 2;
      let h = c.hgl - (100 - z.level) / 100 * range - hl + 4;
      if (z.level < 15) h -= (15 - z.level) * 3;
      h -= z.leakLs / 20; // local hydraulic grade collapse around a large break (ESTIMATE)
      z.press = Math.max(0, G * (h - c.custElevM)); // customer elevation = HGL − serviceDepthM (ESTIMATE)
    } else {
      const loss = 40 * (z.demandLs / avgLs - 1);
      z.press = Math.max(0, c.pMin + (c.pMax - c.pMin) * (z.level / 100) - Math.max(loss, -20) - (z.level < 10 ? (10 - z.level) * 25 : 0));
    }
    z.minPress = Math.min(z.minPress, z.press);
    z.today.m3 += (z.demandLs - z.unservedLs) / 1000 * dt; // delivered to customers (incl. leakage)
    if (!c.closed) {
      this.alarms.set(z.level < 25, `${z.id}:lvlLo`, null, `${c.name}: storage LOW ${z.level.toFixed(0)}%`, 2);
      this.alarms.set(z.level < 10, `${z.id}:lvlLoLo`, null, `${c.name}: storage LOW-LOW ${z.level.toFixed(0)}%`, 1);
    }
    this.alarms.set(z.press < A.alarmLimits.pressLoKpa, `${z.id}:pLo`, null, `${c.name}: LOW PRESSURE ${z.press.toFixed(0)} kPa`, 1);
    this.alarms.set(z.press < 140, `${z.id}:p20`, null, `${c.name}: PRESSURE < 140 kPa (20 psi) – backflow / intrusion risk`, 1);
  }

  rollDay() {
    this.day = this.time.getDate();
    for (const x of [...this.zones.values(), ...this.sites.values(), ...this.links.values()]) { x.yday = x.today; x.today = newTotals(); }
    this.ydayExtra = this.totalsExtra; this.totalsExtra = newTotals();
    if (this.time.getMonth() !== this.month) { this.month = this.time.getMonth(); for (const x of [...this.sites.values(), ...this.links.values()]) x.monthKwh = 0; }
    for (const z of this.zones.values()) z.minPress = 999;
    this.peak.todayKw = new Array(24).fill(null); this.totalsSince = new Date(this.time.getFullYear(), this.time.getMonth(), this.time.getDate()).getTime();
    this.alarms.log('Midnight: daily totals rolled over');
  }

  updateRiver(dt) {
    const m = this.time.getMonth() + 1;
    const base = DATA.grandRiverMonthly[m]?.median ?? 14;
    const target = base * (1 + 0.05 * Math.sin(this.time.getTime() / 3.1e7)) + this.river.stormBoost;
    this.river.flow = lag(this.river.flow, target, dt, 3 * 3600);
    const turbT = 2 + 0.35 * Math.pow(Math.max(this.river.flow, 0.5), 1.15);
    this.river.turbRaw = lag(this.river.turbRaw, turbT, dt, 1800);
  }

  // ---------------- power ----------------
  stepFeeders(dt) {
    for (const f of Object.values(this.feeders)) {
      if (f.downUntil && this.time.getTime() >= f.downUntil) { f.downUntil = null; f.up = true; this.alarms.log(`UTILITY · feeder ${f.name} re-energized`); }
      for (const id of f.sites) { const pw = this.sites.get(id)?.pw ?? this.links.get(id)?.pw; if (pw) pw.grid = f.up; }
    }
  }
  tripFeeder(fid, minutes, why) {
    const f = this.feeders[fid]; if (!f) return; f.up = false; f.downUntil = minutes ? this.time.getTime() + minutes * 60e3 : null; f.trips = (f.trips || 0) + 1;
    this.alarms.log(`UTILITY · feeder ${f.name} TRIPPED (${why})`);
    for (const id of f.sites) { const pw = this.sites.get(id)?.pw ?? this.links.get(id)?.pw; if (pw) pw.grid = false; }
  }
  stepPower(pw, dt, name, id, connKw) {
    const g = pw.gen;
    if (!pw.grid) {
      if (!pw.lostT) { pw.lostT = this.time.getTime(); this.alarms.raise(`${id}:pwr`, id, `${name}: UTILITY POWER FAIL`, 1); if (!g || g.fault) pw.latch = true; }
      if (g) {
        if (g.state === 'STANDBY' || g.state === 'COOLDOWN') { if (g.fault) { g.state = 'FAIL'; } else if (g.auto) { g.state = 'STARTING'; g.t = 0; } }
        if (g.state === 'STARTING') { g.t += dt; if (g.t >= 20) { g.state = 'RUN'; this.alarms.log(`${name}: generator on line – ATS transferred to standby power`, id); } }
        if (g.state === 'FAIL') pw.latch = true;
      }
    } else {
      if (pw.lostT) { pw.lostT = null; this.alarms.clear(`${id}:pwr`); this.alarms.log(`${name}: utility power restored`, id); if (g && g.state === 'RUN' && !g.manual) pw.retransferT = 300; }
      if (g) {
        if (pw.retransferT > 0) { pw.retransferT -= dt; if (pw.retransferT <= 0) { pw.retransferT = 0; if (g.auto && !g.manual) { g.state = 'COOLDOWN'; g.t = 0; this.alarms.log(`${name}: ATS re-transferred to utility; generator cooling down`, id); } } }
        if (g.state === 'STARTING') { g.t += dt; if (g.t >= 20) g.state = 'RUN'; }
        if (g.state === 'COOLDOWN') { g.t += dt; if (g.t >= 300) g.state = 'STANDBY'; }
      }
    }
    pw.genLeft = undefined;
    if (g) this.alarms.set(g.state === 'FAIL', `${id}:gen`, id, `${name}: standby generator FAIL TO START`, 1);
    this.alarms.set(pw.latch, `${id}:pfl`, id, `${name}: power-fail restart latch – operator restart required`, 2);
    if (pw.grid) { pw.on = true; pw.genFrac = 1; pw.genKwNow = g && g.state === 'RUN' ? g.kw : 0; }
    else { pw.on = !!(g && g.state === 'RUN'); pw.genFrac = pw.on ? clamp(g.kw / Math.max(connKw, 1), 0, 1) : 0; pw.genKwNow = pw.on ? g.kw : 0; }
  }
  powerOf(id) { return this.sites.get(id)?.pw ?? this.links.get(id)?.pw; }
  startGen(id) {
    const pw = this.powerOf(id); const g = pw?.gen; if (!g) return 'no standby generator at this site';
    if (g.fault) { g.state = 'FAIL'; return 'generator FAILED to start – reset the generator fault first'; }
    if (g.state === 'RUN' || g.state === 'STARTING') return 'already running';
    g.manual = true; g.state = 'STARTING'; g.t = 0; this.alarms.log(`OPR · ${id} generator START (manual)`, id); this.emit('cmd', { id, gen: 'start' }); return 'ok';
  }
  stopGen(id) {
    const pw = this.powerOf(id); const g = pw?.gen; if (!g) return 'no generator';
    if (!pw.grid) return 'utility power is off – stopping the generator would black out the site';
    g.manual = false; g.state = 'COOLDOWN'; g.t = 0; pw.retransferT = 0; this.alarms.log(`OPR · ${id} generator STOP / retransfer to utility`, id); this.emit('cmd', { id, gen: 'stop' }); return 'ok';
  }
  resetGenFault(id) {
    const g = this.powerOf(id)?.gen; if (!g) return 'no generator'; if (!g.fault && g.state !== 'FAIL') return 'no fault';
    g.fault = false; g.state = 'STANDBY'; this.alarms.log(`OPR · ${id} generator fault RESET`, id); this.emit('cmd', { id, gen: 'reset' }); return 'ok';
  }
  resetPowerLatch(id) {
    const pw = this.powerOf(id); if (!pw) return 'n/a'; if (!pw.latch) return 'no power-fail latch';
    if (!pw.on) return 'site has no power yet – wait for utility restoration (or generator)';
    pw.latch = false; this.alarms.log(`OPR · ${id} power-fail RESTART`, id); this.emit('cmd', { id, restart: true });
    for (const f of Object.values(this.feeders)) if (f.sites.includes(id) && f.up) {
      f.restarts = (f.restarts || []).filter(t => this.time.getTime() - t < 120e3); f.restarts.push(this.time.getTime());
      if (f.inrushLimit && f.restarts.length > f.inrushLimit) { this.tripFeeder(f.id, 10, 'inrush: too many motors restarted at once'); return 'FEEDER RE-TRIPPED on inrush – stagger restarts'; }
    }
    return 'ok';
  }

  // ---------------- energy billing ----------------
  bill(obj, zoneId, kw, dt, pw) {
    const genKw = pw ? Math.min(kw, pw.genLeft ?? pw.genKwNow ?? 0) : 0; if (pw) pw.genLeft = (pw.genLeft ?? pw.genKwNow ?? 0) - genKw; // one generator shared by the site and its pump stations
    const gridKw = Math.max(0, kw - genKw);
    const kwh = gridKw * dt / 3600, dkwh = genKw * dt / 3600;
    const price = E.energyPrice(obj.cls, this.time, obj.monthKwh, this.rppPlan);
    const cost = kwh * price, dcost = dkwh * E.DIESEL_PER_KWH;
    obj.today.kwh += kwh; obj.today.elec += cost; obj.today.diesel += dcost; obj.monthKwh += kwh;
    const z = this.zones.get(zoneId); z.today.kwh += kwh; z.today.elec += cost + dcost;
    if (obj.cls === 'A') this.classAKw += gridKw;
    obj.gridKw = gridKw;
  }
  addChem(s, key, cost) {
    s.today.chem += cost; s.today.chemDetail[key] = (s.today.chemDetail[key] || 0) + cost;
    this.zones.get(s.zone).today.chem += cost;
  }
  stepPeak(dt, warm) {
    // Class A GA accrual (PDF × monthly GA) – booked to Mannheim
    const ga = E.classAGaPerSec(this.time) * dt; const m = this.sites.get('MWTP'); m.today.ga += ga; this.zones.get('MANNR').today.elec += ga;
    const h = this.time.getHours();
    if (h !== this.peak.curHour) {
      const prevH = this.peak.curHour; const avgKw = this.peak.hourAcc > 0 ? this.peak.hourKwS / this.peak.hourAcc : 0;
      const d = new Date(this.time.getTime() - 60e3);
      if (!warm) {
        this.peak.todayKw[prevH] = avgKw;
        const he = prevH + 1, day = E.ymd(d);
        if (E.TOP5_2026.some(p => p.date === day && p.he === he)) this.peak.confirmed.push({ day, he, kw: avgKw });
        const pa = E.peakAlert(d); if (pa.alert && he >= pa.window[0] && he <= pa.window[1]) this.peak.alertHours.push({ day, he, kw: avgKw });
      }
      this.peak.curHour = h; this.peak.hourAcc = 0; this.peak.hourKwS = 0;
    }
    this.peak.hourAcc += dt; this.peak.hourKwS += this.classAKw * dt;
    if (!warm) {
      const pa = E.peakAlert(this.time); const he = h + 1;
      this.peakNow = pa;
      this.alarms.set(pa.alert && h >= 9 && he <= pa.window[1], 'IESO:peak', null, `IESO ICI peak alert: Ontario demand forecast ${Math.round(pa.mw).toLocaleString('en-CA')} MW (HE${pa.he}) may set a top-5 peak – minimise Class A load HE${pa.window[0]}–HE${pa.window[1]}`, 3);
    }
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
    if (s.powerOn === false) { for (const p of pumps) { if (p.state === 'RUN') { p.runSec = 0; p.offSec = 0; } p.state = p.trip ? 'TRIP' : 'STOP'; p.offSec += dt; } return; }
    if (s.interlock) { for (const p of pumps) { if (p.state === 'RUN') { p.runSec = 0; p.offSec = 0; } p.state = p.trip ? 'TRIP' : 'STOP'; p.offSec += dt; } return; } // PLC interlock stops HAND pumps too
    if (s.genFrac < 1) maxRun = Math.max(1, Math.floor(maxRun * s.genFrac + 1e-6));
    if (s.pw?.latch) want = 0;
    const autos = pumps.filter(p => p.mode === 'AUTO' && !p.trip);
    let runningAuto = autos.filter(p => p.state === 'RUN').length;
    const hand = pumps.filter(p => p.mode === 'HAND' && !p.trip).length;
    want = Math.min(want, Math.max(0, maxRun - hand));
    for (const p of pumps) {
      if (p.trip) { p.state = 'TRIP'; continue; }
      if (p.mode === 'OFF') { p.state = 'STOP'; continue; }
      if (p.mode === 'HAND') { p.state = 'RUN'; continue; }
    }
    if (runningAuto > want) {
      for (const p of autos.filter(p => p.state === 'RUN').sort((a, b) => b.runSec - a.runSec)) {
        if (runningAuto <= want) break;
        if (p.runSec >= 300 || s.interlock || s.genFrac < 1) { p.state = 'STOP'; p.runSec = 0; p.offSec = 0; runningAuto--; }
      }
    } else if (runningAuto < want) {
      for (const p of autos.filter(p => p.state !== 'RUN').sort((a, b) => b.offSec - a.offSec)) {
        if (runningAuto >= want) break;
        if (p.offSec >= 300) { p.state = 'RUN'; p.runSec = 0; p.starts++; runningAuto++; }
      }
    }
    for (const p of pumps) { if (p.state === 'RUN') p.runSec += dt; else p.offSec += dt; }
  }

  pumpPower(p, q) { p.q = q; p.kw = q > 0 ? G * (q / 1000) * p.head / A.pumpWireToWaterEff.value : 0; return p.kw; }

  chlorinate(s, qLs, dt, extraDemand = 0) {
    const c = s.cl2; if (!c) return;
    const pumpOk = !c.fault[c.duty] && s.powerOn !== false;
    const dose = pumpOk && qLs > 0 ? c.sp : 0;
    const target = Math.max(0, dose - c.demand - extraDemand);
    c.res = qLs > 0 ? lag(c.res, target, dt, c.tau || 420) : lag(c.res, c.res * 0.97, dt, 3600);
    c.doseNow = dose;
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
    c.lolotimer = flowing && c.res < L.cl2LoLo ? c.lolotimer + dt : 0;
    if (c.lolotimer > 60 && !s.interlock) { s.interlock = 'Cl₂ LOW-LOW shutdown'; this.alarms.raise(`${s.id}:ilk`, s.id, `${s.cfg.name}: INTERLOCK – ${s.interlock}`, 1); }
  }

  stepAop(s, qIn, dt) {
    const a = s.aop; let num = 0, den = 0;
    for (const p of s.wells) { if (p.q > 0) { const c0 = (DX.wellRawUgL[p.id] ?? 20) * (a.mult[p.id] ?? 1); num += p.q * c0; den += p.q; } }
    a.raw = den > 0 ? num / den : a.raw;
    const m3h = qIn * 3.6;
    const uvOn = s.powerOn !== false && !a.uvFault && qIn > 0;
    const kwUv = uvOn ? a.uvKw : 0;
    const eeo = DX.eeoKwhPerM3Order * DX.scavengerFactor * (1 + DX.h2o2HalfSatMgL / Math.max(a.h2o2, 0.05));
    a.orders = m3h > 0 && kwUv > 0 && a.h2o2 > 0 ? (kwUv / m3h) / eeo : 0;
    a.outPred = a.raw * Math.pow(10, -a.orders);
    if (qIn > 0) a.out = lag(a.out, a.outPred, dt, 600);
    a.maxOut = Math.max(a.maxOut, a.out);
    if (qIn > 0) this.addChem(s, 'H₂O₂ 50%', a.h2o2 * qIn / 1000 * dt / 1000 / 0.5 * A.chemicals.h2o2_50.pricePerKg);
    this.alarms.set(qIn > 0 && a.out > DX.opTargetUgL && a.out <= DX.macUgL, `${s.id}:dioxHi`, s.id, `${s.cfg.name}: AOP effluent 1,4-dioxane HIGH ${a.out.toFixed(1)} µg/L (> ${DX.opTargetUgL} op. limit)`, 2);
    this.alarms.set(qIn > 0 && a.out > DX.macUgL, `${s.id}:dioxMac`, s.id, `${s.cfg.name}: AOP effluent 1,4-dioxane ${a.out.toFixed(1)} µg/L > MAC ${DX.macUgL} µg/L`, 1);
    this.alarms.set(a.raw > 120, `${s.id}:dioxRaw`, s.id, `${s.cfg.name}: blended raw 1,4-dioxane ${a.raw.toFixed(0)} µg/L rising`, 3);
    a.overT = qIn > 0 && a.out > DX.macUgL ? a.overT + dt : 0;
    if (a.overT > 120 && !s.interlock) { s.interlock = '1,4-dioxane > MAC – plant to waste/shutdown'; this.alarms.raise(`${s.id}:ilk`, s.id, `${s.cfg.name}: INTERLOCK – ${s.interlock}`, 1); }
    return kwUv;
  }

  stepSite(s, dt) {
    const z = this.zones.get(s.zone);
    const inj = this.injected[s.id] || {};
    if (s.uv) {
      s.uv.dose = s.uv.fault || s.powerOn === false ? 5 : s.uv.sp * (0.95 + 0.05 * Math.sin(this.time.getTime() / 9e5));
      const anyFlow = s.flowOut > 0.5;
      this.alarms.set(anyFlow && s.uv.dose < 40, `${s.id}:uv`, s.id, `${s.cfg.name}: UV dose LOW ${s.uv.dose.toFixed(0)} mJ/cm²`, 1);
      if (anyFlow && s.uv.dose < 40 && !s.interlock && s.powerOn !== false) { s.interlock = 'UV dose low shutdown'; this.alarms.raise(`${s.id}:ilk`, s.id, `${s.cfg.name}: INTERLOCK – ${s.interlock}`, 1); }
    }
    let kw = 0;
    if (s.kind === 'wtp') {
      let wantW = s.interlock ? 0 : this.staging(s.cwLevel, { start: s.sp.cwStart, stop: s.sp.cwStop, stagger: Math.min(6, 30 / s.cfg.dutyMax) }, s.cfg.dutyMax, s.wells.filter(p => p.mode === 'AUTO' && p.state === 'RUN').length);
      if (s.cwLevel > 98) wantW = 0;
      this.runPumps(s, s.wells, wantW, dt, s.cfg.dutyMax);
      if (s.cwLevel > 99) for (const p of s.wells) if (p.state === 'RUN') p.state = 'STOP';
      let qIn = 0; for (const p of s.wells) { const q = p.state === 'RUN' ? p.qCap * (inj.wellDerate ?? 1) : 0; qIn += q; kw += this.pumpPower(p, q); }
      const cwLowCut = s.cwLevel < 15 || (s.cwLowLatch && s.cwLevel < 30);
      s.cwLowLatch = cwLowCut;
      this.alarms.set(cwLowCut, `${s.id}:cwLo`, s.id, `${s.cfg.name}: clearwell LOW ${s.cwLevel.toFixed(0)}% – PLC holding high lift`, 2);
      const wantH = s.interlock || cwLowCut ? 0 : this.staging(z.level, { start: s.sp.leadStart, stop: s.sp.leadStop, stagger: s.sp.stagger }, s.hlDuty, s.hl.filter(p => p.mode === 'AUTO' && p.state === 'RUN').length);
      this.runPumps(s, s.hl, wantH, dt, s.hlDuty);
      if (!z.cfg.closed && !z.cfg.node && z.level >= 99.5) for (const p of s.hl) if (p.state === 'RUN') p.state = 'STOP'; // high float
      const lowSuction = s.cwLevel < 5;
      let qOut = 0; for (const p of s.hl) { const q = p.state === 'RUN' && !lowSuction ? p.qCap : 0; qOut += q; kw += this.pumpPower(p, q); }
      this.alarms.set(lowSuction && s.hl.some(p => p.state === 'RUN'), `${s.id}:cwLoLo`, s.id, `${s.cfg.name}: clearwell LOW-LOW – high lift low suction cut-out`, 1);
      this.alarms.set(s.cwLevel > 97, `${s.id}:cwHi`, s.id, `${s.cfg.name}: clearwell HIGH ${s.cwLevel.toFixed(0)}%`, 3);
      const cwAvail = qIn + s.cwLevel / 100 * s.cwVol / dt * 1000; if (qOut > cwAvail) qOut = cwAvail;
      let cwNew = s.cwLevel / 100 * s.cwVol + (qIn - qOut) / 1000 * dt; s.cwSpill = 0;
      if (cwNew > s.cwVol) { s.cwSpill = (cwNew - s.cwVol) / dt * 1000; cwNew = s.cwVol; } // clearwell overflow (mass-balance sink)
      s.cwLevel = cwNew / s.cwVol * 100;
      s.flowIn = qIn; s.flowOut = qOut;
      this.chlorinate(s, qIn > 0 ? qIn : qOut, dt);
      if (s.aop) kw += this.stepAop(s, qIn, dt);
      else if (s.cfg.aop === 'h2o2_uv' && qIn > 0) this.addChem(s, 'H₂O₂ 50%', 5 * qIn / 1000 * dt / 1000 / 0.5 * A.chemicals.h2o2_50.pricePerKg);
      const proc = (s.cfg.greensand ? A.processKwhPerM3.greensand : 0) + (s.uv ? A.processKwhPerM3.uv : 0) + (s.cfg.aop && !s.aop ? A.processKwhPerM3.aop : 0);
      kw += proc * qIn * 3.6;
    } else {
      const lvl = s.kind === 'asr' ? this.sites.get('MWTP').cwLevel : z.level;
      const spx = s.kind === 'asr' ? { start: 45, stop: 75, stagger: 0 } : { start: s.sp.leadStart, stop: s.sp.leadStop, stagger: s.sp.stagger };
      const want = s.interlock ? 0 : this.staging(lvl, spx, s.cfg.dutyMax, s.wells.filter(p => p.mode === 'AUTO' && p.state === 'RUN').length);
      this.runPumps(s, s.wells, want, dt, s.cfg.dutyMax);
      if (s.kind !== 'asr' && !z.cfg.closed && z.level >= 99.5) for (const p of s.wells) if (p.state === 'RUN') p.state = 'STOP'; // hardwired reservoir high float
      let q = 0; for (const p of s.wells) { const qq = p.state === 'RUN' ? p.qCap * (inj.wellDerate ?? 1) : 0; q += qq; kw += this.pumpPower(p, qq); }
      if (s.uv && s.interlock) q = 0;
      s.flowIn = q; s.flowOut = q;
      this.chlorinate(s, q, dt);
      if (s.uv) kw += A.processKwhPerM3.uv * q * 3.6;
    }
    for (const p of s.allPumps()) this.alarms.set(!!p.trip, `${s.id}:${p.id}:trip`, s.id, `${s.cfg.name}: ${p.id} TRIPPED – ${p.trip}`, 1);
    s.kw = kw; this.bill(s, s.zone, kw, dt, s.pw);
    if (s.kind === 'asr') this.sites.get('MWTP').asrIn = (this.sites.get('MWTP').asrIn || 0) + s.flowOut;
    else z.inLs += s.flowOut;
    s.today.m3 += s.flowOut / 1000 * dt;
  }

  // ---------------- Mannheim WTP ----------------
  stepFilters(s, dt) {
    const P = s.plant; const F = s.filters; const minute = 60;
    // backwash sequence
    for (const f of F) {
      if (f.state !== 'WASH') continue;
      f.stepT += dt;
      const [name, mins] = MF.steps[f.step];
      if (name === 'BACKWASH') P.bwWater += MF.bwRateLs * dt / 1000;
      const skip = name === 'FILTER-TO-WASTE' && f.skipFtw;
      if (f.stepT >= mins * minute || skip) {
        f.step++; f.stepT = 0;
        if (f.step >= MF.steps.length || (skip && f.step >= MF.steps.length - 1)) {
          f.state = 'SERVICE'; f.step = -1; f.solids = 0; f.runH = 0; f.washes++; f.btScale = 1;
          f.ripen = f.skipFtw ? 0.9 : 0.04; f.skipFtw = false; f.hl = 0.35;
          this.alarms.log(`Mannheim WTP: ${f.id} back in service${f.ripen > 0.5 ? ' WITHOUT filter-to-waste (ripening spike!)' : ''}`, 'MWTP');
          this.emit('bwDone', f);
        }
      }
    }
    const inSvc = F.filter(f => f.state === 'SERVICE');
    const ftwF = F.filter(f => f.state === 'WASH' && MF.steps[f.step][0] === 'FILTER-TO-WASTE');
    P.nService = inSvc.length;
    // auto-initiate (PLC) – one filter at a time
    if (P.autoBw && !F.some(f => f.state === 'WASH')) {
      const due = inSvc.find(f => f.hl >= MF.termHeadlossM || f.turb > 0.2 || f.runH > 96);
      if (due && inSvc.length > 2) this.startBackwash('MWTP', due.id, 'PLC auto');
    }
    return { inSvc, ftwF };
  }
  startBackwash(siteId, fid, who = 'OPR') {
    const s = this.sites.get('MWTP'); const f = s.filters.find(x => x.id === fid); if (!f) return 'no such filter';
    if (f.state === 'WASH') return 'already washing';
    if (s.filters.some(x => x.state === 'WASH')) return 'interlock: another filter is already in a backwash sequence (one at a time – backwash supply & waste capacity)';
    if (s.filters.filter(x => x.state === 'SERVICE').length <= 2) return 'interlock: minimum 2 filters must stay in service';
    f.state = 'WASH'; f.step = 0; f.stepT = 0;
    this.alarms.log(`${who === 'OPR' ? 'OPR · ' : 'PLC · '}Mannheim WTP ${fid} backwash START (${who})`, 'MWTP'); this.emit('cmd', { siteId: 'MWTP', bw: fid }); return 'ok';
  }
  skipFtw(fid) { const f = this.sites.get('MWTP').filters.find(x => x.id === fid); if (!f || f.state !== 'WASH') return 'not washing'; f.skipFtw = true; this.alarms.log(`OPR · Mannheim WTP ${fid} filter-to-waste BYPASSED`, 'MWTP'); return 'ok'; }
  setFilterSvc(fid, on) { const f = this.sites.get('MWTP').filters.find(x => x.id === fid); if (!f || f.state === 'WASH') return 'busy'; f.state = on ? 'SERVICE' : 'OFFLINE'; this.alarms.log(`OPR · Mannheim WTP ${fid} ${on ? 'IN SERVICE' : 'OUT OF SERVICE'}`, 'MWTP'); return 'ok'; }

  stepMannheim(s, dt) {
    const P = s.plant; const z = this.zones.get(s.zone); const L = A.alarmLimits;
    const asr = s.asrPrev || 0; s.asrPrev = s.asrIn || 0; s.asrIn = 0;
    const { inSvc, ftwF } = this.stepFilters(s, dt);
    if (P.mode === 'AUTO') P.flowSp = clamp(497 + 14 * (72 - z.level), 150, A.iusContext.mannheimWtpAvailLs.peak);
    if (s.interlock) P.flowSp = 0;
    const llAvail = s.wells.filter(p => !p.trip && p.mode !== 'OFF');
    const bAvail = s.boosters.filter(p => !p.trip && p.mode !== 'OFF');
    const filtCap = [...inSvc, ...ftwF].reduce((a, f) => a + MF.capLsEach * (f.hl >= MF.termHeadlossM ? 0.5 : 1), 0); // declining-rate at terminal headloss (est)
    P.cap = Math.min(llAvail.length * 420, bAvail.length * 315, A.iusContext.mannheimWtpAvailLs.peak * 1.05, filtCap) * (s.powerOn === false ? 0 : s.genFrac);
    const target = Math.min(P.flowSp, P.cap);
    P.flow = P.flow + clamp(target - P.flow, -1.5 * dt, 1.5 * dt);
    if (s.powerOn === false) P.flow = 0;
    const nLL = P.flow > 1 ? Math.ceil(P.flow / 420) : 0, nB = P.flow > 1 ? Math.ceil(P.flow / 315) : 0;
    this.runPumps(s, s.wells, nLL, dt, 2); this.runPumps(s, s.boosters, nB, dt, 3);
    const llRun = s.wells.filter(p => p.state === 'RUN'), bRun = s.boosters.filter(p => p.state === 'RUN');
    const qPossible = Math.min(llRun.length * 420, bRun.length * 315);
    P.flow = Math.min(P.flow, qPossible);
    let kw = 0;
    for (const p of s.wells) kw += this.pumpPower(p, p.state === 'RUN' ? P.flow / llRun.length : 0);
    for (const p of s.boosters) kw += this.pumpPower(p, p.state === 'RUN' ? P.flow / bRun.length : 0);
    const raw = this.river.turbRaw;
    // v0.3.1: the displayed jar-test value IS the optimum dose (1.15 × the bare charge-neutralisation demand), so dosing
    // exactly at the jar test is correct; under-dose below it, overdose above ≈1.6× it (ESTIMATE)
    P.paclReq = 1.15 * (10 + 0.3 * raw);
    const def = Math.max(0, (P.paclReq - P.paclSp) / P.paclReq);
    const nF = inSvc.length + ftwF.length;
    P.settled = lag(P.settled, raw * (0.05 + 0.6 * def + 0.25 * Math.min(Math.max(0, P.paclSp / P.paclReq - 1.6), 2)), dt, 900);
    // per-filter hydraulics + quality (ESTIMATE)
    const qf = nF > 0 ? P.flow / nF : 0;
    const loadF = (qf / MF.capLsEach) ** 2;
    const over = Math.max(0, P.paclSp / P.paclReq - 1.6); // overdose → charge reversal / restabilisation (ESTIMATE)
    P.doseState = def > 0.05 ? 'UNDER' : over > 0 ? 'OVER' : 'OK';
    const coagTerm = 2.5 * def ** 1.5 * Math.sqrt(raw / 50) + 0.35 * Math.min(over, 2) ** 1.3 * Math.sqrt(raw / 20) + (this.injected.MWTP?.filterBreak || 0);
    const Sbt = MF.breakVolM3 * 1.5, Sterm = Sbt * 1.25;
    let num = 0, den = 0;
    for (const f of s.filters) {
      if (f.state === 'SERVICE' || (f.state === 'WASH' && MF.steps[f.step][0] === 'FILTER-TO-WASTE')) {
        f.q = qf; f.solids += qf / 1000 * dt * (0.5 + 3 * P.settled); // floc load on the filter rises with settled turbidity (ESTIMATE) f.runH += dt / 3600;
      } else f.q = 0;
      f.hl = 0.35 + (MF.termHeadlossM - 0.35) * Math.min(1.3, f.solids / Sterm) * (0.6 + 0.4 * Math.sqrt(loadF + 0.01));
      const Sb = Sbt * (f.btScale || 1); // btScale: per-filter breakthrough capacity (scenario use; deep GAC beds hold more)
      const bt = f.solids > Sb ? 0.6 * (Math.exp((f.solids - Sb) / (0.12 * Sbt)) - 1) : 0;
      f.ripen = lag(f.ripen, 0, dt, 900);
      const carry = 0.06 * P.settled * loadF; // floc carry-over through the filter rises with settled NTU and filter loading (ESTIMATE)
      f.turb = lag(f.turb, Math.min(3, 0.04 + 0.03 * loadF + carry + bt + f.ripen + coagTerm), dt, 300);
      if (f.state === 'SERVICE') { num += f.q * f.turb; den += f.q; }
      this.alarms.set(f.state === 'SERVICE' && f.hl >= MF.termHeadlossM, `MWTP:${f.id}:hl`, 'MWTP', `Mannheim WTP ${f.id}: TERMINAL HEADLOSS ${f.hl.toFixed(2)} m – backwash required`, 2);
      this.alarms.set(f.state === 'SERVICE' && f.turb > 0.2, `MWTP:${f.id}:turb`, 'MWTP', `Mannheim WTP ${f.id}: effluent turbidity ${f.turb.toFixed(2)} NTU (breakthrough)`, 2);
    }
    const filtT = den > 0 ? num / den : P.filtered;
    P.filtered = P.flow > 1 ? filtT : P.filtered;
    P.highTurbTimer = P.filtered > L.filterToWasteNtu ? P.highTurbTimer + dt : 0;
    if (!P.ftw && P.highTurbTimer > 120) { P.ftw = true; this.alarms.raise('MWTP:ftw', 'MWTP', 'Mannheim WTP: FILTER-TO-WASTE interlock – filtered turbidity > 1.0 NTU', 1); }
    if (P.ftw) { P.okTimer = P.filtered < L.filteredTurbAlarm ? P.okTimer + dt : 0; if (P.okTimer > 300) { P.ftw = false; P.okTimer = 0; this.alarms.clear('MWTP:ftw'); this.alarms.log('Mannheim WTP: filters returned to service', 'MWTP'); } }
    this.alarms.set(P.filtered > L.filteredTurbAlarm, 'MWTP:turb', 'MWTP', `Mannheim WTP: combined filtered turbidity HIGH ${P.filtered.toFixed(2)} NTU (>0.3)`, 1);
    this.alarms.set(raw > 50, 'MWTP:raw', 'MWTP', `Grand River raw turbidity HIGH ${raw.toFixed(0)} NTU`, 3);
    this.alarms.set(P.doseState === 'OVER' && raw > 5, 'MWTP:coagOver', 'MWTP', `Mannheim WTP: coagulant OVERDOSED (${P.paclSp.toFixed(0)} vs jar test ≈${P.paclReq.toFixed(0)} mg/L) – restabilisation risk`, 2);
    this.alarms.set(P.paclSp < P.paclReq * 0.8 && raw > 20, 'MWTP:coag', 'MWTP', `Mannheim WTP: coagulant under-dosed (jar test suggests ≈${P.paclReq.toFixed(0)} mg/L)`, 2);
    this.alarms.set(P.flowSp > P.cap + 5 && P.cap > 0, 'MWTP:cap', 'MWTP', `Mannheim WTP: capacity limited to ${P.cap.toFixed(0)} L/s (${inSvc.length} filters in service${s.genFrac < 1 ? ', on generator' : ''})`, 3);
    const ftwQ = ftwF.reduce((a, f) => a + f.q, 0);
    const qToCw = P.ftw ? 0 : Math.max(0, P.flow - ftwQ);
    s.uv.dose = s.uv.fault || s.powerOn === false ? 5 : s.uv.sp;
    this.chlorinate(s, qToCw, dt, 0.008 * raw);
    const bwDraw = s.filters.some(f => f.state === 'WASH' && MF.steps[f.step][0] === 'BACKWASH') ? MF.bwRateLs : 0;
    const cwAvail = qToCw + asr - bwDraw + s.cwLevel / 100 * s.cwVol / dt * 1000;
    const qTr = s.powerOn === false ? 0 : clamp(Math.min(qToCw + asr + 20 * (s.cwLevel - 60), cwAvail), 0, 1000);
    let cwNew = s.cwLevel / 100 * s.cwVol + (qToCw + asr - qTr - bwDraw) / 1000 * dt; s.cwSpill = 0;
    if (cwNew > s.cwVol) { s.cwSpill = (cwNew - s.cwVol) / dt * 1000; cwNew = s.cwVol; }
    if (cwNew < 0) cwNew = 0; // (only if backwash draw exceeds stored water – negligible)
    s.cwLevel = cwNew / s.cwVol * 100;
    s.flowIn = P.flow; s.flowOut = qTr; s.qToCw = qToCw; s.wasteLs = (P.flow - qToCw) + bwDraw; // FTW / interlock-to-waste + backwash water
    z.inLs += qTr;
    kw += G * (qTr / 1000) * 15 / A.pumpWireToWaterEff.value; // clearwell transfer to Mannheim reservoir (est 15 m)
    kw += A.processKwhPerM3.mannheim * P.flow * 3.6 + G * bwDraw / 1000 * 12 / A.pumpWireToWaterEff.value;
    const m3 = P.flow / 1000 * dt, ch = A.chemicals;
    this.addChem(s, 'PACl', P.paclSp * m3 / 1000 * ch.pacl.pricePerKg);
    this.addChem(s, 'Polymer', P.polySp * m3 / 1000 * ch.polymer.pricePerKg);
    this.addChem(s, 'LOX (ozone)', P.ozoneSp * m3 / 1000 * ch.lox.kgPerKgO3 * ch.lox.pricePerKg);
    for (const p of s.allPumps()) this.alarms.set(!!p.trip, `${s.id}:${p.id}:trip`, s.id, `${s.cfg.name}: ${p.id} TRIPPED – ${p.trip}`, 1);
    s.kw = kw; this.bill(s, s.zone, kw, dt, s.pw);
    s.today.m3 += qTr / 1000 * dt;
  }

  // ---------------- transfers ----------------
  stepLink(l, dt) {
    const c = l.cfg; const up = this.zones.get(c.from), dn = this.zones.get(c.to);
    let avail = c.cap;
    let pw = null;
    if (c.kind === 'PS') {
      pw = c.site ? this.sites.get(c.site).pw : l.pw;
      if (!c.site) this.stepPower(pw, dt, c.name, l.id, l.connKw);
      const nOk = l.pumps.filter(p => !p.trip).length;
      avail = c.cap * nOk / c.nP;
      if (!pw.on || pw.latch) avail = 0; else if (pw.genFrac < 1) avail *= Math.max(pw.genFrac, 1 / c.nP);
      for (const p of l.pumps) this.alarms.set(!!p.trip, `${l.id}:${p.id}:trip`, l.id, `${c.name}: ${p.id} TRIPPED – ${p.trip}`, 1);
    }
    if (up.level < 8) avail *= Math.max(0, up.level / 8);
    if (l.capFrac != null) avail *= l.capFrac; // partial isolation / parallel route (scenario use)
    if (l.isolated) avail = 0;
    if (!dn.cfg.node && !dn.cfg.closed && dn.level >= 98.5) avail = 0; // altitude valve / high-level PS cut-out (est)
    let q;
    if (l.mode === 'CLOSED') { q = 0; l.I = 0; }
    else if (l.mode === 'MAN') q = Math.min(l.manQ, avail);
    else {
      const up2 = c.ctl === 'up'; const cz = up2 ? up : dn;
      const e = up2 ? (up.level - l.sp) : (l.sp - dn.level);
      const kp = cz.volM3 / 180, ki = kp / 2400;
      l.I = clamp(l.I + ki * e * dt, 0, avail);
      q = clamp(l.I + kp * e, 0, avail);
    }
    l.q = Math.min(avail, l.q + clamp(q - l.q, -4 * dt, 4 * dt));
    if (l.q < 0.01) l.q = 0;
    up.outLs += l.q; dn.inLs += l.q;
    l.today.m3 += l.q / 1000 * dt;
    if (c.kind === 'PS') {
      const per = c.cap / c.nP; l.running = l.q > 0.5 ? Math.min(c.nP, Math.ceil(l.q / per)) : 0;
      l.kw = l.q > 0 ? this.pumpKwAt(l.q, c.headM) : 0;
      this.bill(l, c.to, l.kw, dt, pw);
    }
  }
  setLink(id, key, val) {
    const l = this.links.get(id); if (!l) return;
    if (key === 'mode') { l.mode = val; if (val === 'MAN') l.manQ = Math.round(l.q); }
    else if (key === 'sp') l.sp = val;
    else if (key === 'manQ') { l.manQ = val; l.mode = 'MAN'; }
    this.alarms.log(`OPR · ${id} ${key} = ${typeof val === 'number' ? val.toFixed(1) : val}`, id);
    this.emit('cmd', { linkId: id, key, val });
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
    if (s.cl2) s.cl2.lolotimer = 0; if (s.aop) s.aop.overT = 0;
    this.emit('cmd', { siteId, ilkReset: true }); return 'ok';
  }
  setSp(siteId, key, val) {
    const s = this.sites.get(siteId);
    if (key in s.sp) s.sp[key] = val;
    else if (key === 'cl2Sp') s.cl2.sp = val;
    else if (key === 'cl2Duty') s.cl2.duty = val;
    else if (s.aop && (key === 'uvKw' || key === 'h2o2')) s.aop[key] = key === 'uvKw' ? clamp(val, 0, DX.uvKwMax) : clamp(val, 0, 30);
    else if (s.plant && key in s.plant) { s.plant[key] = val; if (key === 'flowSp') s.plant.mode = 'MAN'; }
    this.alarms.log(`OPR · ${siteId} ${key} = ${typeof val === 'number' ? val.toFixed(2) : val}`, siteId);
    this.emit('cmd', { siteId, key, val });
  }

  totals() {
    const t = newTotals(); let kw = 0, supplyLs = 0, demandLs = 0;
    for (const x of [...this.sites.values(), ...this.links.values()]) { t.m3 += x.cfg.kind === 'PS' || x.cfg.from ? 0 : x.today.m3; t.kwh += x.today.kwh; t.elec += x.today.elec + x.today.ga; t.diesel += x.today.diesel; t.chem += x.today.chem; t.ga += x.today.ga; kw += x.kw || 0; }
    for (const z of this.zones.values()) { if (z.cfg.node) continue; demandLs += z.demandLs; }
    for (const s of this.sites.values()) supplyLs += s.kind === 'asr' ? 0 : s.flowOut;
    t.m3 = 0; for (const z of this.zones.values()) t.m3 += z.today.m3; // delivered to customers = Σ zones
    return { ...t, kw, supplyLs, demandLs, classAKw: this.classAKw, since: this.totalsSince };
  }
}
