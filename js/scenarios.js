/** Training scenarios: setup → timed injections → objectives evaluated live (v0.2).
 *  Each scenario: { id, title, brief, start:[y,m0,d,h,mi], durationH, setup(sim), tick(sim,dt), objectives:[{text, eval(state,sim)→'pass'|'fail'|'pending'}],
 *  hints[], optional actions(sim)→[{id,label,run,disabled,title}], actionTitle, decisionNote(sim) }.
 *  Every scenario is proven to NOT pass with no trainee action (tests/scenario_noaction.mjs) and to be passable (tests/scenario_action.mjs). */
import { MANN_FILTERS as MF, DIOXANE as DX, SRC } from '../data/network.js';
import * as E from './energy.js';
const H = 3600e3, MIN = 60e3;
const now = sim => sim.time.getTime();
function at(sim, t0, ms) { return now(sim) - t0 >= ms; }
const hhmm = t => new Date(t).toTimeString().slice(0, 5);
// track the first time any alarm id in `ids` was acknowledged
function watchAck(sc, sim, ids, key = 'ackT') { sim.on('ack', a => { if (ids.some(i => a.id === i || a.id.startsWith(i)) && !sc[key]) sc[key] = a.ackT; }); }

const OUTAGE_SITES = ['MWTP', 'K21', 'K21A', 'K23', 'K24', 'K25', 'K26', 'K29', 'K91', 'K92', 'K93', 'K94', 'ASR5', 'RCW2', 'RCW3', 'RCW4'];

export const SCENARIOS = [
  {
    id: 'trip', title: 'High-lift pump trip at morning peak (Strange St WTP)', durationH: 5,
    brief: 'Weekday 06:40, hot dry week. Kit 4 (central Kitchener, ≈24,500 m³ of storage) is at 56 % heading into the AM peak and the Mannheim Zone 4 PS is already near its capacity at peak. ' +
      'Strange Street WTP high-lift pump HL-2 is locked out for maintenance. Shortly after start, the duty high-lift pump HL-1 trips on motor overload and Strange St (≈145 L/s into Kit 4) stops delivering. ' +
      'Acknowledge the alarm, find the cause on the Strange St faceplate, make up the lost supply (start a standby source such as Parkway K31/K33 or Woolner K80–K82 in HAND, or raise Greenbrook / K34), ' +
      'reset HL-1 when the 30-min motor cool-down lock-out expires, and keep Kit 4 storage ≥ 40 %.',
    start: [2026, 6, 15, 6, 40],
    setup(sim) {
      Object.assign(this, { t0: now(sim), tripped: false, ackT: null, minLevel: 100, reset: false, madeUp: false });
      const z = sim.zones.get('KIT4'); z.level = 56; z.demandMult = 1.12;
      const s = sim.sites.get('STR'); s.hl[1].mode = 'OFF'; s.hl[1].trip = 'LOTO – maintenance (scenario condition)'; s.hl[1].lockoutUntil = now(sim) + 48 * H; s.hl[1].state = 'TRIP';
      this.hooks(sim);
    },
    hooks(sim) { watchAck(this, sim, ['STR:HL-1:trip']); },
    tick(sim) {
      if (!this.tripped && at(sim, this.t0, 4 * MIN)) {
        this.tripped = true; sim.tripPump('STR', 'HL-1', 'motor overload (49/50 relay)');
        sim.findPump('STR', 'HL-1').lockoutUntil = now(sim) + 30 * MIN; this.tripT = now(sim);
      }
      if (this.tripped) this.minLevel = Math.min(this.minLevel, sim.zones.get('KIT4').level);
      if (this.tripped && ['PKW', 'WOO'].some(id => sim.sites.get(id).wells.some(p => p.state === 'RUN'))) this.madeUp = true;
      if (this.tripped && !sim.findPump('STR', 'HL-1').trip) this.reset = true;
    },
    objectives: [
      { text: 'Acknowledge the Strange St HL-1 trip alarm within 5 min', eval: s => !s.tripped ? 'pending' : s.ackT ? (s.ackT - s.tripT <= 5 * MIN ? 'pass' : 'fail') : 'pending' },
      { text: 'Make up supply: start a standby Kit 4 source (Parkway or Woolner wells)', eval: s => s.madeUp ? 'pass' : 'pending' },
      { text: 'Reset HL-1 after the cool-down lock-out', eval: s => s.reset ? 'pass' : 'pending' },
      { text: 'Keep Kit 4 storage ≥ 40 % for 4 h after the trip', eval: (s, sim) => s.minLevel < 40 ? 'fail' : (s.tripped && now(sim) - s.tripT > 4 * H ? 'pass' : 'pending') },
    ],
    hints: ['Faceplate → Strange St → HL-1 tile shows TRIP and the lock-out time.', 'Parkway (K31/K33) and Woolner (K80–K82) are standby wells into Kit 4 – set a pump to HAND.', 'Transfers tab: Mannheim Zone 4 PS is at its limit at peak – watch it saturate.'],
  },
  {
    id: 'turb', title: 'Grand River turbidity spike at Mannheim WTP', durationH: 9,
    brief: 'A summer thunderstorm upstream: Grand River flow at Doon (02GA048) climbs from ~11 m³/s to >150 m³/s over a few hours and raw turbidity follows. ' +
      'The coagulant (PACl) dose is still at the dry-weather setpoint. Ontario criterion (Procedure for Disinfection): filtered turbidity ≤ 0.3 NTU in at least 95 % of measurements, never > 1 NTU – scored here on 15-min readings. ' +
      'Raise the PACl dose toward the jar-test value (an overdose beyond ≈1.6× restabilises the floc), cut plant flow if filter loading pushes floc through, and let the filters wash as they load up faster at high settled turbidity. Avoid the filter-to-waste interlock (filtered > 1.0 NTU for 2 min).',
    start: [2026, 6, 15, 13, 0],
    setup(sim) { Object.assign(this, { t0: now(sim), maxFilt: 0, ftw: false, paclRaised: false, timeOver: 0, samples: 0, samplesOk: 0, nextSample: now(sim) + 15 * MIN }); sim.river.flow = 11; sim.river.turbRaw = 6; },
    tick(sim, dt) {
      const el = (now(sim) - this.t0) / H;
      sim.river.stormBoost = el < 0.3 ? 0 : el < 4 ? 160 * Math.min(1, (el - 0.3) / 2.2) : Math.max(0, 160 * (1 - (el - 4) / 10));
      const P = sim.sites.get('MWTP').plant;
      this.maxFilt = Math.max(this.maxFilt, P.filtered); if (P.ftw) this.ftw = true;
      if (P.paclSp >= 35) this.paclRaised = true;
      if (P.filtered > 0.3) this.timeOver += dt;
      if (now(sim) >= this.nextSample) { this.nextSample += 15 * MIN; this.samples++; if (P.filtered <= 0.3) this.samplesOk++; }
    },
    pctOk() { return this.samples ? 100 * this.samplesOk / this.samples : 100; },
    objectives: [
      { text: 'Raise PACl dose to ≥ 35 mg/L as raw turbidity climbs', eval: s => s.paclRaised ? 'pass' : 'pending' },
      { text: 'No filter-to-waste interlock', eval: (s, sim) => s.ftw ? 'fail' : (now(sim) - s.t0 > 8 * H ? 'pass' : 'pending') },
      { text: '≥ 95 % of 15-min filtered-turbidity readings ≤ 0.3 NTU over 8 h, none > 1.0 NTU', eval: (s, sim) => s.maxFilt > 1.0 ? 'fail' : (now(sim) - s.t0 > 8 * H ? (s.pctOk() >= 95 ? 'pass' : 'fail') : 'pending') },
    ],
    decisionNote(sim) { return `15-min readings ≤ 0.3 NTU: ${this.samplesOk}/${this.samples} (${this.pctOk().toFixed(0)} %) · peak ${this.maxFilt.toFixed(2)} NTU`; },
    hints: ['Board → Mannheim panel shows river flow, raw/filtered NTU and the suggested dose.', 'Faceplate → Mannheim WTP → PACl dose setpoint.', 'Higher plant flow = higher filter loading = higher filtered turbidity; the PLC also washes filters automatically.'],
  },
  {
    id: 'cl2', title: 'Low chlorine residual – Erb Street wells', durationH: 2,
    brief: 'Night shift, 02:10. The duty NaOCl metering pump (A) at the Erb Street wells (Waterloo Zone 5 / Erb St reservoir) has lost prime. Dose drops to zero and the total chlorine residual leaving the site will decay. ' +
      'Acknowledge, switch the metering pump to standby (B) and restore residual ≥ 1.0 mg/L. If the residual stays LOW-LOW for 60 s the PLC shuts the wells down (latched) – ' +
      'then you must reset the interlock after fixing the cause. Ontario O. Reg. 170/03 requires ≥0.25 mg/L combined chlorine in distribution.',
    start: [2026, 6, 16, 2, 10],
    setup(sim) {
      Object.assign(this, { t0: now(sim), failed: false, fixedT: null, ilk: false, ackT: null });
      const s = sim.sites.get('ERB'); this.erb = s; s.cl2.tau = 1200; /* analyzer downstream of reservoir inlet: slower response (ESTIMATE) */
      const z = sim.zones.get('WAT5'); z.level = 40; z.demandMult = 1.1; // low enough that the Erb St wells are pumping
      this.hooks(sim);
    },
    hooks(sim) { this.erb = sim.sites.get('ERB'); watchAck(this, sim, ['ERB:meter', 'ERB:cl2']); },
    tick(sim) {
      const s = this.erb;
      if (!this.failed && at(sim, this.t0, 3 * MIN)) { this.failed = true; s.cl2.fault.A = true; this.failT = now(sim); }
      if (s.interlock) this.ilk = true;
      if (this.failed && !this.fixedT && s.cl2.duty === 'B' && s.cl2.res >= 1.0 && s.flowOut > 0) this.fixedT = now(sim);
    },
    objectives: [
      { text: 'Acknowledge the metering pump / low residual alarm', eval: s => s.ackT ? 'pass' : 'pending' },
      { text: 'Switch NaOCl duty to standby pump B', eval: s => s.erb?.cl2.duty === 'B' ? 'pass' : 'pending' },
      { text: 'Residual back ≥ 1.0 mg/L with wells pumping within 45 min of the failure', eval: (s, sim) => s.fixedT ? (s.fixedT - s.failT <= 45 * MIN ? 'pass' : 'fail') : (s.failed && now(sim) - s.failT > 45 * MIN ? 'fail' : 'pending') },
      { text: '(Bonus) avoid the Cl₂ LOW-LOW interlock shutdown', eval: s => s.ilk ? 'fail' : (s.fixedT ? 'pass' : 'pending') },
    ],
    hints: ['Faceplate → Erb Street → Chlorination block → Duty pump A/B.', 'If the site interlocked, press "Reset interlock" after the cause is fixed.', 'Free → combined: NH₄ is added at the reservoir inlet, so the analyzer reads total Cl₂.'],
  },

  // ───────────────────────── v0.2 scenarios ─────────────────────────
  {
    id: 'outage', title: 'Power outage – Mannheim feeder (generator fails to start)', durationH: 6,
    brief: 'Tue 14 Jul 2026, 16:20, 31 °C. A storm trips the utility feeder serving the Mannheim WTP campus (plant, Zone 4/5/6 pumping) and the Mannheim-area wells and ASR/RCW wells. ' +
      'The Mannheim standby generator (sized ≈55 % of connected load – ESTIMATE) reports FAIL TO START (low-battery fault). Wells and ASR sites have no standby power and latch out on power fail. ' +
      'Kit 4, Kit 5 and Kit/Wat 6 storage is lower than usual after the afternoon peak. The utility estimates ≈2½ h to restore. ' +
      'Your job: (1) get Mannheim on standby power – reset the generator fault (it then auto-starts) and restart the plant from its power-fail latch; (2) protect Kit 4/5/6 storage; ' +
      '(3) when the feeder is re-energized, restart the latched sites WITHOUT re-tripping it – the feeder protection trips if more than 3 motors restart within 2 min (inrush, ESTIMATE); ' +
      '(4) transfer Mannheim back to utility power and stop the generator.',
    start: [2026, 6, 14, 16, 20],
    setup(sim) {
      Object.assign(this, { t0: now(sim), outT: null, restoreT: null, genOkT: null, minLv: 100, inrushTrips: 0, allRestartedT: null, utilT: null, ackT: null });
      for (const [id, l] of [['KIT4', 55], ['KIT5', 50], ['KIT6', 52]]) { const z = sim.zones.get(id); z.level = l; z.demandMult = 1.12; }
      sim.feeders.MANN = { id: 'MANN', name: 'Mannheim 27.6 kV feeder (ESTIMATE)', sites: OUTAGE_SITES.slice(), up: true, inrushLimit: 3, restarts: [] };
      this.hooks(sim);
    },
    hooks(sim) { watchAck(this, sim, ['MWTP:pwr', 'MWTP:gen']); },
    tick(sim) {
      const f = sim.feeders.MANN, m = sim.sites.get('MWTP');
      if (!this.outT && at(sim, this.t0, 2 * MIN)) { m.pw.gen.fault = 'low battery'; this.outT = now(sim); sim.tripFeeder('MANN', 150, 'storm – utility lockout'); }
      if (!this.outT) return;
      if (f.trips > 1 + this.inrushTrips && this.restoreT) this.inrushTrips = f.trips - 1;
      if (!this.restoreT && f.up) this.restoreT = now(sim);
      if (!f.up && m.pw.gen.state === 'RUN' && !m.pw.latch && !this.genOkT) this.genOkT = now(sim);
      if (!this.restoreT || now(sim) - this.restoreT < 60 * MIN) for (const id of ['KIT4', 'KIT5', 'KIT6']) this.minLv = Math.min(this.minLv, sim.zones.get(id).level);
      if (this.restoreT && f.up && !this.allRestartedT && OUTAGE_SITES.every(id => !sim.sites.get(id).pw.latch)) this.allRestartedT = now(sim);
      if (this.restoreT && f.up && !this.utilT && !m.pw.latch && ['STANDBY', 'COOLDOWN'].includes(m.pw.gen.state)) this.utilT = now(sim);
    },
    objectives: [
      { text: 'Mannheim WTP running on its standby generator within 20 min of the outage', eval: (s, sim) => s.genOkT ? (s.genOkT - s.outT <= 20 * MIN ? 'pass' : 'fail') : (s.outT && now(sim) - s.outT > 20 * MIN ? 'fail' : 'pending') },
      { text: 'Kit 4, Kit 5 and Kit/Wat 6 storage ≥ 30 % through the outage (until 1 h after restoration)', eval: (s, sim) => s.minLv < 30 ? 'fail' : (s.restoreT && now(sim) - s.restoreT >= 60 * MIN ? 'pass' : 'pending') },
      { text: 'After restoration, restart every latched site within 60 min without re-tripping the feeder on inrush', eval: (s, sim) => s.inrushTrips > 0 ? 'fail' : s.allRestartedT ? (s.allRestartedT - s.restoreT <= 60 * MIN ? 'pass' : 'fail') : (s.restoreT && now(sim) - s.restoreT > 60 * MIN ? 'fail' : 'pending') },
      { text: 'Mannheim back on utility power with the generator stopped within 30 min of restoration', eval: (s, sim) => s.utilT ? (s.utilT - s.restoreT <= 30 * MIN ? 'pass' : 'fail') : (s.restoreT && now(sim) - s.restoreT > 30 * MIN ? 'fail' : 'pending') },
    ],
    actionTitle: 'Power-fail restart (one click = one site; stagger ≤ 3 per 2 min)',
    actions(sim) {
      return OUTAGE_SITES.filter(id => sim.sites.get(id)?.pw.latch).map(id => {
        const pw = sim.sites.get(id).pw;
        return { id: 'rst-' + id, label: `Restart ${id}`, disabled: !pw.on, title: pw.on ? 'Clear the power-fail latch and restart' : 'No power at this site yet', run: s => s.resetPowerLatch(id) };
      });
    },
    decisionNote(sim) { const f = sim.feeders.MANN; if (!f) return ''; const r = (f.restarts || []).filter(t => now(sim) - t < 120e3).length; return `Feeder ${f.up ? 'ENERGIZED' : 'DE-ENERGIZED'} · restarts in last 2 min: ${r}/${f.inrushLimit}`; },
    hints: ['Faceplate → Mannheim WTP → Power block: "Reset gen fault" (the ATS then starts it), then "Restart" to clear the power-fail latch.', 'On generator Mannheim runs at ≈55 % capacity – Zone 4/5/6 PS share it; consider opening Manitou PRV (Kit 6 → Kit 5) or starting Kit 4 standby wells.', 'After restoration: if you started the generator manually it will NOT retransfer by itself – press "Stop gen / retransfer".', 'Restart sites a few at a time – watch the counter under the restart buttons.'],
  },
  {
    id: 'mainbreak', title: 'Transmission main break – Waterloo Zone 4 (boil-water decision)', durationH: 5,
    brief: 'Wed 15 Jul 2026, 06:50. A large-diameter main feeding Waterloo Zone 4 from the Mannheim/Kit 4 side (the MV3 supply path – exact location is a training ESTIMATE) splits longitudinally across two pipe lengths. ' +
      'Expect Wat 4 flow to jump and pressure to fall; customer calls follow. The Erb St butterfly valve (Kit 4 → Wat 4) was left in MAN at 40 L/s after maintenance. ' +
      'Dispatch a crew, isolate the break (MV3 then runs on a parallel main at ≈50 % capacity and ≈4 % of Wat 4 customers are out of water – ESTIMATES), make up supply into Wat 4 (Erb St BV/PRV, Erb St and Laurel wells, Kit 5 → Wat 5 via MV2), ' +
      'and make the regulatory decision under the Region’s Watermain Disinfection Procedure / O. Reg. 170/03 Schedule 16: a break needing >1 pipe length is Category 2; ' +
      'it is reportable (MOH + Spills Action Centre, precautionary boil-water advisory for the affected area as directed by the MOH) only if contaminated water may have been directed to users. ' +
      'Sim training rule (ESTIMATE, not a Regional standard): treat any Wat 4 pressure < 140 kPa (20 psi) as possible intrusion.',
    start: [2026, 6, 15, 6, 50],
    setup(sim) {
      Object.assign(this, { t0: now(sim), breakT: null, crewT: null, arriveT: null, isoT: null, decision: null, decT: null, minP: 999, minLv: 100 });
      const z = sim.zones.get('WAT4'); z.level = 62; z.demandMult = 1.12;
      const bv = sim.links.get('ERBBV'); bv.mode = 'MAN'; bv.manQ = 40;
    },
    tick(sim) {
      const z = sim.zones.get('WAT4');
      if (!this.breakT && at(sim, this.t0, 5 * MIN)) { this.breakT = now(sim); z.leakLs = 250; sim.alarms.raise('WAT4:break', null, 'Wat 4: flow up ≈250 L/s, pressure falling, customer calls – suspected MAIN BREAK', 1); sim.alarms.log('EVT · large main break in Wat 4 (MV3 supply path)'); }
      if (!this.breakT) return;
      if (this.crewT && !this.arriveT && now(sim) - this.crewT >= 25 * MIN) { this.arriveT = now(sim); sim.alarms.log('CREW · on site, break located – isolation valves identified'); }
      this.minP = Math.min(this.minP, z.press);
      if (now(sim) - this.breakT <= 4 * H) this.minLv = Math.min(this.minLv, z.level);
    },
    correct() { return this.minP < 140 ? 'report' : 'cat2'; },
    objectives: [
      { text: 'Dispatch a crew and isolate the break within 60 min', eval: (s, sim) => s.isoT ? (s.isoT - s.breakT <= 60 * MIN ? 'pass' : 'fail') : (s.breakT && now(sim) - s.breakT > 60 * MIN ? 'fail' : 'pending') },
      { text: 'Keep Wat 4 storage ≥ 30 % for 4 h after the break', eval: (s, sim) => s.minLv < 30 ? 'fail' : (s.breakT && now(sim) - s.breakT > 4 * H ? 'pass' : 'pending') },
      { text: 'Keep Wat 4 pressure ≥ 140 kPa (20 psi)', eval: (s, sim) => s.minP < 140 ? 'fail' : (s.breakT && now(sim) - s.breakT > 4 * H ? 'pass' : 'pending') },
      { text: 'Correct notification decision (within 2 h of isolation)', eval: (s, sim) => s.decision ? (s.decision === s.correct() ? 'pass' : 'fail') : ((s.isoT && now(sim) - s.isoT > 2 * H) || (s.breakT && now(sim) - s.breakT > 4 * H) ? 'fail' : 'pending') },
    ],
    actionTitle: 'Field crew & regulatory decision',
    actions(sim) {
      const s = this;
      const a = [];
      a.push({ id: 'crew', label: s.crewT ? `Crew dispatched ${hhmm(s.crewT)}${s.arriveT ? ' – on site' : ''}` : 'Dispatch crew', disabled: !s.breakT || !!s.crewT, run: () => { s.crewT = now(sim); sim.alarms.log('OPR · crew dispatched to suspected break (ETA 25 min)'); return 'ok'; } });
      a.push({ id: 'iso', label: s.isoT ? `Isolated ${hhmm(s.isoT)}` : 'Close isolation valves', disabled: !s.arriveT || !!s.isoT, title: 'Crew closes the valves either side of the break', run: () => {
        s.isoT = now(sim); const z = sim.zones.get('WAT4'); z.leakLs = 0; z.isoFrac = 0.04; sim.links.get('MV3').capFrac = 0.5; sim.alarms.clear('WAT4:break');
        sim.alarms.log('CREW · break isolated – MV3 path now on a parallel main at ≈50 % capacity (ESTIMATE), ≈4 % of Wat 4 customers without water'); return 'ok'; } });
      const dis = !s.isoT || !!s.decision;
      const dec = (k, txt) => () => { s.decision = k; s.decT = now(sim); sim.alarms.log(`OPR · decision: ${txt}`); return 'ok'; };
      a.push({ id: 'cat1', label: 'Category 1 – no notification', disabled: dis, run: dec('cat1', 'Category 1, no notification') });
      a.push({ id: 'cat2', label: 'Category 2 – not reportable (flush, disinfect, sample)', disabled: dis, run: dec('cat2', 'Category 2, not reportable') });
      a.push({ id: 'report', label: 'Report to MOH + SAC (Sched. 16) – recommend precautionary BWA', disabled: dis, run: dec('report', 'reportable – MOH & SAC notified, precautionary BWA recommended for isolated area') });
      return a;
    },
    decisionNote(sim) { return this.breakT ? `Lowest Wat 4 pressure since the break: ${this.minP < 999 ? this.minP.toFixed(0) : '–'} kPa${this.decision ? ` · decision: ${this.decision}` : ''}` : ''; },
    hints: ['NOTE: the scored Category 2 / reportability answer is a training simplification that still needs review by a qualified Ontario operator (see Help).', 'Transfers tab: Erb St BV is in MAN – put it back in AUTO or raise its flow; Erb St PRV and MV2 can bring Wat 5 water into Wat 4.', 'Erb St / Laurel wells: set pumps to HAND to add supply.', 'Decision: >1 pipe length → never Category 1. Pressure < 20 psi → assume intrusion → reportable (MOH decides on the BWA).', `Source: Region Watermain Disinfection Procedure (2020) / O. Reg. 170/03 – see Help → Sources (${SRC.WMDP || ''}).`],
  },
  {
    id: 'backwash', title: 'Mannheim filter backwash – breakthrough vs headloss', durationH: 5,
    brief: 'Wed 15 Jul 2026, 09:00. After a PLC program change last night, automatic backwash initiation is DISABLED (manual washes only). ' +
      'Filter F2 is showing early turbidity breakthrough and fouling fast; F1 is at terminal headloss (its flow is choked). Only one filter can wash at a time (backwash supply and waste capacity), ' +
      'at least two must stay in service, and plant capacity drops while a filter is out. Each wash: DRAIN 10 → AIR SCOUR 4 → BACKWASH 10 → RINSE 5 → FILTER-TO-WASTE 15 min (durations ESTIMATE). ' +
      'Prioritise water quality, never bypass filter-to-waste, keep the combined filtered turbidity ≤ 0.3 NTU.',
    start: [2026, 6, 15, 9, 0],
    setup(sim) {
      Object.assign(this, { t0: now(sim), first: null, f2T: null, f1T: null, ftwSkip: false, over: 0, maxF2: 0 });
      const m = sim.sites.get('MWTP'), P = m.plant; P.autoBw = false;
      const Sbt = MF.breakVolM3 * 1.5, Sterm = Sbt * 1.25;
      const set = (i, solids, runH) => Object.assign(m.filters[i], { solids, runH, state: 'SERVICE', step: -1 });
      set(0, Sbt * 1.48, 88); m.filters[0].btScale = 1.6; /* F1 headloss-limited, not yet breaking through */ set(1, Sbt * 1.03, 70); set(2, Sbt * 0.45, 30); set(3, Sbt * 0.2, 12);
      this.hooks(sim);
    },
    hooks(sim) {
      sim.on('cmd', c => { if (c.bw && !this.first) this.first = c.bw; });
      sim.on('bwDone', f => { if (f.id === 'F2' && !this.f2T) this.f2T = now(sim); if (f.id === 'F1' && !this.f1T) this.f1T = now(sim); });
    },
    tick(sim, dt) {
      const m = sim.sites.get('MWTP'), F2 = m.filters[1];
      if (F2.state === 'SERVICE' && !this.f2T) F2.solids += 0.4 * dt; // cracked media / mudballs: F2 fouls faster (scenario condition)
      if (m.filters.some(f => f.state === 'WASH' && f.skipFtw)) this.ftwSkip = true;
      if (!this.f2T) this.maxF2 = Math.max(this.maxF2, F2.turb);
      if (m.plant.filtered > 0.3) this.over += dt;
    },
    objectives: [
      { text: 'Wash F2 (turbidity breakthrough) first – water quality before hydraulics', eval: s => s.first ? (s.first === 'F2' ? 'pass' : 'fail') : 'pending' },
      { text: 'F2 back in service before its effluent reaches 0.5 NTU', eval: s => s.maxF2 >= 0.5 ? 'fail' : s.f2T ? 'pass' : 'pending' },
      { text: 'F1 (terminal headloss) washed and back in service within 3 h', eval: (s, sim) => s.f1T ? (s.f1T - s.t0 <= 3 * H ? 'pass' : 'fail') : (now(sim) - s.t0 > 3 * H ? 'fail' : 'pending') },
      { text: 'Never bypass filter-to-waste; combined filtered > 0.3 NTU for < 10 min total', eval: (s, sim) => s.ftwSkip || s.over > 600 ? 'fail' : (now(sim) - s.t0 > 4.5 * H ? 'pass' : 'pending') },
    ],
    hints: ['Faceplate → Mannheim WTP → filter tiles: "Backwash" starts the sequence; the step and timer show on the tile.', 'F2 effluent NTU is on its tile – watch it climb.', 'While a filter is washing, capacity is ≈3 × 190 L/s; the clearwell also supplies 300 L/s of backwash water during the BACKWASH step.'],
  },
  {
    id: 'dioxane', title: 'Greenbrook 1,4-dioxane – rising raw water', durationH: 5,
    brief: 'Thu 16 Jul 2026, 08:00. Real background: Greenbrook WTP (Kitchener; wells K1A, K2A, K4C, K5A, K8) was shut down in 2004 when 1,4-dioxane up to 285 µg/L was found and returned with a UV/H₂O₂ advanced-oxidation (AOP) system; ' +
      'Health Canada’s MAC is 50 µg/L (2021). TRAINING PLUME (hypothetical, exaggerated): 1,4-dioxane at well K5A starts rising from ≈70 µg/L toward ≈1,400 µg/L over 2 h. ' +
      'The AOP is at its energy-saving setting (UV 100 kW, H₂O₂ 6 mg/L). Keep AOP effluent ≤ 25 µg/L (sim operating limit, ESTIMATE) and never above the MAC – the PLC shuts the plant down if > MAC for 2 min – ' +
      'while keeping Greenbrook in service. Options: raise UV power and/or H₂O₂ dose, and/or take K5A out of service and blend from the other wells.',
    start: [2026, 6, 16, 8, 0],
    setup(sim) {
      Object.assign(this, { t0: now(sim), ackT: null, alarmT: null, maxOut: 0, ilk: false, over: 0, m3: 0, el: 0 });
      const g = sim.sites.get('GRB'); g.aop.uvKw = 100; g.aop.h2o2 = DX.h2o2Default; g.cwLevel = 50; this.g = g; g.wells.find(p => p.id === 'K5A').mode = 'HAND'; // K5A is run in HAND as lead well (scenario condition)
      const z = sim.zones.get('KIT4'); z.level = 56;
      this.hooks(sim);
    },
    hooks(sim) { this.g = sim.sites.get('GRB'); watchAck(this, sim, ['GRB:diox']); },
    tick(sim, dt) {
      const g = this.g, el = (now(sim) - this.t0) / H;
      g.aop.mult.K5A = 1 + 19 * Math.min(1, Math.max(0, (el - 0.1) / 2));
      if (!this.alarmT && [...sim.alarms.list.values()].some(a => a.id.startsWith('GRB:diox') && a.active)) this.alarmT = now(sim);
      if (g.flowIn > 0) this.maxOut = Math.max(this.maxOut, g.aop.out);
      if (g.interlock) this.ilk = true;
      if (g.flowIn > 0 && g.aop.out > DX.opTargetUgL) this.over += dt;
      this.m3 += g.flowOut / 1000 * dt; this.el += dt;
    },
    objectives: [
      { text: 'Acknowledge the 1,4-dioxane alarm within 10 min of it appearing', eval: (s, sim) => s.ackT && s.alarmT ? (s.ackT - s.alarmT <= 10 * MIN ? 'pass' : 'fail') : (s.alarmT && now(sim) - s.alarmT > 10 * MIN ? 'fail' : 'pending') },
      { text: 'AOP effluent never above the MAC (50 µg/L) and no dioxane interlock', eval: (s, sim) => s.maxOut > DX.macUgL || s.ilk ? 'fail' : (now(sim) - s.t0 > 4.5 * H ? 'pass' : 'pending') },
      { text: 'AOP effluent > 25 µg/L for less than 15 min total', eval: (s, sim) => s.over > 900 ? 'fail' : (now(sim) - s.t0 > 4.5 * H ? 'pass' : 'pending') },
      { text: 'Keep Greenbrook in service: average output ≥ 35 L/s over the exercise', eval: (s, sim) => now(sim) - s.t0 > 4.5 * H ? (s.m3 / s.el * 1000 >= 35 ? 'pass' : 'fail') : 'pending' },
    ],
    decisionNote(sim) { const a = this.g?.aop; if (!a) return ''; return `GRB blended raw ${a.raw.toFixed(0)} µg/L · K5A ≈${(DX.wellRawUgL.K5A * a.mult.K5A).toFixed(0)} µg/L · AOP ${a.orders?.toFixed(2) ?? '–'} log removal`; },
    actions() { return []; },
    hints: ['Faceplate → Greenbrook → AOP block: UV kW (max 280) and H₂O₂ mg/L.', 'Log removal = (kWh/m³)/EEO – halving the flow through the reactor doubles the dose.', 'Taking K5A to OFF removes the plume from the blend; the other four wells keep the plant running.', 'More H₂O₂ = more quenching cost downstream; real plants balance UV energy vs peroxide.'],
  },
  {
    id: 'icipeak', title: 'ICI peak day – Class A peak avoidance (real 14 Jul 2026)', durationH: 13.2,
    brief: 'Tue 14 Jul 2026, 09:00 – a real 2026 Ontario top-5 demand day (IESO data). The Region’s Mannheim complex is modelled as a Class A (ICI) customer (ESTIMATE – the Region’s actual class is not public): ' +
      'its share of the year’s Global Adjustment is set by its demand during the 5 highest Ontario peak hours (5CP). The IESO peak-alert banner will show the expected window. ' +
      'Pre-fill storage in the morning (without overflowing anything), then minimise Mannheim grid load across the alert window (14:00–18:00) – e.g. trim Zone 4/5/6 pumping and plant flow while riding on pre-filled Kit storage, ' +
      'or run the standby generator behind the meter (diesel cost + emissions/ECA limits apply). Shutting everything off is not a win: Kit 4 must stay ≥ 40 % through the evening peak and be back to ≥ 50 % by 22:00.',
    start: [2026, 6, 14, 9, 0],
    setup(sim) {
      Object.assign(this, { t0: now(sim), preT: null, preLv: null, accKwS: 0, accS: 0, minLv: 100, minP: 999, diesel0: 0, minK4: 100, lv22: null, spill: 0 });
    },
    tick(sim, dt) {
      const h = sim.time.getHours() + sim.time.getMinutes() / 60;
      if (h >= 14 && this.preLv == null) this.preLv = sim.zones.get('KIT4').level;
      if (h >= 14 && h < 18) { this.accKwS += sim.classAKw * dt; this.accS += dt; }
      if (h < 22) for (const id of ['KIT4', 'KIT5', 'KIT6', 'WAT4']) { const z = sim.zones.get(id); this.minLv = Math.min(this.minLv, z.level); this.minP = Math.min(this.minP, z.press); }
      if (h < 22) this.minK4 = Math.min(this.minK4, sim.zones.get('KIT4').level);
      if (h >= 22 && this.lv22 == null) this.lv22 = Object.fromEntries(['KIT4', 'KIT5', 'KIT6'].map(id => [id, sim.zones.get(id).level]));
      for (const z of sim.zones.values()) this.spill += (z.spillLs || 0) * dt / 1000;
    },
    avgKw() { return this.accS > 0 ? this.accKwS / this.accS : null; },
    objectives: [
      { text: 'Pre-fill: Kit 4 storage ≥ 76 % at 14:00', eval: s => s.preLv == null ? 'pending' : s.preLv >= 76 ? 'pass' : 'fail' },
      { text: 'Average Mannheim (Class A) grid load 14:00–18:00 ≤ 1,000 kW', eval: (s, sim) => sim.time.getHours() >= 18 || sim.time.getDate() !== 14 ? (s.avgKw() != null && s.avgKw() <= 1000 ? 'pass' : 'fail') : 'pending' },
      { text: 'Through the evening peak: Kit 4 never below 40 %, Kit 5/6 and Wat 4 ≥ 25 %, pressure ≥ 275 kPa (until 22:00)', eval: (s, sim) => s.minK4 < 40 || s.minLv < 25 || s.minP < 275 ? 'fail' : (s.lv22 ? 'pass' : 'pending') },
      { text: 'Recovered by 22:00: Kit 4 ≥ 50 %, Kit 5 and Kit/Wat 6 ≥ 45 %', eval: s => s.lv22 ? (s.lv22.KIT4 >= 50 && s.lv22.KIT5 >= 45 && s.lv22.KIT6 >= 45 ? 'pass' : 'fail') : 'pending' },
      { text: 'No reservoir/tower overflow while pre-filling', eval: (s, sim) => s.spill > 1 ? 'fail' : (s.lv22 ? 'pass' : 'pending') },
    ],
    decisionNote(sim) {
      const a = this.avgKw(); if (a == null) return 'Alert-window average Class A load: not started (14:00–18:00)';
      const perHourMW = E.DOLLARS_PER_MW_ALL5 / 5; // $ per MW in ONE of the 5 peak hours
      const pj = E.projectNextYear(sim.peak.confirmed); const you = pj.rows.find(r => r.simulated);
      return `Alert-window average Class A load ${a.toFixed(0)} kW · each MW avoided in one peak hour ≈ $${Math.round(perHourMW).toLocaleString('en-CA')}/yr of GA` +
        (you ? ` · your load in the real peak (HE${you.he}): ${Math.round(you.kw)} kW → projected next-year PDF ${(pj.pdf * 1e5).toFixed(3)}×10⁻⁵, GA ${'$' + Math.round(pj.ga).toLocaleString('en-CA')}/yr (${pj.saving >= 0 ? 'saves' : 'costs'} $${Math.abs(Math.round(pj.saving)).toLocaleString('en-CA')}/yr vs 2.5 MW) (ESTIMATE)` : ' (ESTIMATE from 2026 IESO data)');
    },
    actions() { return []; },
    hints: ['Costs tab → ICI section shows the real 2026 peaks, the alert and the $/MW value.', 'Transfers tab: raise Z4PS/Z5PS/Z6PS setpoints in the morning to pre-fill; put them in MAN low (or CLOSED) during the window.', 'Mannheim faceplate: plant flow MAN reduces process + low-lift load; generator "Start" runs it behind the meter.'],
  },
];

export function startScenario(sim, sc) {
  const [y, mo, d, h, mi] = sc.start;
  sim.time = new Date(y, mo, d, h, mi, 0); sim.day = sim.time.getDate(); sim.month = sim.time.getMonth();
  sim.resetTotals();
  sim.scenario = sc; sc.setup(sim);
  sim.alarms.log(`SCENARIO START · ${sc.title}`);
}
export function scenarioStatus(sim) {
  const sc = sim.scenario; if (!sc) return null;
  return sc.objectives.map(o => ({ text: o.text, st: o.eval(sc, sim) }));
}
export function scenarioScore(sim) {
  const st = scenarioStatus(sim); if (!st) return null;
  const pass = st.filter(o => o.st === 'pass').length, fail = st.filter(o => o.st === 'fail').length;
  return { pass, fail, pending: st.length - pass - fail, total: st.length, pct: Math.round(100 * pass / st.length) };
}
