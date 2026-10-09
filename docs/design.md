# Design — WR-WATER (v0.1 as built, and next phases)

## Stack (mirrors wwtp-na where cheap)
wwtp-na = Vite 6 + TypeScript + Three.js r170, HTML/CSS SCADA overlay, `src/sim/processModel.ts` (mass-balance-lite, diurnal factor, alarms array), `src/ui/scada.ts`, `src/data/plants.json` with `sources` and `estimated` flags, OSM bake script.
WR-WATER v0.1 deliberately ships **no build step** (plain ES modules + vendored Three r170 + import map) so it runs from `python3 -m http.server`. Same conventions: data file with per-field sources/estimate flags, sim class with `step(dt)`, SCADA overlay in HTML/CSS, simple 3D. Porting to Vite/TS later is mechanical (files are already modules).

## Screens
1. **Master board** — zone tiles; Mannheim/Grand River panel; all-site table grouped by zone (pump squares, flow, m³ today, clearwell, Cl₂, kW, $). Top KPI strip (system supply/demand, energy, chemicals, river flow) and TOU badge. Bottom alarm banner (newest unacked; ACK / ACK ALL / jump to faceplate).
2. **Faceplates** — site: pumps with HOA/RESET, clearwell, high-lift lead/lag, chlorination with duty/standby metering pumps, UV, interlock banner + reset, 24 h trends, alarms. Zone: storage, pressure, demand trend. Mannheim: intake/booster pumps, plant flow AUTO/MAN, coag/ozone/filtration with jar-test hint, FTW status.
3. **3D overview** — low-poly markers on real/approx coordinates, Region watermains by pressure zone, trunk ≥600 mm, raw mains, Waterloo zone outlines, rivers; beacons by status; click → faceplate.
4. **Alarms** (summary + journal), **Daily totals & cost** (rates/formulas visible), **Help/data** (provenance table, acronyms).

## Process models
- **Zone storage**: dV/dt = Σ supply − demand; level % of (in-ground storage from AWQR + estimated elevated tanks).
- **Demand**: Q = (2025 avg of member sites) × seasonal factor (2025 monthly/annual) × diurnal(h) (normalised to mean 1; AM peak 07:30, PM 19:30) × small noise × scenario multiplier.
- **Pressure** (placeholder): P = Pmin + (Pmax−Pmin)·level − 40·(Q/Qavg − 1) kPa; LO alarm 275 kPa.
- **Wells**: fixed-speed pumps, q = capacity (2025 peak raw L/s ÷ duty wells), P = ρgQH/η.
- **Well WTPs**: wells → clearwell (start/stop on CW level, stagger) → high lift (N−1 duty, staged on zone level); CW low holds HL; HiHi float stops wells.
- **Chlorine**: residual → max(0, dose − demand) with first-order lag (τ 7 min; 20 min where the analyzer is downstream of a reservoir); NH₄ sites report total Cl₂. LO/LOLO/HI alarms; LOLO 60 s → latched shutdown.
- **Mannheim**: river flow = monthly median (02GA048) + storm boost; raw NTU = 2 + 0.35·Q^1.15 (est); PACl requirement = 10 + 0.3·NTU; filtered NTU = 0.05 + 0.03·loading² + 2.5·deficit^1.5·√(raw/50); FTW interlock; plant flow AUTO P-control on K4M level (150–625 L/s); ASR/RCW recovered water blends into clearwells; transfer to Mannheim PS on clearwell level.
- **Costs**: kWh × (OEB TOU commodity + 4 ¢ adder est.); NaOCl L = dose·Q/1000/0.12; (NH₄)₂SO₄ from Cl₂:N 4.5; PACl/polymer/LOX/H₂O₂/Cl₂ gas by dose × flow × unit price (all est).

## Scenarios (v0.1)
1. K25 well-pump trip at AM peak (Mannheim plant left in MAN) — ack, make up supply, reset after lock-out, keep K4M ≥ 55 %.
2. Grand River turbidity spike — raise PACl, avoid FTW, ≤ 30 min above 0.3 NTU.
3. Low Cl₂ at Erb Street — metering pump A loses prime; switch to B, restore ≥ 1.0 mg/L, avoid LOLO shutdown.

## Phased plan
- **v0.2**: power outage scenario (sites without standby power drop; generators at Middleton/Mannheim/township WTPs start after delay); main break (zone leak + pressure drop + isolate); per-site mini 3D scene (wellhouse/plant interior, P&ID-style); lead-pump rotation; operator log/handover sheet; save/load state.
- **v0.3**: Cambridge/Kitchener HGLs and real pressure zones, inter-zone transfers (Cam 1W rechloramination, Shingletown/Baden valves, Maryhill interconnect), simple EPANET-lite network hydraulics on trunk mains, DBP/water-age proxy, filter backwash cycle at Mannheim and greensand plants.
- **v0.4**: instructor console (inject faults live, grade), scenario editor, Class A/B electricity option (HOEP + GA, peak-demand avoidance), port to Vite/TS shared with wwtp-na.

## v0.2 design additions
- **Zones and transfers** (`data/network.js`, `js/sim.js`): per-zone mass balance in − out − demand. Each transfer is a PI controller holding the receiving zone (or, for K50, the sending zone) at a level setpoint: kp = V/180 L/s per %, ki = kp/2400, integral clamped to capacity, ramp 4 L/s/s. Modes AUTO/MAN/CLOSED. `capFrac` gives partial capacity and `isolated` gives zero. Pump-station kW = 9.81·Q·H/0.7.
- **Pressure (IUS)**: p = 9.81·(50 − drawdown − 6·(D/D̄)² + 4 − low-level penalty − leak/20) kPa, with drawdown = (100 − level)% × 8 m (tanked) or 20 m (closed zones).
- **Power**: each site has grid, generator and latch state, and the generator is shared between a site and its pump stations (billing deducts generator kW once). Feeders are scenario-defined with an inrush limit.
- **Filters**: solids += q·(0.5 + settled NTU)·dt; headloss ∝ solids/Sterm; breakthrough = 0.6·(e^((S−Sbt)/(0.12·Sbt)) − 1); at terminal headloss the filter delivers 50 %.
- **AOP**: orders = (kW/(m³/h))/EEO, EEO = 0.15·2.5·(1 + 3/H₂O₂); out = raw·10^−orders (τ = 600 s).
- **Billing**: Class A = OZP + 4 ¢ + PDF × GA(month) accrued per second; Class B = OZP + GA_B + 4 ¢; RPP = TOU or tiered + 4 ¢; diesel on generator. The peak tracker stores each hour's Class A kW.
- **Scenarios**: `setup / tick / objectives[]` plus optional `actions(sim)` (buttons in the scenario panel) and `decisionNote(sim)`. A PLC interlock now stops HAND pumps too.
