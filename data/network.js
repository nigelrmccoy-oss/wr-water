/**
 * WR-WATER v0.2 – real pressure-zone network for the Integrated Urban System (IUS).
 * Hand-authored from public planning documents (see SRC). Every number carries a status:
 *   'real'  = taken from the cited document,   'est' = training estimate (method in note).
 * Township systems (Ayr, Wellesley, …) are separate real systems and keep their v0.1 definitions (data/facilities.js).
 */
export const SRC = {
  WSMP15: 'https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/sm0hgfzn/ws2015marchwatersupplymasterplan.pdf',
  WSDOMP15: 'https://media-003-ca.cdn.govstack.com/regionofwaterloo-018-ca/media/kfnha1xm/ws2015wsanddistributionoperationsmasterplanfinalreport.pdf',
  CAM1W: 'https://www.regionofwaterloo.ca/media/ty2hklw1/ws2017maycambridgezone1wenvironmentalassessmentfinalreport-aoda.pdf',
  WATWDMP: 'https://www.waterloo.ca/media/ejodramb/water-distribution-master-plan-pdf-version.pdf',
  WATPZ: 'https://services.arcgis.com/ZpeBVw5o1kjit7LT/arcgis/rest/services/Water_PressureZones/FeatureServer/0',
  MSA: 'https://www.regionofwaterloo.ca/programs-and-services/water-and-wastewater/mannheim-service-area-water-capacity-information-hub/timeline-of-solutions/',
  MUTTI: 'https://cwwa.ca/wp-content/uploads/NWWC2022_ppt/D2-Mutti.pdf',
  KITOP: 'https://pub-kitchener.escribemeetings.com/filestream.ashx?DocumentId=9059',
  AWWA06: 'https://www.megastd.com/standards/awwa-wqtc64107-pdf',
  HCDIOX: 'https://www.canada.ca/en/health-canada/services/publications/healthy-living/guidelines-canadian-drinking-water-quality-guideline-1-4-dioxane.html',
  WMDP: 'https://files.ontario.ca/mecp-watermain-disinfection-procedure-august-1-2020-en-2021-02-23.pdf',
  REG170: 'https://www.ontario.ca/laws/regulation/030170',
  AWQR25: 'https://www.regionofwaterloo.ca/media/ykjajvdl/2025-annual-water-quality-report.pdf',
};

const W = 'WSMP 2015 Table 6-1 (2031 zone demand, L/s)';
const WW = 'Waterloo WDMP 2017 Table 2 (existing zone demand, L/s)';
/** IUS pressure zones. weight = relative demand share (L/s in the cited table); the sim scales all weights so the IUS total
 *  equals 2025 actual IUS production (Summary Report App. C) – so absolute zone demands are ESTIMATES built on real shares. */
export const IUS_ZONES = [
  // ---- Mannheim reservoir: supply node, not a pressure zone
  { id: 'MANNR', name: 'Mannheim Reservoir (supply node)', muni: 'Kitchener', node: true, weight: 0, hgl: null,
    storageM3: 101347, storageName: 'Mannheim PS reservoir cells', storageSt: 'real', storageSrc: SRC.AWQR25,
    note: 'Treated Grand River water + Mannheim/Wilmot wells blend here (~2:1 surface:ground, WSMP 2015 §2.2.1.2) and is pumped out by the Mannheim Zone 4, 5 and 6 PSs (WSDOMP 2015 §1).' },
  // ---- Kitchener
  { id: 'KIT4', name: 'Kit 4 (central Kitchener)', muni: 'Kitchener', weight: 553, weightSrc: W + ' – KIT 4 550 + Mannheim Village 3',
    hgl: 381, hglSt: 'est', hglNote: 'not published; set equal to Wat 4 (381 m, City of Waterloo GIS) – the two zones are interconnected through MV3 / Erb St butterfly valve without pumping (WSDOMP §4.2.2)',
    storageM3: 24459, storageName: 'Greenbrook 9,940 + Parkway 14,269 + Strange St 250 m³ reservoirs', storageSt: 'real', storageSrc: SRC.AWQR25 },
  { id: 'KIT5', name: 'Kit 5', muni: 'Kitchener', weight: 110, weightSrc: W, hgl: 405, hglSt: 'est', hglNote: 'not published; ≈ Wat 5 (404.9 m) because MV2 transfers Kit 5 → Wat 5 by gravity (Waterloo WDMP §4.1)',
    storageM3: 4500, storageName: 'floating storage (volume not published)', storageSt: 'est' },
  { id: 'KIT6', name: 'Kit/Wat 6 (University ET)', muni: 'Kitchener/Waterloo', weight: 105, weightSrc: W + ' – "KIT/WAT Zone 6"', hgl: 427, hglSt: 'real', hglNote: 'Wat 6 HGL 427 m (Waterloo WDMP Table 1 / City GIS)',
    storageM3: 7500, storageName: 'University ET + Ira Needles ET (volumes not published)', storageSt: 'est' },
  { id: 'KIT2E', name: 'Kit 2E (Freeport)', muni: 'Kitchener', weight: 34, weightSrc: W, hgl: 365, hglSt: 'real', hglNote: 'target HGL 365 m for consolidated Kit 2E/Cam 2W/Breslau South (WSDOMP §3.2.6); Freeport ET TWL 364.6 m (WSDOMP Table 7-1)',
    storageM3: 4500, storageName: 'Freeport ET (volume not published)', storageSt: 'est' },
  { id: 'KIT2EA', name: 'Kit 2EA', muni: 'Kitchener', weight: 6, weightSrc: W, hgl: 375, hglSt: 'est', hglNote: 'not published', closed: true, storageM3: 250, storageName: 'closed zone (no floating storage)', storageSt: 'est' },
  { id: 'KIT2W', name: 'Kit 2W', muni: 'Kitchener', weight: 56, weightSrc: W, hgl: 370, hglSt: 'est', hglNote: 'not published', closed: true, storageM3: 1200, storageName: 'closed zone – capacitance only', storageSt: 'est' },
  { id: 'KIT4A', name: 'Kit 4A', muni: 'Kitchener', weight: 4, weightSrc: W, hgl: 365, hglSt: 'est', hglNote: 'PRV-fed from Wat 4; not published', closed: true, storageM3: 150, storageName: 'closed zone (PRV-fed)', storageSt: 'est' },
  { id: 'BRG', name: 'Bridgeport', muni: 'Kitchener', weight: 6, weightSrc: W, hgl: 365, hglSt: 'est', hglNote: 'PRV-fed; not published', closed: true, storageM3: 200, storageName: 'closed zone (Bridgeport PRV)', storageSt: 'est' },
  // ---- Waterloo (HGLs real: City of Waterloo WDMP Table 1 / City GIS pressure-zone layer)
  { id: 'WAT4', name: 'Wat 4 (Laurel)', muni: 'Waterloo', weight: 254, weightSrc: WW, hgl: 381, hglSt: 'real', storageM3: 6000, storageName: 'Laurel Tank (TWL 379.3 m, WSDOMP Table 7-1; volume not published)', storageSt: 'est' },
  { id: 'WAT4B', name: 'Wat 4B (Northfield PS)', muni: 'Waterloo', weight: 24, weightSrc: WW, hgl: 401, hglSt: 'real', closed: true, storageM3: 200, storageName: 'closed zone (boosted)', storageSt: 'est' },
  { id: 'WAT4C', name: 'Wat 4C (Lakeshore PS)', muni: 'Waterloo', weight: 5, weightSrc: WW, hgl: 405, hglSt: 'real', closed: true, storageM3: 100, storageName: 'closed zone (boosted)', storageSt: 'est' },
  { id: 'WAT5', name: 'Wat 5 (Erb St)', muni: 'Waterloo', weight: 57, weightSrc: WW, hgl: 404.9, hglSt: 'real', storageM3: 18000, storageName: 'Erb Street reservoir', storageSt: 'real', storageSrc: SRC.AWQR25 },
  { id: 'WAT7', name: 'Wat 7 (+St. Agatha)', muni: 'Waterloo', weight: 1.5, weightSrc: WW + ' (<1 L/s) + St. Agatha est', hgl: 446, hglSt: 'real', closed: true, storageM3: 60, storageName: 'closed zone (Zone 7 PS)', storageSt: 'est' },
  // ---- Cambridge
  { id: 'CAM1', name: 'Cam 1 (Middleton)', muni: 'Cambridge', weight: 138, weightSrc: W, hgl: 330, hglSt: 'real', hglNote: '"operating HGL typically closer to 330 mASL" (WSDOMP §3.2.1); target 332 m before Cam 1W (Cam 1W EA)',
    storageM3: 4500, storageName: 'Rahmans reservoir (TWL ≈329 m) – volume not published', storageSt: 'est' },
  { id: 'CAM1A', name: 'Cam 1A (St Andrews)', muni: 'Cambridge', weight: 35, weightSrc: W, hgl: 335, hglSt: 'est', hglNote: 'St Andrews ET high level 334.8 m (WSDOMP Table 7-1)', storageM3: 1500, storageName: 'St Andrews ET (volume not published)', storageSt: 'est' },
  { id: 'CAM1W', name: 'Cam 1W (Coronation BPS)', muni: 'Cambridge', weight: 87, weightSrc: W, hgl: 337, hglSt: 'real', hglNote: 'target HGL 337 m at the booster station (Cam 1W EA 2017)', closed: true, storageM3: 400, storageName: 'closed zone (booster-fed)', storageSt: 'est' },
  { id: 'CAM2E', name: 'Cam 2E (Turnbull/Hespeler)', muni: 'Cambridge', weight: 181, weightSrc: W, hgl: 359, hglSt: 'est', hglNote: 'Pinebush ET high level 359.3 m (WSDOMP Table 7-1) used as proxy',
    storageM3: 27300, storageName: 'Turnbull reservoir 22,800 (real) + Pinebush ET 4,500 (est)', storageSt: 'est' },
  { id: 'CAM2W', name: 'Cam 2W (Inverness)', muni: 'Cambridge', weight: 48, weightSrc: W, hgl: 365, hglSt: 'real', hglNote: 'consolidated target 365 m (WSDOMP §3.2.6); Inverness ET 362–365.9 m (Table 7-1)', storageM3: 2500, storageName: 'Inverness ET (volume not published)', storageSt: 'est' },
  { id: 'CAM3', name: 'Cam 3 (Blair Rd)', muni: 'Cambridge', weight: 42, weightSrc: W, hgl: 345, hglSt: 'est', hglNote: 'not published', closed: true, storageM3: 800, storageName: 'closed zone', storageSt: 'est' },
  // ---- Woolwich (IUS-fed)
  { id: 'ELM', name: 'Elmira (+Elmira East)', muni: 'Woolwich', weight: 40, weightSrc: W + ' – Elmira 31 + Elmira East 9', hgl: 422, hglSt: 'real', hglNote: 'Elmira target HGL 422 m feeding Elmira West ET; Elmira East 398.5 m via 4 PRVs (WSDOMP §6.2.1)',
    storageM3: 3800, storageName: 'Elmira West ET + Howard tank (volumes not published)', storageSt: 'est' },
  { id: 'STJ', name: 'St. Jacobs (+Market)', muni: 'Woolwich', weight: 8, weightSrc: W + ' – St Jacobs 6 + Market 2', hgl: 385, hglSt: 'real', hglNote: 'St Jacobs PRV target raised 380 → 385 m (WSDOMP §6.2.2)', storageM3: 2000, storageName: 'St. Jacobs reservoir (volume not published)', storageSt: 'est' },
  { id: 'BRE', name: 'Breslau (North + South)', muni: 'Woolwich', weight: 20, weightSrc: W + ' – Breslau N 9 + S 11', hgl: 381, hglSt: 'real', hglNote: 'Breslau North target 381 m; Breslau South joins the 365 m consolidated zone (WSDOMP §6.2.3, §3.2.6)', closed: true, storageM3: 300, storageName: 'closed zone (fed from Kit 4)', storageSt: 'est' },
];

/** which zone each supply site discharges to (v0.2). Basis: WSMP 2015 Tables 2-2, 2-4, 2-6; Waterloo WDMP 2017 §4.1. */
export const SITE_ZONE = {
  // Mannheim supply → Mannheim reservoir (WSMP Table 2-4 "Mannheim Supply")
  MWTP: 'MANNR', K21: 'MANNR', K21A: 'MANNR', K25: 'MANNR', K29: 'MANNR', K91: 'MANNR', K92: 'MANNR', K93: 'MANNR', K94: 'MANNR',
  K22A: 'MANNR', K23: 'MANNR', K24: 'MANNR', K26: 'MANNR', ASR1: 'MANNR', ASR2: 'MANNR', ASR3: 'MANNR', ASR4: 'MANNR', ASR5: 'MANNR', RCW2: 'MANNR', RCW3: 'MANNR', RCW4: 'MANNR',
  // Kit 4 well supplies (Table 2-4: Strange St, Greenbrook, Parkway, Strasburg K34/K36; Grand River wells = Woolner)
  STR: 'KIT4', GRB: 'KIT4', PKW: 'KIT4', K34: 'KIT4', WOO: 'KIT4',
  // Waterloo (WDMP: Erb St supply + W10 in Wat 5; Laurel in Wat 4)
  ERB: 'WAT5', W10: 'WAT5', LAU: 'WAT4',
  // Cambridge (Table 2-2)
  MID: 'CAM1', SHM: 'CAM1', G9: 'CAM1', P9: 'CAM1', P15: 'CAM1', G5: 'CAM1', PIN: 'CAM1', G4: 'CAM3', TUR: 'CAM2E', H3: 'CAM2E', H4: 'CAM2E', H5: 'CAM2E', P16: 'CAM2W',
};

/** Inter-zone transfers. kind: PS (pumped, kW), PRV, MTV (motorized throttle/control valve), CV (check valve, emergency).
 *  ctl 'down' = modulates to hold downstream storage at sp (%); 'up' = drains surplus to hold upstream at sp.
 *  cap = L/s capacity (ESTIMATE unless capSt 'real'); nP/pumpLs for pump stations. */
export const LINKS = [
  { id: 'Z4PS', name: 'Mannheim Zone 4 PS', kind: 'PS', from: 'MANNR', to: 'KIT4', nP: 4, cap: 900, sp: 72, headM: 70, site: 'MWTP', src: SRC.WSDOMP15, note: 'Common discharge header to Kit 4 (Ottawa St / Victoria St mains) – also feeds Wat 4 via MV3 (WSDOMP §4.2.2). Pump count/capacity est.' },
  { id: 'Z5PS', name: 'Mannheim Zone 5 PS', kind: 'PS', from: 'MANNR', to: 'KIT5', nP: 3, cap: 360, sp: 70, headM: 95, site: 'MWTP', src: SRC.WSMP15 },
  { id: 'Z6PS', name: 'Mannheim Zone 6 PS', kind: 'PS', from: 'MANNR', to: 'KIT6', nP: 3, cap: 300, sp: 70, headM: 118, site: 'MWTP', src: SRC.WSMP15 },
  { id: 'K50T', name: 'Shingletown K50 → Mannheim (Wilmot Agreement)', kind: 'MTV', from: 'NHB', to: 'MANNR', cap: 87, capSt: 'real', ctl: 'up', sp: 70, src: SRC.WSMP15, note: 'K50 transfer to IUS restricted to 87 L/s by the 1978 Wilmot Agreement (WSMP 2015 §2.2.1.2).' },
  { id: 'MV3', name: 'Hallman Rd MV3 (Kit 4 → Wat 4)', kind: 'MTV', from: 'KIT4', to: 'WAT4', cap: 260, sp: 72, src: SRC.WATWDMP, note: 'Primarily Mannheim water (Waterloo WDMP §4.1).' },
  { id: 'ERBBV', name: 'Erb St butterfly valve (Kit 4 → Wat 4)', kind: 'MTV', from: 'KIT4', to: 'WAT4', cap: 140, sp: 66, src: SRC.WATWDMP, note: 'Primarily Strange St water (Waterloo WDMP §4.1).' },
  { id: 'MV2', name: 'Hallman Rd MV2 (Kit 5 → Wat 5)', kind: 'MTV', from: 'KIT5', to: 'WAT5', cap: 90, sp: 55, src: SRC.WATWDMP, note: 'Flow limited by Kit 5 HGL changes (WSDOMP §5).' },
  { id: 'ERBPRV', name: 'Erb St PRV (Wat 5 → Wat 4, peak)', kind: 'PRV', from: 'WAT5', to: 'WAT4', cap: 110, sp: 62, src: SRC.WATWDMP, note: '"water from Wat 5 supplements Wat 4 during peak demand periods through the Erb Street PRV" (WDMP §4.1).' },
  { id: 'NFPS', name: 'Northfield PS (Laurel → Wat 4B)', kind: 'PS', from: 'WAT4', to: 'WAT4B', nP: 2, cap: 70, sp: 75, headM: 30, src: SRC.WATWDMP },
  { id: 'LSPS', name: 'Lakeshore PS (Laurel → Wat 4C)', kind: 'PS', from: 'WAT4', to: 'WAT4C', nP: 2, cap: 25, sp: 75, headM: 34, src: SRC.WATWDMP },
  { id: 'Z7PS', name: 'Zone 7 PS (Erb St → Wat 7/St. Agatha)', kind: 'PS', from: 'WAT5', to: 'WAT7', nP: 2, cap: 12, sp: 75, headM: 50, src: SRC.WATWDMP },
  { id: 'CV67', name: 'Wat 6 → Wat 7 check valve (emergency)', kind: 'CV', from: 'KIT6', to: 'WAT7', cap: 12, sp: 30, src: SRC.WATWDMP },
  { id: 'HAWK', name: 'Hawkswood/Falconridge PRVs (Wat 4 → Kit 4A)', kind: 'PRV', from: 'WAT4', to: 'KIT4A', cap: 20, sp: 75, src: SRC.WATWDMP },
  { id: 'STJM', name: 'Wat 4 → St. Jacobs reservoir (transmission main)', kind: 'MTV', from: 'WAT4', to: 'STJ', cap: 90, sp: 75, src: SRC.WATWDMP },
  { id: 'STJPS', name: 'St. Jacobs PS (→ Elmira)', kind: 'PS', from: 'STJ', to: 'ELM', nP: 2, cap: 85, sp: 72, headM: 45, src: SRC.WSDOMP15 },
  { id: 'BRGPRV', name: 'Bridgeport PRV', kind: 'PRV', from: 'WAT4', to: 'BRG', cap: 25, sp: 75, src: SRC.WSDOMP15, note: 'Feed direction ESTIMATED from WSDOMP Fig. 1-1 labels.' },
  { id: 'BRES', name: 'Kit 4 → Breslau (North–South CV)', kind: 'MTV', from: 'KIT4', to: 'BRE', cap: 45, sp: 75, src: SRC.WSDOMP15 },
  { id: 'BLEAMS', name: 'Bleams Rd PRV (Kit 5 → Kit 4)', kind: 'PRV', from: 'KIT5', to: 'KIT4', cap: 100, sp: 30, src: SRC.WSDOMP15, note: 'Labelled "Bleams Rd PRV (Kit 5 to Kit 4)" on WSDOMP Fig. 1-1; opens on low Kit 4 (setpoint est).' },
  { id: 'MANITOU', name: 'Manitou PRV (Kit 6 → Kit 5, NC)', kind: 'PRV', from: 'KIT6', to: 'KIT5', cap: 80, sp: 25, normallyClosed: true, src: SRC.WSDOMP15, note: 'Normally closed (WSDOMP Fig. 1-1). Operator may open in an emergency.' },
  { id: 'K2E', name: 'Kit 4 → Kit 2E PRVs', kind: 'PRV', from: 'KIT4', to: 'KIT2E', cap: 80, sp: 75, src: SRC.WSDOMP15 },
  { id: 'DEER', name: 'Deer Ridge PRV (Kit 4 → Kit 2EA)', kind: 'PRV', from: 'KIT4', to: 'KIT2EA', cap: 15, sp: 75, src: SRC.WSDOMP15 },
  { id: 'K2W', name: 'Kit 4 → Kit 2W PRVs', kind: 'PRV', from: 'KIT4', to: 'KIT2W', cap: 100, sp: 75, src: SRC.WSDOMP15 },
  { id: 'K4C2W', name: 'Kit 4 → Cam 2W connection', kind: 'MTV', from: 'KIT4', to: 'CAM2W', cap: 80, sp: 72, src: SRC.WSDOMP15, note: 'Kit 4 transfers to Cam 2W (WSDOMP §1, §3). Cam 2W PS (2031) not yet built (Region Mannheim Service Area hub).' },
  { id: 'BRIAR', name: 'Briardean MTV (Cam 2E → Cam 2W)', kind: 'MTV', from: 'CAM2E', to: 'CAM2W', cap: 60, sp: 55, src: SRC.WSDOMP15 },
  { id: 'MID2E', name: 'Middleton high-lift → Cam 2E', kind: 'PS', from: 'CAM1', to: 'CAM2E', nP: 3, cap: 200, sp: 70, headM: 40, site: 'MID', src: SRC.WSMP15, note: 'Middleton "capable and at times relied upon for transferring water to all but one pressure zone" (WSMP §2.2.1.1). Route/pumps est.' },
  { id: 'STAPS', name: 'St Andrews PS (Cam 1 → Cam 1A)', kind: 'PS', from: 'CAM1', to: 'CAM1A', nP: 2, cap: 60, sp: 75, headM: 18, src: SRC.WSDOMP15 },
  { id: 'C1WBPS', name: 'Cam 1W booster PS (Coronation Blvd)', kind: 'PS', from: 'CAM1', to: 'CAM1W', nP: 3, cap: 150, sp: 75, headM: 22, src: SRC.CAM1W, note: 'Recommended in the 2017 Cam 1W EA (target HGL 337 m, chloramination on site). Assumed in service for training – verify.' },
  { id: 'KRESS', name: 'Kress Hill PRV (Cam 2W → Cam 1)', kind: 'PRV', from: 'CAM2W', to: 'CAM1', cap: 60, sp: 40, src: SRC.CAM1W, note: 'Kress Hill PRV replaces Kress Hill PS (Cam 1W EA / WSDOMP §3.2.1).' },
  { id: 'SHM3', name: 'Shades Mill → Cam 3 (supply main)', kind: 'MTV', from: 'CAM1', to: 'CAM3', cap: 60, sp: 75, src: SRC.WSDOMP15, note: 'Route ESTIMATED (WSDOMP Table 3-6 discusses matching Shades Mill operation to Cam 3 HGL).' },
  { id: 'DUNDEE', name: 'Dundee Rd PRV (Kit 2W → Cam 1W, backup)', kind: 'PRV', from: 'KIT2W', to: 'CAM1W', cap: 30, sp: 25, normallyClosed: true, src: SRC.WSDOMP15, note: 'Emergency supply to Cam 1W (WSDOMP §3.2.1).' },
];

/** which old (v0.1) storage objects sit in which v0.2 zone – used by the 3D map only */
export const STORAGE_ZONE = { MPS: 'MANNR', MCW: 'MANNR', HVI: 'MANNR', ARF: 'MANNR', GBR: 'KIT4', PKR: 'KIT4', SSR: 'KIT4', FPT: 'KIT2E', ERR: 'WAT5', WZ6: 'KIT6', INT: 'KIT6', TBR: 'CAM2E', PBT: 'CAM2E', EWT: 'ELM', AYS: 'AYR' };

/** Wilmot: New Hamburg/Baden is fed by NH3/NH4 + K50 (K50 surplus → IUS ≤ 87 L/s). Demand ESTIMATE = NHW + K50 2025 avg − typical IUS transfer. */
export const NHB_IUS_TRANSFER_AVG_LS = 60; // est

/** Mannheim WTP filters: 4 filters (Filter 1–4; GAC/sand in F1–F2, anthracite/sand F3–F4) – CWWA NWWC 2022 (Mutti). Rates/areas est. */
export const MANN_FILTERS = {
  n: 4, media: ['GAC/sand', 'GAC/sand', 'anthracite/sand', 'anthracite/sand'], mediaSrc: SRC.MUTTI,
  capLsEach: 190,                // est: 3 filters ≈ 570 L/s < 625 L/s plate-settler limit → capacity drops while one washes
  termHeadlossM: 2.4,            // est terminal headloss
  breakVolM3: 60000,             // est run volume at which turbidity breakthrough begins (scaled by settled NTU)
  steps: [['DRAIN', 10], ['AIR SCOUR', 4], ['BACKWASH', 10], ['RINSE', 5], ['FILTER-TO-WASTE', 15]], // minutes (est)
  bwRateLs: 300,                 // est backwash pump rate drawn from clearwell
};

/** Greenbrook 1,4-dioxane (wells K1A, K2A, K4C, K5A, K8 per AWQR 2025; Kitchener op plan lists K4B).
 *  Real context: plant shut down 2004 with 1,4-dioxane up to 285 µg/L; UV/H2O2 AOP selected (AWWA WQTC 2006). Health Canada MAC 50 µg/L (2021).
 *  Per-well raw concentrations and the AOP kinetics below are TRAINING ESTIMATES (Region well data not published). */
export const DIOXANE = {
  macUgL: 50, macSrc: SRC.HCDIOX, opTargetUgL: 25, opTargetNote: 'ESTIMATE: in-sim operating alarm at ½ MAC',
  historicMaxUgL: 285, historicSrc: SRC.AWWA06,
  wellRawUgL: { K1A: 22, K2A: 38, K4C: 12, K5A: 70, K8: 28 }, // est
  eeoKwhPerM3Order: 0.15, eeoSrc: 'Stony Brook UV/H2O2 bench data (DI water) – real groundwater scavenging assumed ×2.5 (est)',
  scavengerFactor: 2.5, h2o2HalfSatMgL: 3, uvKwMax: 280, uvKwDefault: 150, h2o2Default: 6,
};
