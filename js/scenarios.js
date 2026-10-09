/** Training scenarios: setup → timed injections → objectives evaluated live. */
const H = 3600e3;
function at(sim, t0, ms) { return sim.time.getTime() - t0 >= ms; }

export const SCENARIOS = [
  {
    id: 'trip', title: 'Well pump trip at morning peak (K25)',
    brief: 'Weekday 06:40, hot dry week. Mannheim zone (K4M) storage is 60 % heading into the AM peak and the Mannheim WTP was left in MAN at 430 L/s after a filter wash. Shortly after start, Well K25 (one of the biggest Mannheim-area wells, ≈50 L/s) trips on motor overload. ' +
      'Acknowledge the alarm, find the cause on the K25 faceplate, make up the lost supply (e.g. raise Mannheim WTP plant flow in MAN, or start a standby source such as ASR/RCW wells or K22A), ' +
      'and reset K25 once the motor cool-down lock-out expires (30 sim-min). Keep K4M storage above 55%.',
    start: [2026, 6, 15, 6, 40],
    setup(sim) {
      this.t0 = sim.time.getTime(); this.tripped = false; this.ackT = null; this.minLevel = 100; this.reset = false; this.madeUp = false;
      sim.zones.get('K4M').level = 60; sim.zones.get('K4M').demandMult = 1.12;
      const P = sim.sites.get('MWTP').plant; P.mode = 'MAN'; P.flowSp = 430; P.flow = 430; // left in MAN after a filter wash (scenario condition)
    },
    tick(sim) {
      if (!this.tripped && at(sim, this.t0, 4 * 60e3)) {
        this.tripped = true; sim.tripPump('K25', 'K25', 'motor overload (49/50 relay)');
        const p = sim.findPump('K25', 'K25'); p.lockoutUntil = sim.time.getTime() + 30 * 60e3; this.tripT = sim.time.getTime();
      }
      const a = sim.alarms.list.get('K25:K25:trip'); if (a?.acked && !this.ackT) this.ackT = a.ackT;
      if (this.tripped) this.minLevel = Math.min(this.minLevel, sim.zones.get('K4M').level);
      const m = sim.sites.get('MWTP');
      if (this.tripped && ((m.plant.mode === 'AUTO' || m.plant.flowSp > 560) || ['ASR1', 'ASR2', 'ASR3', 'ASR4', 'ASR5', 'RCW2', 'RCW3', 'RCW4', 'K22A'].some(id => sim.sites.get(id).wells.some(p => p.state === 'RUN')))) this.madeUp = true;
      if (this.tripped && !sim.findPump('K25', 'K25').trip) this.reset = true;
    },
    objectives: [
      { text: 'Acknowledge the K25 trip alarm within 5 min', eval: s => !s.tripped ? 'pending' : s.ackT ? (s.ackT - s.tripT <= 5 * 60e3 ? 'pass' : 'fail') : 'pending' },
      { text: 'Make up supply (Mannheim WTP back to AUTO or > 560 L/s, or start a standby/ASR source)', eval: s => s.madeUp ? 'pass' : 'pending' },
      { text: 'Reset K25 after the cool-down lock-out', eval: s => s.reset ? 'pass' : 'pending' },
      { text: 'Keep K4M storage ≥ 55% for 4 h after the trip', eval: (s, sim) => s.minLevel < 55 ? 'fail' : (s.tripped && sim.time.getTime() - s.tripT > 4 * H ? 'pass' : 'pending') },
    ],
    hints: ['Faceplate → K25 → pump tile shows TRIP and the lock-out time.', 'Mannheim WTP faceplate → plant flow mode MAN → raise setpoint (max ≈625 L/s, plate-settler limit).', 'ASR/RCW wells feed the Mannheim clearwells; set one to HAND to start it.'],
  },
  {
    id: 'turb', title: 'Grand River turbidity spike at Mannheim WTP',
    brief: 'A summer thunderstorm upstream: Grand River flow at Doon (02GA048) climbs from ~11 m³/s to >150 m³/s over a few hours and raw turbidity follows. ' +
      'The coagulant (PACl) dose is still at the dry-weather setpoint. Keep filtered turbidity ≤ 0.3 NTU (Procedure for Disinfection criterion) by raising the PACl dose ' +
      '(watch the "jar-test" suggested dose) and, if needed, cutting plant flow and leaning on wells. Avoid the filter-to-waste interlock (filtered > 1.0 NTU for 2 min).',
    start: [2026, 6, 15, 13, 0],
    setup(sim) { this.t0 = sim.time.getTime(); this.maxFilt = 0; this.ftw = false; this.paclRaised = false; this.timeOver = 0; sim.river.flow = 11; sim.river.turbRaw = 6; },
    tick(sim, dt) {
      const el = (sim.time.getTime() - this.t0) / H;
      sim.river.stormBoost = el < 0.3 ? 0 : el < 4 ? 160 * Math.min(1, (el - 0.3) / 2.2) : Math.max(0, 160 * (1 - (el - 4) / 10));
      const P = sim.sites.get('MWTP').plant;
      this.maxFilt = Math.max(this.maxFilt, P.filtered); if (P.ftw) this.ftw = true;
      if (P.paclSp >= 35) this.paclRaised = true;
      if (P.filtered > 0.3) this.timeOver += dt;
    },
    objectives: [
      { text: 'Raise PACl dose to ≥ 35 mg/L as raw turbidity climbs', eval: s => s.paclRaised ? 'pass' : 'pending' },
      { text: 'No filter-to-waste interlock', eval: (s, sim) => s.ftw ? 'fail' : (sim.time.getTime() - s.t0 > 8 * H ? 'pass' : 'pending') },
      { text: 'Filtered turbidity > 0.3 NTU for less than 30 min total', eval: (s, sim) => s.timeOver > 1800 ? 'fail' : (sim.time.getTime() - s.t0 > 8 * H ? 'pass' : 'pending') },
    ],
    hints: ['Board → Mannheim panel shows river flow, raw/filtered NTU and the suggested dose.', 'Faceplate → Mannheim WTP → PACl dose setpoint.', 'Higher plant flow = higher filter loading = higher filtered turbidity.'],
  },
  {
    id: 'cl2', title: 'Low chlorine residual – Erb Street wells',
    brief: 'Night shift, 02:10. The duty NaOCl metering pump (A) at the Erb Street wells (Waterloo Zone 4) has lost prime. Dose drops to zero and the total chlorine residual leaving the site will decay. ' +
      'Acknowledge, switch the metering pump to standby (B) and restore residual ≥ 1.0 mg/L. If the residual stays LOW-LOW for 60 s the PLC shuts the wells down (latched) – ' +
      'then you must reset the interlock after fixing the cause. Ontario O. Reg. 170/03 requires ≥0.25 mg/L combined chlorine in distribution.',
    start: [2026, 6, 16, 2, 10],
    setup(sim) {
      this.t0 = sim.time.getTime(); this.failed = false; this.fixedT = null; this.ilk = false; this.ackT = null;
      const s = sim.sites.get('ERB'); this.erb = s; s.cl2.tau = 1200; /* analyzer downstream of reservoir inlet: slower response (ESTIMATE) */ sim.zones.get('W4').level = 48; sim.zones.get('W4').demandMult = 1.1;
    },
    tick(sim) {
      const s = this.erb;
      if (!this.failed && at(sim, this.t0, 3 * 60e3)) { this.failed = true; s.cl2.fault.A = true; this.failT = sim.time.getTime(); }
      const a = sim.alarms.list.get('ERB:meter'); if (a?.acked && !this.ackT) this.ackT = a.ackT;
      if (s.interlock) this.ilk = true;
      if (this.failed && !this.fixedT && s.cl2.duty === 'B' && s.cl2.res >= 1.0 && s.flowOut > 0) this.fixedT = sim.time.getTime();
    },
    objectives: [
      { text: 'Acknowledge the metering pump / low residual alarm', eval: s => s.ackT ? 'pass' : 'pending' },
      { text: 'Switch NaOCl duty to standby pump B', eval: s => s.erb?.cl2.duty === 'B' ? 'pass' : 'pending' },
      { text: 'Residual back ≥ 1.0 mg/L with wells pumping within 45 min of the failure', eval: (s, sim) => s.fixedT ? (s.fixedT - s.failT <= 45 * 60e3 ? 'pass' : 'fail') : (s.failed && sim.time.getTime() - s.failT > 45 * 60e3 ? 'fail' : 'pending') },
      { text: '(Bonus) avoid the Cl₂ LOW-LOW interlock shutdown', eval: (s, sim) => s.ilk ? 'fail' : (s.fixedT ? 'pass' : 'pending') },
    ],
    hints: ['Faceplate → Erb Street → Chlorination block → Duty pump A/B.', 'If the site interlocked, press "Reset interlock" after the cause is fixed.', 'Free → combined: NH₄ is added at the reservoir inlet, so the analyzer reads total Cl₂.'],
  },
];

export function startScenario(sim, sc) {
  const [y, mo, d, h, mi] = sc.start;
  sim.time = new Date(y, mo, d, h, mi, 0); sim.day = sim.time.getDate();
  sim.scenario = sc; sc.setup(sim);
  sim.alarms.log(`SCENARIO START · ${sc.title}`);
}
export function scenarioStatus(sim) {
  const sc = sim.scenario; if (!sc) return null;
  return sc.objectives.map(o => ({ text: o.text, st: o.eval(sc, sim) }));
}
