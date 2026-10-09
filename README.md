# WR-WATER v0.1 — Region of Waterloo water supply SCADA trainer

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

## What's in v0.1

| Area | Contents |
|---|---|
| **Master board** | 15 zone tiles (storage %, demand vs supply L/s, modelled pressure kPa/psi, daily m³ and $), Mannheim WTP / Grand River panel, table of all **55 supply sites / 111 wells** with pump status squares, flow, today m³, clearwell %, Cl₂ residual, kW, $ today, interlocks and alarm badges |
| **Faceplates** | per-pump HAND/OFF/AUTO, RESET after trips (with motor cool-down lock-out), PLC lead/lag start/stop setpoints, clearwell setpoints, NaOCl dose + duty/standby metering pump, UV, interlock reset, 24 h trends (flow, level, Cl₂, turbidity), site alarm list with ACK. Zone faceplate with storage/demand trend. Mannheim: plant-flow AUTO/MAN, PACl, polymer, ozone, Cl₂ gas, jar-test hint, low-lift/booster pumps, clearwells |
| **PLC-ish logic** | level staging with stagger, 5-min min-run/min-off, clearwell low-level holds high lift, hardwired clearwell high float, Cl₂ LOW-LOW 60 s → latched site shutdown, UV low → shutdown, Mannheim filtered > 1 NTU for 2 min → filter-to-waste (auto return after 5 min < 0.3 NTU), alarm states active/RTN × acked/unacked (ISA-18.2 style), event journal |
| **Totals & cost** | running daily m³ / kWh / electricity $ / chemical $ per site and zone, yesterday's totals, ¢/m³; rates and formulas shown on the *Daily totals & cost* tab |
| **3D overview** | low-poly map in real coordinates: wellhouses, WTPs, ASR wells, reservoirs, towers, Hidden Valley intake, 1,654 Region-owned watermain segments (Kitchener + Waterloo open data) coloured by GIS pressure zone, trunk ≥600 mm highlighted, raw-water mains, Waterloo pressure-zone boundaries, rivers (OSM). Click a site → faceplate |
| **Scenarios** | (1) K25 well-pump trip at AM peak, (2) Grand River turbidity spike at Mannheim, (3) low chlorine residual at Erb Street (metering pump loses prime). Live objectives and score |
| **Clock** | starts Wed 15 Jul 2026 05:00; 1× / 10× / 60× / 300× / 900× / pause; OEB summer/winter TOU periods |

## Tests

```bash
node tests/soak.mjs 3            # 3 sim-days headless: zone levels stay in band, pump cycling, cost totals
node tests/scenario_noaction.mjs # each scenario must NOT pass when the trainee does nothing
python3 -m http.server 8765 &  node tests/smoke.mjs   # Playwright/Chromium: loads app, clicks views/faceplates, plays all 3 scenarios, asserts zero console errors; screenshots in tests/shots/
```
`tests/smoke.mjs` looks for Playwright in `./node_modules`, `~/wwtp-qa/harness/node_modules` or `~/qa-2026-10-08/pw/node_modules`.

## Data: real vs estimated

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
js/scenarios.js       3 training scenarios + objectives
js/ui.js              board, faceplates, alarms, costs, help
js/map3d.js           Three.js overview
data/facilities.js    generated dataset (sites, zones, storage, river, assumptions + source URLs)
data/*.geojson        watermains, pressure zones, rivers (open data)
data/raw/             source extracts (flows CSV, WSC river CSV, Kitchener facilities, geocodes, OSM)
data/inventory.csv    flat inventory
tools/build_data.py   rebuilds data/facilities.js from data/raw
tools/make_inventory.py → docs/inventory.md + data/inventory.csv
docs/research.md · docs/design.md · docs/inventory.md
tests/                soak, scenario, browser smoke tests
```

## Attribution
OpenStreetMap data © OpenStreetMap contributors (ODbL). City of Kitchener and City of Waterloo open data (used under each city's open-data licence – verify terms before redistribution). Water Survey of Canada data, Environment and Climate Change Canada. Three.js © three.js authors (MIT).
