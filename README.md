# WR-WATER v0.3 — Region of Waterloo water supply SCADA trainer

Browser training simulator of the **Region of Waterloo municipal water supply** (Integrated Urban System + township systems) for new water technicians.
Sister project to [`wwtp-na`](https://github.com/nigelrmccoy-oss/wwtp-na). **Unofficial**: not affiliated with or validated by the Region of Waterloo. Training use only; never use for real operating decisions.

## Run

No build step. Any static HTTP server works (ES modules + `fetch` don't load over `file://`):

```bash
cd ~/wr-water
python3 -m http.server 8765
# open http://localhost:8765/
```

Three.js r170 is vendored in `vendor/` (copied from wwtp-na's node_modules, MIT, see `vendor/three-LICENSE`), so the app works offline.

## What's new in v0.3 (QA fixes, Oct 2026)

| Area | Change |
|---|---|
| **Smoke test (P1)** | The outage-scenario restart clicks in `tests/smoke.mjs` were spaced by wall-clock time (1.6 s ≈ 48 sim-s at 30×). On slower frames that let 3–4 restarts land inside the 2-min inrush window, which re-tripped the feeder, so the result depended on frame rate. Restarts are now spaced ≥ 65 **sim**-seconds apart, and the test asserts 0 inrush re-trips. |
| **ICI exercise (P1)** | New objectives: Kit 4 never below 40 % and Kit 5/6 and Wat 4 ≥ 25 % through the evening peak; recovered by 22:00 (Kit 4 ≥ 50 %, Kit 5/6 ≥ 45 %); no overflow while pre-filling. A full shutdown now fails (`tests/scenario_exploits.mjs`). Hardwired high-level cut-outs (altitude valve / high float at 98.5–99.5 %) stop transfers and wells, so pre-filling can't overflow Kit 5. |
| **Mass balance (P1)** | Zones and clearwells used to *clamp* level at 0/100 %, which silently created or destroyed water (overflow, emptied reservoirs, high-lift pumps drawing an empty clearwell). Overflow and unserved demand are now accounted, and pumps can't draw more than a clearwell holds. `tests/mass_balance.mjs` asserts in = delivered + overflow + waste + Δstorage within 0.5 % for free play (24 h) and every scenario; it measures 0.000 %. |
| **Header total** | "Delivered today / since HH:MM" = Σ zone delivered m³. It resets at sim midnight; after a scenario start it says since when. |
| **Layout** | The scenario panel docks as a left sidebar and the content shifts right, so it no longer covers Costs or Help. A "Scenario ▸" tab brings it back when hidden. |
| **Pressures** | Each IUS zone has an estimated customer service depth (50–64 m below HGL; Wat 4 50 m), so zone pressures range ≈420–580 kPa instead of all ≈450 kPa (ESTIMATE). |
| **Turbidity** | Coagulant optimum window: under-dose fails, and an overdose > 1.6× the jar test restabilises (new OVERDOSED alarm). Floc carry-over rises with settled NTU × filter loading. Filters load ≈4× faster at high settled turbidity (more washes, earlier breakthrough). At 94 NTU raw, a correct dose alone at full flow now scores only ≈89 % of readings ≤ 0.3 NTU; the trainee must also cut plant flow. Default PACl changed 22 → 15 mg/L (22 was an overdose for 6 NTU raw). The turbidity scenario is scored by the real rule: ≥ 95 % of 15-min readings ≤ 0.3 NTU and none > 1 NTU. |
| **Save / resume** | 💾 Save / ⟲ Resume buttons (localStorage, autosave every minute and on page close). This covers the full dynamic state, alarms, journal and scenario progress; trends restart empty. `tests/save_resume.mjs` proves a restored run evolves identically. |
| **Electricity teaching** | The Costs tab shows the trainee's Mannheim load in each real 2026 top-5 hour, the projected next-year PDF and the next-year Class A GA vs the 2.5 MW baseline, with the saving or cost in $/yr. The ICI scenario note shows it live. Class B is now defined as "not Class A and not RPP" (RPP eligibility approximated as < 50 kW, est). |
| **Help** | New "Training simplifications" section: the 95 %-of-measurements turbidity rule; the main-break Category 2 / reportability answer flagged as **needing expert review**; how peak avoidance shows up in cost. |
| **Zip** | Now includes `tests/shots/` (the screenshots from the last smoke run). |

## What's new in v0.2 (Oct 2026)

| Area | Change |
|---|---|
| **Real IUS pressure zones** | The 5 invented IUS zones are replaced by **22 real pressure zones** (Kit 4/5/6, Kit 2E/2EA/2W/4A, Bridgeport, Wat 4/4B/4C/5/7, Cam 1/1A/1W/2E/2W/3, Elmira, St. Jacobs, Breslau) plus the Mannheim reservoir as a supply node, and **30 real transfers / boosters / PRVs / control valves** (Mannheim Zone 4/5/6 PS, K50 → Mannheim (87 L/s Wilmot Agreement), Hallman Rd MV2/MV3, Erb St BV and PRV, Northfield and Lakeshore PS, Zone 7 PS, Bleams Rd PRV, Manitou PRV (normally closed), Kress Hill PRV, Cam 1W BPS, Dundee Rd PRV …). Every number is tagged real/estimate with its source: see **[docs/network.md](docs/network.md)** (generated) and `data/network.js`. New **Transfers** tab: AUTO / MAN / CLOSED, level setpoint, manual flow. Zone faceplates show transfers in and out. Closed zones (no floating storage) are drawn as supply-balance proxies. |
| **Power** | Utility feeders, standby generators (ATS: 20 s start, 5 min retransfer, 5 min cool-down, fail-to-start fault), power-fail restart latches, and feeder **inrush protection** (more than 3 motor restarts within 2 min re-trips the feeder). A site on its generator runs at generator kW ÷ connected kW. |
| **Mannheim filters** | 4 filters (media from CWWA 2022): solids loading, headloss, turbidity breakthrough, declining rate at terminal headloss, backwash sequence DRAIN → AIR SCOUR → BACKWASH → RINSE → FILTER-TO-WASTE, one wash at a time, minimum 2 in service, PLC auto-initiate (can be switched off), "skip FTW" with a ripening spike. |
| **Greenbrook AOP** | UV/H₂O₂ for 1,4-dioxane: per-well raw concentration blend, log removal = (kWh/m³)/EEO, 10-min response, HIGH alarm at 25 µg/L (est), MAC 50 µg/L alarm, and a plant interlock when the MAC is exceeded for 2 min. |
| **Electricity** | **Class A** (Mannheim complex): HOEP/OZP + PDF × monthly GA. **Class B** (≥ 50 kW connected): OZP + Class B GA rate. **RPP** small sites: TOU or tiered (selectable). Diesel on generator. Real 2026 Ontario hourly demand, the ICI top-5 tracker, day-ahead OZP and monthly GA from IESO. **IESO-style peak alert** (header badge + alarm) with the HE window, recording of Class A load in the real 2026 top-5 hours and in alert hours, and the $/MW value of avoiding a peak. All rates and formulas appear on the *Daily totals & cost* tab. |
| **Scenarios** | 5 new scenarios: **power outage** (generator fails to start, staggered restart), **main break** (isolation, make-up supply, Category 1/2 / MOH + SAC boil-water decision), **Mannheim filter backwash**, **Greenbrook 1,4-dioxane**, and an **ICI peak day** (real 14 Jul 2026). The 3 v0.1 scenarios are ported to the real zones (the trip scenario is now Strange St HL-1 into Kit 4). Scenarios can add field-action and decision buttons to the scenario panel. |
| **Tests** | `scenario_action.mjs` (a scripted "good operator" passes every scenario), extended `scenario_noaction.mjs` (every scenario fails at least one objective with no action), a 3-day soak, and a Playwright smoke test that plays 6 scenarios through the UI. `tests/run_node_tests.sh` runs the Node tests in parallel. |

## Scenarios

| id | Title | What the trainee must do | How it fails with no action |
|---|---|---|---|
| trip | High-lift pump trip at morning peak (Strange St) | ACK within 5 min, start Parkway/Woolner standby wells, reset HL-1 after the lock-out, Kit 4 ≥ 40 % | Kit 4 falls to ≈37 % |
| turb | Grand River turbidity spike | Follow the jar test (don't overdose), cut plant flow, no filter-to-waste, ≥ 95 % of 15-min readings ≤ 0.3 NTU, none > 1 | FTW interlock; filtered 3 NTU |
| cl2 | Low Cl₂ – Erb St | ACK, duty pump B, residual ≥ 1.0 in 45 min | LOW-LOW interlock |
| outage | Mannheim feeder outage, generator fails to start | Reset the generator fault and restart Mannheim on the generator within 20 min, keep Kit 4/5/6 ≥ 30 %, after restoration restart all 16 latched sites within 60 min without an inrush re-trip, retransfer within 30 min | Kit 4/5/6 drain to 0 %; 16 sites stay latched |
| mainbreak | Transmission main break into Wat 4 | Dispatch crew, isolate within 60 min, make up supply (Erb St BV/PRV, wells), Wat 4 ≥ 30 % and ≥ 140 kPa, correct notification decision | Wat 4 drains to 0 %, pressure 0 |
| backwash | Mannheim filter backwash (PLC auto-backwash off) | Wash F2 (breakthrough) first, before it reaches 0.5 NTU; wash F1 (terminal headloss) within 3 h; never skip FTW | F2 reaches 1.2 NTU; F1 never washed |
| dioxane | Greenbrook 1,4-dioxane plume at K5A (hypothetical) | ACK, raise UV/H₂O₂ and/or take K5A out, stay ≤ MAC and ≤ 25 µg/L, keep Greenbrook ≥ 35 L/s average | Effluent 52 µg/L, interlock, plant down |
| icipeak | ICI peak day 14 Jul 2026 | Pre-fill Kit 4 ≥ 76 % by 14:00 without overflow, average Class A load ≤ 1,000 kW 14:00–18:00, Kit 4 ≥ 40 % through the evening, recovered by 22:00 | Class A averages ≈1.8 MW; a full shutdown fails the evening/recovery objectives |

## What was in v0.1 (still there)

| Area | Contents |
|---|---|
| **Master board** | zone tiles (v0.2: 22 IUS zones grouped by municipality + 10 township systems) (storage %, demand vs supply L/s, modelled pressure kPa/psi, daily m³ and $), Mannheim WTP / Grand River panel, table of all **55 supply sites / 111 wells** with pump status squares, flow, today m³, clearwell %, Cl₂ residual, kW, $ today, interlocks and alarm badges |
| **Faceplates** | per-pump HAND/OFF/AUTO, RESET after trips (with motor cool-down lock-out), PLC lead/lag start/stop setpoints, clearwell setpoints, NaOCl dose + duty/standby metering pump, UV, interlock reset, 24 h trends (flow, level, Cl₂, turbidity), site alarm list with ACK. Zone faceplate with storage/demand trend. Mannheim: plant-flow AUTO/MAN, PACl, polymer, ozone, Cl₂ gas, jar-test hint, low-lift/booster pumps, clearwells |
| **PLC-ish logic** | level staging with stagger, 5-min min-run/min-off, clearwell low-level holds high lift, hardwired clearwell high float, Cl₂ LOW-LOW 60 s → latched site shutdown, UV low → shutdown, Mannheim filtered > 1 NTU for 2 min → filter-to-waste (auto return after 5 min < 0.3 NTU), alarm states active/RTN × acked/unacked (ISA-18.2 style), event journal |
| **Totals & cost** | running daily m³ / kWh / electricity $ / chemical $ per site and zone, yesterday's totals, ¢/m³; rates and formulas shown on the *Daily totals & cost* tab |
| **3D overview** | low-poly map in real coordinates: wellhouses, WTPs, ASR wells, reservoirs, towers, Hidden Valley intake, 1,654 Region-owned watermain segments (Kitchener + Waterloo open data) coloured by GIS pressure zone, trunk ≥600 mm highlighted, raw-water mains, Waterloo pressure-zone boundaries, rivers (OSM). Click a site → faceplate |
| **Scenarios** | v0.1 had 3 (well trip, turbidity, low Cl₂) – see the v0.2 table above |
| **Clock** | v0.2 starts Tue 14 Jul 2026 05:00 (a real 2026 ICI peak day); 1× / 10× / 60× / 300× / 900× / pause; OEB summer/winter TOU periods |

## Tests

```bash
./tests/run_node_tests.sh        # runs all Node tests in parallel (≈60 s): no-action, action, soak, mass balance, ICI exploit, save/resume; logs in tests/out/
node tests/mass_balance.mjs      # water in = delivered + overflow + waste + Δstorage within 0.5 % (free play + every scenario)
node tests/scenario_exploits.mjs # ICI full-shutdown must fail; aggressive pre-fill must not overflow
node tests/save_resume.mjs       # save → restore round trip evolves identically
node tests/soak.mjs 3            # 3 sim-days headless: no NaN, open zones stay > 20 %, pressure ≥ 275 kPa, filters wash, AOP, Class A/peak records
node tests/scenario_noaction.mjs # every scenario must FAIL at least one objective when the trainee does nothing
node tests/scenario_action.mjs   # a scripted good operator must pass every objective of every scenario
python3 -m http.server 8765 &  node tests/smoke.mjs   # (HEADED=1 SLOWMO=300 to watch it on the desktop) Playwright/Chromium: all tabs, faceplates (power, filters, AOP), transfers, costs/ICI, 3D map, plays 6 scenarios through the UI, asserts zero console errors; screenshots in tests/shots/
```
`tests/smoke.mjs` looks for Playwright in `./node_modules`, `$PLAYWRIGHT_PATH`, `~/wwtp-qa/harness/node_modules` or `~/qa-2026-10-08/pw/node_modules`.

## Data: real vs estimated (v0.2 additions)

Full per-zone and per-transfer tables: **[docs/network.md](docs/network.md)**. Electricity: `js/energy.js`, built from `data/raw/ieso/` by `tools/build_energy.py`.

**Sourced (public):**
- Pressure-zone names, which station feeds which zone, transfer directions, the normally-closed Manitou PRV, the Bleams Rd PRV, the Kit 2E/Cam 2W/Breslau 365 m consolidation, and Freeport ET TWL 364.6 m: *Water Supply Master Plan 2015* (`WSMP15`) and *Water Supply & Distribution Operations Master Plan 2015* (`WSDOMP15`), URLs in docs/network.md.
- Zone demand shares: WSMP 2015 Table 6-1, and *City of Waterloo Water Distribution Master Plan 2017* Table 2 for Waterloo zones (Wat 4 254, 4B 24, 4C 5, 5 57, 6 48, 7 < 1 L/s).
- HGLs (real for 13 of 22 zones): Waterloo zones from the City of Waterloo pressure-zone GIS and WDMP Table 1 (Wat 4 381, 4B 401, 4C 405, 5 404.9, 6 427, 7 446 m); Kit 2E 365, Cam 1 330, Cam 1W 337, Cam 2W 365, Elmira 422, St. Jacobs 385, Breslau 381 m from WSDOMP/WSMP/Cam 1W EA.
- K50 → Mannheim transfer capped at 87 L/s (1978 Wilmot Agreement, WSMP 2015 §2.2.1.2). Storage: Mannheim reservoir 101,347 m³, Kit 4 reservoirs (Greenbrook 9,940 + Parkway 14,269 + Strange 250) and Erb St 18,000 m³ (AWQR 2025).
- Mannheim filters 1–4 and their media: CWWA 2022 (Mutti) https://cwwa.ca/wp-content/uploads/NWWC2022_ppt/D2-Mutti.pdf
- Greenbrook 1,4-dioxane history (2004 shutdown, up to 285 µg/L, UV/H₂O₂ AOP): AWWA WQTC 2006 paper https://www.megastd.com/standards/awwa-wqtc64107-pdf; Health Canada MAC 50 µg/L https://www.canada.ca/en/health-canada/services/publications/healthy-living/guidelines-canadian-drinking-water-quality-guideline-1-4-dioxane.html; wells K1A/K2A/K4C/K5A/K8 (AWQR 2025).
- Main-break categories, the >1 pipe length → Category 2 rule, and reporting only when contaminated water may have reached users (Schedule 16, MOH + SAC; the MOH decides on any advisory): *Watermain Disinfection Procedure* (2020) https://files.ontario.ca/mecp-watermain-disinfection-procedure-august-1-2020-en-2021-02-23.pdf and O. Reg. 170/03 https://www.ontario.ca/laws/regulation/030170
- Electricity: OEB RPP TOU 9.8/15.7/20.3 ¢ and tiered 12.0/14.2 ¢ (750 kWh/month non-residential threshold), effective Nov 1 2025 (https://oeb.ca/sites/default/files/rpp-price-report-20251017.pdf). IESO monthly GA (total $ and Class B rate) Oct 2025 – Sep 2026 (https://reports-public.ieso.ca/public/GlobalAdjustment/), 2025-26 base-period top-5 peaks used for the PDF (https://www.ieso.ca/sector-participants/settlements/global-adjustment-and-peak-demand-factor), 2026 hourly Ontario demand (https://reports-public.ieso.ca/public/Demand/PUB_Demand_2026.csv), 2026 ICI peak tracker (https://reports-public.ieso.ca/public/ICIPeakTracker/PUB_ICIPeakTracker_2026.xml), day-ahead Ontario zonal price for 10–31 Jul 2026 (https://reports-public.ieso.ca/public/DAHourlyOntarioZonalPrice/). Class A eligibility rules: https://www.ieso.ca/sector-participants/settlements/global-adjustment-class-a-eligibility

**Estimated (v0.2):**
- HGLs for Kit 4, Kit 5, Kit 2EA, Kit 2W, Kit 4A, Bridgeport, Cam 1A, Cam 2E and Cam 3 (method noted per zone; Kit 4 is set to the Wat 4 value because the zones connect through MV3 without pumping). Storage volumes other than the three listed above. Every transfer capacity except K50 (87 L/s), plus pump counts, heads and AUTO setpoints. The Shades Mill → Cam 3 and Bridgeport feed directions. **The Cam 1W booster PS is assumed to be in service**: the 2017 EA recommended it; whether it was built is not verified.
- Pressure model for IUS zones: HGL − storage drawdown (8 m tanked zones, 20 m closed zones) − demand headloss − main-break loss; the 140 kPa (20 psi) intrusion trigger is an industry convention used as a training rule, not a Regional or provincial number.
- Power: feeder groupings, generator sizes (Mannheim ≈ 55 % of connected kW, others 100 %), ATS timings, inrush limit, diesel $0.47/kWh.
- Mannheim filters: 190 L/s each, terminal headloss 2.4 m, breakthrough volume, wash step durations, 300 L/s backwash rate.
- Greenbrook AOP: per-well raw concentrations, EEO 0.15 kWh/m³/order × 2.5 scavenging, UV 280 kW max, H₂O₂ response; the 25 µg/L operating alarm; the K5A plume in the scenario is hypothetical.
- Electricity: **Mannheim complex as Class A and the 2.5 MW assumed peak contribution (PDF) are assumptions** (the Region's real class and PDF are not public); the ≥ 50 kW → Class B rule; the 4 ¢/kWh delivery adder; the peak-alert rule (alert when today's real Ontario peak ≥ 97 % of the 5th-highest 2026 peak so far; window HE peak−2 to peak+1). July 1–9 2026 OZP falls back to the July average hourly profile.

## Data: real vs estimated (v0.1 base data)

**Sourced (public):**
- Wells per site, treatment trains, chemicals used, clearwell/reservoir volumes, high-lift pump counts, standby power — *2025 Annual Water Quality Report*: https://www.regionofwaterloo.ca/media/ykjajvdl/2025-annual-water-quality-report.pdf
- 2025 monthly average daily treated volumes, max day, raw peak flow and MDWL Schedule C flow limits for every site — *2025 Water and Wastewater Operations Summary Report*, Appendix C: https://www.regionofwaterloo.ca/media/o2gdycy5/2025_annual_summary_report.pdf (parsed into `data/raw/2025_facility_flows.csv`)
- IUS 2024 avg day 152,167 m³/d, max week 183,216 m³/d — https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/dkdmkxvo/2025-water-and-wastewater-monitoring-report-final-s_access.pdf
- IUS inventory: 336 km trunk mains, 10 elevated tanks, 7 in-ground reservoirs, 9 top-up chlorination facilities (AWQR above)
- Mannheim WTP available capacity 475 L/s sustainable / 625 L/s peak (plate-settler limit) — Water Supply Peer Review, App. B: https://pub-regionofwaterloo.escribemeetings.com/filestream.ashx?DocumentId=15483 (figure taken from the search-engine excerpt; PDF sits behind a bot check)
- Grand River near Doon, WSC station **02GA048**, daily discharge 2015–2025 → monthly P10/median/P90 — https://api.weather.gc.ca/collections/hydrometric-daily-mean/items?STATION_NUMBER=02GA048
- Coordinates of Mannheim WTP, Hidden Valley intake, Greenbrook, Parkway, Strange St, Freeport tower, Mannheim recharge facility — City of Kitchener open data: https://services1.arcgis.com/qAo1OsXi67t7XgmS/ArcGIS/rest/services/Drinking_Water_WFL1/FeatureServer/0 ; Erb St reservoir & W10 — OpenStreetMap (ODbL)
- Region-owned watermains — Kitchener `Water_Mains` (OWNERSHIP = REGION / DUAL) https://services1.arcgis.com/qAo1OsXi67t7XgmS/ArcGIS/rest/services/Water_Mains/FeatureServer/0 and Waterloo `Water_Distribution_Mains` (OWNER = Region / Shared) https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_Distribution_Mains/FeatureServer/0
- Waterloo pressure zones with HGL — https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_PressureZones/FeatureServer/0
- Electricity TOU 9.8 / 15.7 / 20.3 ¢/kWh (Nov 1 2025) — https://www.oeb.ca/consumer-information-and-protection/electricity-rates
- Filtered turbidity ≤ 0.3 NTU in 95 % of measurements — https://www.ontario.ca/page/procedure-disinfection-drinking-water-ontario ; distribution residual minimums 0.05 free / 0.25 combined — O. Reg. 170/03 https://www.ontario.ca/laws/regulation/030170
- 2026 wholesale water rate $1.3386/m³ (context) — https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/drinking-water-supply/pay-my-water-bill/

**Estimated (training assumptions — all in `data/facilities.js → assumptions`, flagged `est` in the UI):**
- **Locations** of 49 of 55 sites (placed near the community / street centroid from Nominatim; Mannheim-area wells scattered around the WTP)
- **Zone grouping** (15 training zones) and zone demand = sum of member sites' 2025 average; diurnal curve shape; seasonal factor = 2025 monthly / annual ratio (derived from real data)
- Pump capacity per well (from 2025 peak raw flow ÷ wells, or 60 % of MDWL for sites with no 2025 production), heads (well 75 m, well→clearwell 40 m, high lift 65 m, Mannheim LL 15 m / booster 45 m / HL 70 m), wire-to-water efficiency 0.70, process energy (kWh/m³)
- Delivery adder 4 ¢/kWh on top of RPP commodity (real sites are Class A/B — not modelled)
- Chemical unit prices (NaOCl $0.45/L, ammonium sulphate 20 % $0.55/L, Cl₂ gas $3/kg, PACl $0.65/kg, polymer $4/kg, LOX $0.25/kg, H₂O₂ $1.20/kg), chlorine demands, Cl₂:N ratio 4.5
- Alarm limits (Cl₂ LO 0.8 / LOLO 0.5 / HI 3.5 mg/L, pressure LO 275 kPa, UV LO 40 mJ/cm²) except the regulatory ones above
- Pressure model (linear in storage level minus a headloss term), elevated-tank volumes (Freeport, Ira Needles, Pinebush, Elmira West, Waterloo Zone 6), river turbidity–flow curve, coagulation/filtration response
- Mannheim: 2 low-lift (count real) at 420 L/s each, 3 boosters (count real) at 315 L/s each; HVHL reservoir not modelled

## Layout

```
index.html            app shell (import map → vendor/three)
css/style.css
js/main.js            loop: sim substeps (≤5 s), UI refresh, 3D render
js/sim.js             process + PLC model, alarms, trends, energy/chem costs
js/scenarios.js       8 training scenarios + objectives/actions
js/energy.js          Ontario electricity: RPP, Class A/B, GA, OZP, ICI peaks
js/ui.js              board, faceplates, alarms, costs, help
js/map3d.js           Three.js overview
data/network.js       v0.2 IUS pressure zones, transfers, filters, AOP (real/est tagged)
data/ieso.js          generated from data/raw/ieso by tools/build_energy.py
data/facilities.js    generated dataset (sites, zones, storage, river, assumptions + source URLs)
data/*.geojson        watermains, pressure zones, rivers (open data)
data/raw/             source extracts (flows CSV, WSC river CSV, Kitchener facilities, geocodes, OSM)
data/inventory.csv    flat inventory
tools/build_energy.py rebuilds data/ieso.js · tools/make_network_md.mjs → docs/network.md
tools/build_data.py   rebuilds data/facilities.js from data/raw
tools/make_inventory.py → docs/inventory.md + data/inventory.csv
docs/research.md · docs/design.md · docs/inventory.md · docs/network.md
research-raw/         (local only, git-ignored, not in the zip) box research workspace: source PDFs/text, raw extracts
tests/                soak, scenario, browser smoke tests
```

## Attribution
OpenStreetMap data © OpenStreetMap contributors (ODbL). City of Kitchener and City of Waterloo open data (used under each city's open-data licence – verify terms before redistribution). Water Survey of Canada data, Environment and Climate Change Canada. Three.js © three.js authors (MIT).
