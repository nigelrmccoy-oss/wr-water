# Research notes — Region of Waterloo water supply (timeboxed, Oct 2026)

Full per-site tables: [inventory.md](inventory.md) (generated) and `data/inventory.csv`.

## Headline facts (sourced)
| Fact | Value | Source |
|---|---|---|
| IUS distribution | ~336 km trunk transmission mains, 10 elevated storage tanks, 7 in-ground reservoirs, 9 top-up chlorination facilities; local distribution owned by Cambridge, Kitchener, Waterloo, Wilmot, Woolwich | AWQR 2025 p.2 https://www.regionofwaterloo.ca/media/ykjajvdl/2025-annual-water-quality-report.pdf |
| Elevated tanks | 10 treated-water elevated tanks + 2 raw-water elevated tanks (named: Freeport, Ira Needles, Pinebush, Ayr, Howard, Waterloo Zone 6, Elmira West, Mannheim East raw tank; Cedar Creek under construction) | 2025 Summary Report p.15–16 https://www.regionofwaterloo.ca/media/o2gdycy5/2025_annual_summary_report.pdf |
| Disinfection strategy | Chloramine in Mannheim service area (NH4 added at Mannheim PS, Greenbrook, K34, Parkway, Strange, Erb, Laurel, W10); free chlorine in Cambridge/Middleton service area; rechloramination at Cam 1W transfer | AWQR 2025; Peer review excerpt https://pub-regionofwaterloo.escribemeetings.com/filestream.ashx?DocumentId=15483 |
| Mannheim WTP | Hidden Valley Low Lift (2 submersible pumps) → HVHL reservoir → 3 boosters → coag/floc/sedimentation (plate settlers), ozone, filtration, UV, Cl₂ gas → 2 clearwells 15,280 m³ → Mannheim PS reservoir 101,347 m³ (blends 8 wells K21 K21A K25 K29 K91–K94 + ASR1–5, RCW2–4; NH4 added). Chemicals: Cl₂ gas, 12 % NaOCl, PACl, polyelectrolyte, LOX/ozone, calcium thiosulphate, GAC, 20 % ammonium sulphate | AWQR 2025 |
| Grand River intake 2025 | avg 42,929 m³/d (≈497 L/s), max day 66,139 m³/d (Aug), raw peak 763 L/s, MDWL 72,576 m³/d | Summary Report App. C |
| Mannheim available capacity | revised 795 → 475 L/s sustainable, 625 L/s peak (plate-settler loading) | Peer review (excerpt) |
| IUS demand | 2024 avg day 152,167 m³/d; max week 183,216 (peak factor 1.20); IUS sustainable avg capacity 193,000, max 250,000 m³/d — **Region notes IUS figures in the 2024/2025 WWMR should not be used** pending revised methodology (Mannheim capacity constraint, report EES-WAS-26-001) | WWMR 2025 https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/dkdmkxvo/2025-water-and-wastewater-monitoring-report-final-s_access.pdf ; https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/reports-and-plans/ |
| Grand River gauge | 02GA048 Grand River near Doon (43.4128, −80.4170; 2,496 km²), active; 2015–2025 daily median 14.5 m³/s, mean 27.4, min 2.4, max 775; monthly medians Jul 11.3, Mar 33.2 | ECCC WSC API https://api.weather.gc.ca/collections/hydrometric-daily-mean/items?STATION_NUMBER=02GA048 |
| Other gauges | 02GA003 Grand River at Galt (active), 02GA006 Conestogo R. at St. Jacobs, 02GA047 Speed R. at Cambridge, 02GA024 Laurel Creek | https://api.weather.gc.ca/collections/hydrometric-stations/items?bbox=-80.6,43.3,-80.25,43.55 |
| Rates | 2026 wholesale water $1.3386/m³; retail (N. Dumfries, Wellesley) $3.65/m³ + $12/month | https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/drinking-water-supply/pay-my-water-bill/ |
| Electricity | OEB RPP TOU Nov 1 2025: 9.8 / 15.7 / 20.3 ¢/kWh | https://www.oeb.ca/consumer-information-and-protection/electricity-rates |
| Turbidity rule | filtered ≤ 0.3 NTU in 95 % of monthly measurements (chemically assisted filtration) | https://www.ontario.ca/page/procedure-disinfection-drinking-water-ontario |

## Counts (2025 reports)
- **55 supply sites** in the dataset (Summary Report flow tables) with **111 wells** (incl. 5 ASR + 3 RCW at Mannheim) + 1 surface intake. 6 sites recorded 0 m³ in 2025 (Parkway, Woolners, P16, K22A, ASR4, Maryhill WTP) → modelled as standby.
- **Treatment plants with clearwells**: Mannheim (surface), Middleton, Pinebush, Shades Mill, Turnbull, Greenbrook, K34, Parkway, Strange St, Laurel, New Hamburg, Ayr, Branchton, Roseville, Maryhill ×2, Linwood, St. Clements, Wellesley, Foxboro, New Dundee, Petersburg.
- **15 storage/tower/intake objects** placed on the map (in-ground volumes real, tower volumes estimated).
- **15 training zones** (5 IUS aggregations + 10 standalone township systems).

## Machine-readable endpoints found
| Dataset | Endpoint | Notes |
|---|---|---|
| Kitchener water facilities (WTPs, reservoirs, Freeport tower, Hidden Valley intake) | https://services1.arcgis.com/qAo1OsXi67t7XgmS/ArcGIS/rest/services/Drinking_Water_WFL1/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=geojson | 10 points → `data/raw/kitchener_water_plants_storage.geojson` |
| Kitchener watermains (fields PRESSURE_ZONE, PIPE_SIZE, OWNERSHIP, CATEGORY) | https://services1.arcgis.com/qAo1OsXi67t7XgmS/ArcGIS/rest/services/Water_Mains/FeatureServer/0 | filtered OWNERSHIP in (REGION, DUAL CITY AND REGION) → 1,301 segments |
| Waterloo watermains (OWNER, DIAMETER, PRESSURE_ZONE, RAW_WATER) | https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_Distribution_Mains/FeatureServer/0 | filtered OWNER Region/Shared → 353 segments |
| Waterloo pressure zones (ZONE, HGL, FUTUREHGL) | https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_PressureZones/FeatureServer/0 | Wat 4 (381 m), 4b (401), 4c (405), 5 (404.9), 6 (427), 7 (446) |
| Kitchener also publishes | Water_Hydrant, Water_Valve, Water_Main_Breaks, Water_Main_Break_Hot_Spots_WFL1, Water_Service_Pipes | same ArcGIS org, not downloaded |
| Grand River daily flow | WSC OGC API (CSV/GeoJSON) | `data/raw/grand_river_02GA048_daily_2015_2025.csv` |
| OSM | Overpass (rivers; water towers/works) | `data/osm_rivers.geojson`, `data/raw/osm_water_facilities.json` (sparse for water assets) |
| Region facility flows | PDF only | parsed to `data/raw/2025_facility_flows.csv` (Parkway/Strange St rows fixed manually in tools/build_data.py) |

## Not found / gaps (timeboxed)
- **No Region-of-Waterloo open layer of wells/facilities or Region pressure zones** was found; Cambridge watermains/pressure zones not located; township systems have no public GIS here. Well coordinates are therefore approximate except 6 sites.
- **Water Supply Master Plan / Distribution Master Plan** (listed at https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/reports-and-plans/) were not reviewed in this timebox; the 2025 Peer Review PDF is behind an eScribe bot check (figures used from the search excerpt).
- Pump nameplates/curves, TDH, HGL for Kitchener/Cambridge zones, tower volumes, real SCADA alarm setpoints, Region energy use and chemical spend: not published in the sources reviewed → estimated.
