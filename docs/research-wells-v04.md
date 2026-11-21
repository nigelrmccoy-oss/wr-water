# WR Water v0.4 research — well records and master plans

Researched 21 November 2026 (America/Toronto) for the Region of Waterloo drinking-water SCADA trainer. This note only adds sources and proposed fields. It does not change `js/`, `data/` or `tests/` (those were being edited for the v0.4 OSM cache work at the same time).

Raw downloads and working extracts are in `research-raw/wells-v04/` (gitignored). Every fact below has a source URL.

## Sources used

### Ontario Water Well Records (MECP / WWIS)

| Source | URL | What it is | Date on the file |
|---|---|---|---|
| Map: Well records | https://www.ontario.ca/page/map-well-records | Interactive province-wide map of reported wells | Referenced by the 2026 metadata record |
| Well Records dataset | https://data.ontario.ca/dataset/well-records | Open Government Licence – Ontario catalogue page | Metadata modified 13 Aug 2026; data through 30 Jun 2026, published 31 Jul 2026 |
| WWIS – GIS Shapefile | https://files.ontario.ca/moe_mapping/downloads/2Water/Well_Records/WWIS_2026a.zip | Point shapefile: WELL_ID, completed date, depth (m), depth to bedrock (m), static level (m), NAD83 geographic coordinates | 30 Jul 2026 |
| Well Record Data Report (county CSVs) | https://files.ontario.ca/moe_mapping/downloads/2Water/Well_Records/WW_Reports_2026a.zip | Packed contractor-report extract. Waterloo county file used: `WATERLOO 20260730 115047.CSV` (29,595 records) | 30 Jul 2026 |
| WWIS – Microsoft Access | https://files.ontario.ca/moe_mapping/downloads/2Water/Well_Records/WWIS2_2026a.zip | Full Access database (1.6 GB uncompressed `.mdb`). Downloaded, not unpacked — only 9.8 GB free on the machine, and the shapefile plus county report already supplied depth, static level, screen, formation and pump-test fields | 30 Jul 2026 |
| Metadata record | https://files.ontario.ca/moe_mapping/downloads/metadata/opendata/Wells_Records_metadata_EN_2026a.pdf | Official limitations: locations and other fields can be wrong; the person who commissioned the well is confidential under FIPPA and is not in the open data | Date stamp 2 Jun 2026; prepared 8 Jul 2026 |
| Open Government Licence – Ontario | https://www.ontario.ca/page/open-government-licence-ontario | Licence for the WWIS extracts | — |

The shapefile is a point summary. The county “Data Report” CSV is the packed well-record form (township, UTM, casing diameter, water-found, pump test, well use, screen, well number/tag, formation log). Depths and pump-test numbers in that report are in the historical imperial convention (feet; rates treated here as Imperial gallons per minute). Shapefile `DEPTH` / `STATIC_LEV` / `DP_BEDROCK` are in metres. Official metadata warns that both location and other fields can be inaccurate.

**WELL USE codes** used in the Waterloo extract (classic MECP WWIS legend): MN municipal, PS public supply, DO domestic, MO monitoring, TH test hole, NU not used, ST livestock, CO commercial, IN industrial, IR irrigation, DE dewatering, OT other, AC air-conditioning/cooling. Code **MT** (2,062 rows) is not in that classic legend; those wells are almost all ~2-inch casing with almost no pump tests, so they were **not** treated as municipal production wells.

### Region of Waterloo master plans, annual reports, and related studies

There is **no final 2023/2024 Water Supply Master Plan**. The approved plan is still the 2015 update. A Water Supply Strategy update started in 2023 (horizon 2051); as of the 2025 year-end business-plan note, Stage 2 was complete and Stage 3 (identifying and screening alternatives) was ongoing.

| Source | URL |
|---|---|
| Reports and plans landing page | https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/reports-and-plans/ |
| Water Supply Strategy (update in progress) | https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/reports-and-plans/water-supply-strategy/ |
| 2015 Water Supply Master Plan Update | https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/sm0hgfzn/ws2015marchwatersupplymasterplan.pdf |
| 2015 Water Supply and Distribution Operations Master Plan (WSDOMP) | https://www.regionofwaterloo.ca/media/z3kb0tpm/ws2015wsanddistributionoperationsmasterplanfinalreport.pdf (also https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/kfnha1xm/ws2015wsanddistributionoperationsmasterplanfinalreport.pdf) |
| City of Waterloo Water Distribution Master Plan (2017) and Appendix 1 | https://www.waterloo.ca/media/ejodramb/water-distribution-master-plan-pdf-version.pdf ; https://www.waterloo.ca/media/lvadx2nl/water-distribution-master-plan-appendix-1.pdf |
| Cambridge Zone 1W Environmental Assessment (2017) | https://www.regionofwaterloo.ca/media/ty2hklw1/ws2017maycambridgezone1wenvironmentalassessmentfinalreport-aoda.pdf |
| Cambridge Pressure Zone 1 West project page | https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/projects/cambridge-pressure-zone-1-west/ |
| 2025 Water Summary Report | https://www.regionofwaterloo.ca/media/o2gdycy5/2025_annual_summary_report.pdf |
| 2025 Water Quality Report (AWQR) | https://www.regionofwaterloo.ca/media/ykjajvdl/2025-annual-water-quality-report.pdf |
| 2025 Water and Wastewater Monitoring Report | https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/dkdmkxvo/2025-water-and-wastewater-monitoring-report-final-s_access.pdf (2024 copy also at https://www.regionofwaterloo.ca/media/sm1dzkby/2024-water-and-wastewater-monitoring-report-final-s-access.pdf) |
| Note on IUS figures in the 2024/2025 WWMR | Same reports-and-plans page, citing Council report EES-WAS-26-001 (13 Jan 2026): IUS capacity figures in those WWMRs should not be used, pending a revised method for the Mannheim service-area constraint |
| Corporate Energy Plan 2019–2028 | https://www.regionofwaterloo.ca/media/bp3n0pmm/corporate-energy-plan-access.pdf |
| IESO Class A / ICI eligibility (background) | https://www.ieso.ca/en/Sector-Participants/Settlements/Global-Adjustment-Class-A-Eligibility |
| Waterloo pressure-zone GIS (HGLs) | https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_PressureZones/FeatureServer/0 |

### Grand River Source Protection Assessment Report (best named-well construction source)

These chapters name the Region’s production wells, aquifers and screen / open-hole intervals. They do **not** publish MECP/WWIS well numbers in the extracted text (those details, if present, are on map figures).

| Chapter | URL | File date in the PDF |
|---|---|---|
| Assessment Report index | https://www.sourcewater.ca/source-protection-areas/grand-river-source-protection-area/grand-river-assessment-report/ | — |
| 8.1 Water quality risk assessment | https://www.sourcewater.ca/media/cyqmrh1w/grspa_ar_ch081-water-quality-risk-assessment_v10.pdf | — |
| 8.2 Waterloo area wellfields | https://www.sourcewater.ca/media/afqjnxin/grspa_ar_ch082-waterloo-area-wellfields-waterloo_v8_s51.pdf | 1 Apr 2025 |
| 8.3–8.4 Kitchener area wellfields and Hidden Valley intake | https://www.sourcewater.ca/media/hpioecfp/grspa_ar_ch083-and-84-kitchener-area-wellfields-and-hidden-valley-intake-waterloo_v10.pdf | 29 Jul 2025 |
| 8.5 Cambridge area wellfields | https://www.sourcewater.ca/media/hg3l5xpw/grspa_ar_ch085-cambridge-area-wellfields-waterloo_v10.pdf | 29 Jul 2025 |
| 8.6 Rural area wellfields | https://www.sourcewater.ca/media/uf5h32rs/grspa_ar_ch086-rural-wellfields-waterloo_v8_s51.pdf | 1 Apr 2025 |
| 19 Region of Waterloo Tier 3 water budget | https://www.sourcewater.ca/media/3chc0v0k/grspa_ar_ch19_waterlootier-3_v9.pdf | — |

## How many sim wells were matched

The sim has **55 sites** and **111 wells** (`docs/inventory.md`, `data/inventory.csv`). Matching has two very different meanings.

### A. Named construction details (Source Protection chapters) — this is the useful match

These chapters name the Region well IDs the sim already uses (K21, W6C, G1, …) and give aquifer + screen or open-hole depth. **Most of the 111 wells are covered at wellfield range**, and a smaller set have per-well intervals (W10, W25, W5A, WY1, WY5, P16, P18, SC2/SC3 vs SC4). This is high-confidence for those attributes, because the documents name the wells.

WWIS IDs were **not** published next to those names in the extracted text, so this is not a WWIS-number match.

Details are tabulated in the next section and in `research-raw/proposed_well_updates.json`.

### B. Ontario WWIS records — almost no high-confidence 1:1 name match

Waterloo county extract: **29,595** well records; **757** coded municipal (MN) or public supply (PS), of which **737** have coordinates after joining the shapefile.

Municipal wells in WWIS are **not labelled** Strange Street, K21, Greenbrook, etc. The commissioning client is confidential. So a 1:1 assignment of a WWIS number to a sim well is not something the open data can honestly support in bulk.

Spatial comparison against the sim’s site coordinates (many of which are already marked `est`):

| Confidence | Sites | Meaning |
|---|---|---|
| High (named WWIS ID) | **0** | No official public table tying a WWIS number to a Region well name was found in the text sources |
| Medium-high | **2** (Greenbrook, Strange Street) | One production-like MN/PS well within 120 m of a site already marked `real` — still not a named 1:1 ID |
| Medium | **3** (K21, K21A, Ayr) | One production-like MN/PS well within 200 m, but the sim coordinate is estimated (or other candidates exist nearby) |
| Cluster | **8** (Middleton, Pinebush, Parkway, Mannheim WTP, Roseville, Maryhill Village Heights, Linwood, New Dundee) | Several production-like municipal wells around a plant; cannot uniquely assign well names from WWIS alone |
| Low | **18** | Nearby municipal/public wells, but several candidates or estimated coordinates |
| None | **24** | No convincing production well within 400 m. This includes **Erb Street** and **W10**, whose coordinates are already marked `real` — the nearest MN well is 410 m and 975 m away, so either the “real” point is the plant/reservoir rather than the wellhead, the production wells are not coded MN/PS, or the WWIS coordinates are off |

**Honest summary:** treat SPA aquifer/screen facts as ready to add. Treat WWIS rows as *candidate* construction records (depth, static level, screen, pump test, coordinates) that still need a human or a later official well-ID table before they replace sim coordinates.

Full candidate lists: `research-raw/wells-v04/wwis_site_matches.json` and `research-raw/wells-v04/wwis_waterloo_municipal_public.json`.

## Named well construction (Source Protection)

Intervals below are **metres below ground surface**. Where a chapter gives a wellfield range rather than a per-well screen, that is stated. Source for each row is the chapter URL in the table above.

### Waterloo / IUS (ch. 8.2)

| Wells | Aquifer / notes | Interval |
|---|---|---|
| Erb Street W6B, W7, W8, and replacement **W6C** (connected 2023). W6A is the problematic well W6C replaced | Middle Waterloo Moraine Sands (AFB2), underlain by Maryhill Till | Screens 32–56 m BGS (wellfield range) |
| W10 | Upper Waterloo Moraine Sands (AFB1). **GUDI** with effective filtration | Screen ~9–18 m BGS |
| W25 (Laurel, beside the Laurel Tank) | Pre-Catfish Creek Aquifer (AFD1) | Screen ~75–78 m BGS |
| W5A (not in the sim; treatment for W5A was deferred) | AFD1. Reconstructed from W5 in 2006; W5 taken off the IUS in 2000 | Screen ~34–39 m BGS |
| William Street overburden W1B, W2B, W2C (W2B/W2C replace W2/W2A). Wellfield paused in 2023 for upgrades; raw water is to be blended and treated at Strange Street. Upgrade planned for completion in 2025, then W2, W2A and W3 decommissioned. Historical W1C is mentioned; the sim carries W1B, W2B, W2C, W3A | AFB2 (Waterloo Moraine stratified sand and gravel), intermittently overlain by Middle Maryhill Till (ATB2) | Overburden screens ~27–34 m BGS |
| W3A (bedrock replacement for W3; W3 unused since 2002 because of highly mineralized water) | Bedrock (chapter does not give a numeric open-hole interval in the extracted paragraph) | — |

### Kitchener / Mannheim (ch. 8.3)

| Wells | Aquifer / notes | Interval |
|---|---|---|
| Mannheim East K21, K21A, K25, K29. K25 typically the largest contributor, then K29 and K21/K21A | All Mannheim production wells are in AFB2, most screens near the bottom just above Lower Maryhill Till (ATB3) | 30–52 m BGS |
| Mannheim peaking K91–K94. Historically summer peaking, typically one of K91/K92 and one of K93/K94 at a time | AFB2 | 54–75 m BGS |
| Mannheim West K23, K24, K26. **K22A is not listed as a current West production well** (the sim has K22A at 0 m³ in 2025) | AFB2; AFB1 and AFB2 are hydraulically connected near Mannheim West | 20–38 m BGS |
| ASR1–ASR5 (ASR5 was previously RCW1). Inject and recover treated Grand River water into AFB2; more water is injected than recovered on average | AFB2 | 52–80 m BGS |
| Recovery wells RCW2, RCW3, RCW4 (pumping only) | AFB2 | 62–73 m BGS |
| Greenbrook K1A, K2A, K4C, K5A, K8. K4C replaced K4B on the same property and has been added to the PTTW | Pre-Catfish Creek Aquifer (AFD1), under Maryhill and Catfish Creek Tills | 31–50 m BGS |
| Strange Street K10A, K11A, K13B, K18, K19. K13B replaced K13A and was connected in 2023 | AFB2, below a fine-grained aquitard, near the top of the Maryhill Till | 17–38 m BGS |
| Parkway K31, K32, K33 (each pumps at about the same rate, common reservoir). The sim’s Parkway site lists K31 and K33 only; K32 is still named in the 2025 assessment chapter. Parkway recorded 0 m³ in the 2025 Summary Report | AFD1, under Maryhill and Catfish Creek Tills | 24–34 m BGS |
| Strasburg K34, K36 (K34 is pumped more). This is the sim’s K34 WTP | AFD1 | 28–50 m BGS |
| Pompeii K72–K75. **Not a site in the current 55-site sim** | AFD1 in the Grand River valley | ~9–15 m BGS |
| Woolner K80, K81, K82 | AFD1, aquifer at or near ground surface | ~6–12 m BGS |
| Wilmot Centre / Shingletown K50, K51 (sim site K50) | AFB2 | 30–40 m BGS |

### Cambridge (ch. 8.5)

Clemens Mill in the assessment report is the sim’s **Turnbull** well group.

| Wells | Aquifer / notes | Interval |
|---|---|---|
| Hespeler H3, H3A, H4A, H5, H5A. H4 removed from service in 2017 | Gasport Formation bedrock; overburden is variable (AFB1/AFB2 near surface, then Maryhill and/or Catfish Creek Tills on bedrock) | Screens ~31–121 m BGS |
| Pinebush G5, G5A, P10A, P10B, P11, P17, P15/P15A, P9, P19 | Open hole in Guelph, Eramosa, Goat Island and Gasport bedrock | ~22–135 m BGS |
| Clemens Mill / Turnbull G6, G16, G17, G18, and **G19** (G19 is not on the sim’s Turnbull site) | Open hole in Guelph, Eramosa, Goat Island and Gasport bedrock | ~28–127 m BGS |
| Shades Mills G7, G8, G38, G39, plus **G40** built on the same property for operational redundancy (G40 is already in the sim) | Grand River Outwash Sediments Aquifer (AFA2) | 14–43 m BGS |
| Blair Road G4, G4A | Open hole in Guelph, Eramosa and Gasport bedrock | 31–83 m BGS |
| Elgin Street G9 | Open hole in Guelph and Eramosa bedrock | ~25–78 m BGS |
| Middleton G1, G1A, G2, G3, G14 (common reservoir, adjacent to the Grand River, only a couple of metres of outwash over bedrock). Middleton is designated **GUDI-EF** in ch. 8.1 | Open hole in Guelph, Eramosa and Gasport bedrock | ~29–60 m BGS |
| Willard G15 (in the sim as part of Middleton WTP) | Bedrock, thin gravel overburden | Open hole ~28–58 m BGS |
| Fountain Street P16; P18 (Maple Grove Rd., 2014 Class EA) is **not in the sim**. P16 recorded 0 m³ in 2025 | Both in AFD1, under a thick aquitard (Port Stanley, Lower Maryhill and Catfish Creek Tills) | P16 screen ~33–38 m; P18 ~43–53 m BGS |

### Rural systems (ch. 8.6)

| Wells | Aquifer / notes | Interval |
|---|---|---|
| Ayr A1, A2, A3 | AFD1 | Screens ~43–51 m BGS |
| Branchton Meadows BM1, BM2, BM3. Sim has BM2 and BM3 only; WHPAs were delineated from BM3 only | Dense sand-and-gravel conglomerate and Guelph Formation bedrock | Open hole ~29–34 m and ~39–47 m BGS (chapter wording is a combined wellfield description) |
| Elmira E10. **Not a supply site in the 55-site sim** (Elmira is served through the IUS) | AFD1 | Screen ~45–53 m BGS |
| Foxboro Green FG1, FG2A, FG4 | Open hole in the Salina bedrock aquifer | 47–67 m BGS |
| Heidelberg HD1, HD2. **Not in the sim** | AFD1 | Screens ~54–60 m BGS |
| Linwood L1A, L2 | Open hole in Bois Blanc / Salina bedrock | 64–80 m BGS |
| Maryhill MH1, MH2 and Maryhill Heights MH4A, MH5 (MH5 replaced MH3) | AFD1 sand and gravel | 18–33 m BGS |
| New Dundee ND4, ND5 | AFB2; AFB1 and AFB2 act as one aquifer here because ATB1 is absent | 14–16 m BGS |
| New Hamburg NH3, plus NH4 built on the same property for redundancy (no extra taking). “This production well is open hole…” is written after introducing both wells; treat 57–76 m as the NH3 (and likely NH4) interval pending a well-by-well table | Salina Formation bedrock | Open hole ~57–76 m BGS |
| Roseville R5, R6 | Lower Waterloo Moraine or Catfish Creek Till Outwash (AFB3) | Screens 48–52 m BGS |
| St. Clements SC2, SC3, SC4 | SC2/SC3 in AFB1; SC4 in AFB2 but hydraulically connected to AFB1 | SC2/SC3 15–20 m; SC4 ~30–37 m BGS |
| Wellesley WY1, WY5. Sim also lists **WY6**, which this paragraph does not name | WY1 in AFD1; WY5 in AFD1 plus ~3 m of dolostone bedrock | Both 45–54 m BGS |

**Not found as a named wellfield in these chapters:** Petersburg (PE1). **Not found with a screen interval:** Hidden Valley low-lift (surface intake, not a well).

## Open items

### Per-zone ground elevations (pressures labelled est.) — **not resolved**

No published table of typical ground elevation (m ASL) for Kitchener, Cambridge or Waterloo pressure zones was found in the 2015 WSMP, 2015 WSDOMP, 2017 Waterloo WDMP, or the 2017 Cam 1W EA text extracts. The WWIS shapefile also has **no ground-elevation field**.

Hydraulic grade lines were already compiled in v0.2 (`docs/network.md`). Those are HGLs, not ground elevations. Customer pressure still needs ground elevation: *p ≈ 9.81 kPa × (HGL − ground elev)*. Until zone ground elevations are published, simulated pressures should stay labelled **est.** even in zones whose HGL is real.

HGL status already on file (not new, listed here so the open item is not confused with HGL):

- **Real:** Wat 4 381, Wat 4B 401, Wat 4C 405, Wat 5 404.9, Wat 6 / Kit-Wat 6 427, Wat 7 446 m (City of Waterloo GIS / WDMP Table 1); Cam 1 operating ~330 m, target 332 m (WSDOMP §3.2.1, Cam 1W EA); Cam 1W target **337 m** (Cam 1W EA); Kit 2E / Cam 2W / Breslau South consolidated target **365 m**, Freeport ET TWL 364.6 m (WSDOMP §3.2.6, Table 7-1); Elmira 422 m / Elmira East 398.5 m; St. Jacobs 385 m; Breslau North 381 m.
- **Estimated from an adjacent real HGL or a tank TWL:** Kit 4 381 (set equal to Wat 4 because the interconnection has no pump); Kit 5 405 (≈ Wat 5); Cam 1A 335 (St Andrews ET 334.8 m); Cam 2E 359 (Pinebush ET 359.3 m); Cam 3 345; Kit 2EA / Kit 2W / Kit 4A / Bridgeport.
- Sources: `docs/network.md` and the WDMP / WSDOMP / Cam 1W / Waterloo GIS URLs above.

### Well locations — **only partly improved, and not for 1:1 WWIS IDs**

Six sim sites already have `locQuality: real`. WWIS can offer candidate wellhead coordinates near some of those plants (Greenbrook, Strange, Parkway, Middleton, Mannheim WTP) but not a named match. Erb Street and W10, both marked real, have no nearby MN/PS well in WWIS. Most other site coordinates should stay `est` until an official wellhead layer or a WWIS-ID table is published. Do not silently overwrite coordinates from this work.

### Pump heads — **not resolved**

The sim’s total dynamic heads in `data/facilities.js` (`assumptions.tdhM`) remain estimates. Master plans reviewed here do not publish pump curves or nameplate TDH. A WWIS pump test gives static and pumping water levels in the well (drawdown), not the lift to the discharge zone HGL. That lift would also need ground elevation in metres ASL, which the open shapefile does not have.

### Region Class A status — **partly resolved**; **2.5 MW share not found**

The Region’s *Corporate Energy Plan 2019–2028* (https://www.regionofwaterloo.ca/media/bp3n0pmm/corporate-energy-plan-access.pdf), section 2.1.9, says all Regional facilities were assessed for the Industrial Conservation Initiative after the LDC opt-in window opened at a peak demand above 1 MW and at most 5 MW.

Facilities the plan says had **already switched to Class A**:

- 2017/2018: Waterloo WWTP, Galt WWTP, **Hidden Valley Water Pumping Station** (annual savings then quoted as $140,000).
- 2018/2019: the same three, plus Kitchener WWTP.

**Mannheim WTP itself is not listed** as a Class A account in that plan. Hidden Valley is the raw-water pumping station for the Mannheim / Grand River intake, so at least one water-side account was Class A as of the 2018/2019 period.

What is still not public: the current (2026) Class A / Class B roster, any Peak Demand Factor, and any megawatt “share.” The **2.5 MW** figure used in earlier sim discussion was not found in the energy plan, the IESO eligibility page, or the water reports. Do not treat 2.5 MW as a documented Regional coincident-peak allocation.

### Cambridge 1W booster — **resolved as a real, official project; in-service date not confirmed**

The booster exists as designed infrastructure, not as a hypothetical:

- The 2017 EA (https://www.regionofwaterloo.ca/media/ty2hklw1/ws2017maycambridgezone1wenvironmentalassessmentfinalreport-aoda.pdf) recommends a booster pumping and chloramination station (BPCS) drawing from Cam 1, with a **target HGL of 337 m**, on Coronation Boulevard east of Groff Mill Creek / north of Cambridge Memorial Hospital.
- The Region’s project page, fetched 21 November 2026, lists **status: construction** (https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/projects/cambridge-pressure-zone-1-west/).
- The sim already has zone CAM1W (HGL 337 m, real target) and transfer `C1WBPS`, noted as “assumed in service for training – verify” in `docs/network.md`.

Until the Region publishes an in-service date, the honest label is **under construction / assumed in service for training**, not a confirmed 2025 operating facility.

## Notable WWIS spatial candidates (not named matches)

These are the closest *production-like* municipal/public records (casing typically ≥ 6 in, or a large pump test). Rates below assume the historical IGPM convention and should be checked before use. Coordinates come from the WWIS shapefile (NAD83) unless noted.

| Sim site | WWIS WELL_ID (tag) | Distance | Depth m | Static m | Pump-test m³/d if IGPM | Why it is only a candidate |
|---|---|---|---|---|---|---|
| Parkway (real coord) | 6506131 | 20 m | 140.2 | 22.6 | 1,434 | Very close to the plant, but Parkway has three wells and other MN wells sit 36 m and 95 m away (6500350, 6500292, the latter with a much larger test rate) |
| Middleton WTP (est coord) | 6500103 | 53 m | 51.8 | 2.1 | 11,784 (24-hour test at 1,800 IGPM) | Fits a large GUDI bedrock well next to the river; the plant has six wells, so the ID is not unique |
| Ayr WTP (est) | 6500003 | 60 m | 51.2 | — | 393 | One close well; two others within 500 m. SPA says Ayr screens 43–51 m, which is consistent with this depth |
| Strange Street (real) | 6500212 | 91 m | 83.8 | 9.8 | 2,265 | Close to a real site, but Strange/William is a wellfield ~1.6 km long (ch. 8.3) with several wells |
| Greenbrook (real) | 6500189 ; also 7285119 and 7381652 at 126 m | 113 m | 51.8 (6500189) | 12.8 | 314 ; neighbours ~4,600–5,200 | Greenbrook has five wells; 51.8 m depth sits at the deep end of the SPA 31–50 m screen range |
| K21 (est) | 6506792, with 6506789 and 6506791 nearby, all with ~4,321 m³/d test rates | 110 m | 75.3 | 17.7 | 4,321 | Looks like a Mannheim East/peaking cluster, not a unique K21 |

Do not use these IDs or coordinates as official well names in the running board.

## Proposed data patch

A machine-readable proposal (no files under `js/`, `data/` or `tests/` were edited):

`research-raw/proposed_well_updates.json`

Recommended use:

1. Add aquifer, screen or open-hole interval, GUDI flag and Source Protection citation to well or site records — these are the high-confidence additions.
2. Keep WWIS rows as optional “candidate record” attachments (WELL_ID, depth, static level, screen, pump test, coordinates) with the confidence tag from this note.
3. Do not overwrite `lat`/`lon` or `locQuality` automatically.
4. Label Cam 1W as under construction / assumed in service for training.
5. Document Class A as: some Regional accounts, including Hidden Valley Water PS, were Class A as of 2018/19; Mannheim WTP was not listed; PDF and any 2.5 MW share are unpublished.
6. Leave zone pressures and pump TDH labelled est.

## Working files on nigian

All under `/home/nig/wr-water/research-raw/wells-v04/` unless noted.

- This note: `/home/nig/wr-water/docs/research-wells-v04.md`
- Proposed patch: `/home/nig/wr-water/research-raw/proposed_well_updates.json`
- Waterloo county CSV, WWIS shapefile, Access zip, metadata PDF, Corporate Energy Plan PDF
- Source Protection PDFs and text extracts: `spa/`
- Matcher outputs: `wwis_waterloo_municipal_public.json`, `wwis_site_matches.json`, `match_wwis.log`
