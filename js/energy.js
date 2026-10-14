/**
 * WR-WATER v0.2 electricity pricing (Ontario). All rates are public and cited; the delivery adder, Class assignment and
 * the assumed Class A peak-demand factor (PDF) are TRAINING ESTIMATES.
 */
import { IESO } from '../data/ieso.js';

export const ESRC = {
  OEB_RPP: 'https://oeb.ca/sites/default/files/rpp-price-report-20251017.pdf',
  OEB_RATES: 'https://www.oeb.ca/consumer-information-and-protection/electricity-rates',
  IESO_GAB: 'https://www.ieso.ca/en/sector-participants/settlements/global-adjustment-for-class-b',
  IESO_PDF: 'https://www.ieso.ca/sector-participants/settlements/global-adjustment-and-peak-demand-factor',
  IESO_ELIG: 'https://www.ieso.ca/sector-participants/settlements/global-adjustment-class-a-eligibility',
  IESO_GA_XML: 'https://reports-public.ieso.ca/public/GlobalAdjustment/',
  IESO_OZP: 'https://reports-public.ieso.ca/public/DAHourlyOntarioZonalPrice/',
  IESO_DEM: 'https://reports-public.ieso.ca/public/Demand/PUB_Demand_2026.csv',
  IESO_ICI: 'https://reports-public.ieso.ca/public/ICIPeakTracker/PUB_ICIPeakTracker_2026.xml',
};

export const RPP = { // OEB RPP prices effective Nov 1 2025 (OEB RPP Price Report, Oct 17 2025)
  tou: { offPeak: 0.098, midPeak: 0.157, onPeak: 0.203 },
  tier1: 0.120, tier2: 0.142, tierThresholdKwhMonthNonRes: 750,
};
export const DELIVERY_ADDER = 0.04; // $/kWh ESTIMATE – distribution, transmission, regulatory, debt retirement not modelled per LDC
export const CLASS_B_MIN_KW = 50;   // Class B = every account that is neither Class A nor on the RPP. RPP eligibility for non-residential accounts here is approximated as connected load < 50 kW (GS<50) – the 50 kW split is the ESTIMATE
export const DIESEL_PER_KWH = 0.47; // ESTIMATE: ~0.27 L/kWh × $1.75/L diesel

/** 2025-26 base period (May 1 2025 – Apr 30 2026) top-5 Ontario peak hours, from the IESO PDF page (MWh). */
export const TOP5_2025 = [
  { date: '2025-06-24', he: 19, mwh: 23845.600 }, { date: '2025-08-11', he: 18, mwh: 24116.452 }, { date: '2025-06-23', he: 19, mwh: 24600.740 },
  { date: '2025-07-24', he: 17, mwh: 24897.773 }, { date: '2025-07-28', he: 16, mwh: 24856.712 },
];
export const TOP5_2025_SUM = TOP5_2025.reduce((a, b) => a + b.mwh, 0); // 122,317.277
/** ESTIMATE: Mannheim complex (WTP + Zone 4/5/6 PS) average load in each of the 2025 top-5 hours → PDF for Jul 2026–Jun 2027. */
export const CLASS_A_ASSUMED_PEAK_MW = 2.5;
export const PDF_CURRENT = CLASS_A_ASSUMED_PEAK_MW * 5 / TOP5_2025_SUM;

const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const ymd = d => `${ym(d)}-${String(d.getDate()).padStart(2, '0')}`;
export { ymd };
export function gaMonth(d) {
  const g = IESO.ga[ym(d)]; if (g) return { ...g, month: ym(d), est: false };
  const vals = Object.values(IESO.ga); const avgR = vals.reduce((a, b) => a + b.classBRatePerMWh, 0) / vals.length, avgT = vals.reduce((a, b) => a + b.totalDollars, 0) / vals.length;
  return { totalDollars: avgT, classBRatePerMWh: avgR, status: '12-month average (no IESO value for this month)', month: ym(d), est: true };
}
export const GA_12M_TOTAL = Object.values(IESO.ga).reduce((a, b) => a + b.totalDollars, 0); // Oct 2025 – Sep 2026
const ozpDays = Object.values(IESO.ozpDA);
const OZP_AVG = Array.from({ length: 24 }, (_, h) => ozpDays.reduce((a, d) => a + d[h], 0) / ozpDays.length);
/** Ontario zonal price $/MWh for the hour; real day-ahead OZP when the date is in data/ieso.js, else July-2026 hourly average. */
export function ozp(d) { const day = IESO.ozpDA[ymd(d)]; const h = d.getHours(); return day ? { v: day[h], real: true } : { v: OZP_AVG[h], real: false }; }
const demDays = Object.values(IESO.ontarioDemandMW);
const DEM_AVG = Array.from({ length: 24 }, (_, h) => demDays.reduce((a, d) => a + d[h], 0) / demDays.length);
export function ontarioDemand(d) { const day = IESO.ontarioDemandMW[ymd(d)]; return day ? { curve: day, real: true } : { curve: DEM_AVG, real: false }; }

export function touPeriod(d) {
  const dow = d.getDay(), h = d.getHours(), m = d.getMonth() + 1;
  if (dow === 0 || dow === 6 || h < 7 || h >= 19) return 'offPeak';
  const summer = m >= 5 && m <= 10; const mid = h >= 11 && h < 17;
  if (summer) return mid ? 'onPeak' : 'midPeak';
  return mid ? 'midPeak' : 'onPeak';
}
/** $/kWh for the energy component by customer class (GA for Class A is billed separately via PDF). */
export function energyPrice(cls, d, monthKwh = 0, rppPlan = 'TOU') {
  if (cls === 'RPP') {
    if (rppPlan === 'TIERED') return (monthKwh < RPP.tierThresholdKwhMonthNonRes ? RPP.tier1 : RPP.tier2) + DELIVERY_ADDER;
    return RPP.tou[touPeriod(d)] + DELIVERY_ADDER;
  }
  const p = ozp(d).v / 1000;
  if (cls === 'B') return p + gaMonth(d).classBRatePerMWh / 1000 + DELIVERY_ADDER;
  return p + DELIVERY_ADDER; // Class A
}
/** Class A GA accrual $/s for a given PDF: PDF × monthly GA total spread evenly over the month. */
export function classAGaPerSec(d, pdf = PDF_CURRENT) {
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return pdf * gaMonth(d).totalDollars / (dim * 86400);
}
/** Top-5 ranking for the 2026-27 base period up to (not incl.) date d, using real IESO hourly Ontario demand. */
export function top5SoFar(d) {
  const best = {};
  for (const [day, c] of Object.entries(IESO.ontarioDemandMW)) { if (day < '2026-05-01' || day >= ymd(d)) continue; const m = Math.max(...c); best[day] = { day, he: c.indexOf(m) + 1, mw: m }; }
  return Object.values(best).sort((a, b) => b.mw - a.mw).slice(0, 5);
}
/** IESO-style peak alert for the sim day: today's forecast (= actual 2026 data) peak within 3 % of the current 5th-highest. */
export function peakAlert(d) {
  const od = ontarioDemand(d); const curve = od.curve; const mw = Math.max(...curve); const he = curve.indexOf(mw) + 1;
  const t5 = top5SoFar(d); const fifth = t5.length >= 5 ? t5[4].mw : 0;
  const alert = od.real && mw >= 0.97 * fifth;
  return { alert, he, mw, fifth, top5: t5, window: [he - 2, he + 1], real: od.real };
}
/** Confirmed 2026-27 top-5 hours so far (IESO ICI peak tracker, Final). */
export const TOP5_2026 = IESO.iciTracker2026.slice(0, 5);
export const DOLLARS_PER_MW_ALL5 = 5 / TOP5_2026.reduce((a, b) => a + b.mw, 0) * GA_12M_TOTAL; // annual GA $ per MW drawn in all 5 peak hours

/** Teaching view of peak avoidance: the Mannheim load the trainee actually ran in the real 2026 top-5 hours sets the
 *  PDF for Jul 2027 – Jun 2028. Hours not yet simulated use the assumed 2.5 MW. Next-year GA ≈ PDF × 12-month GA total
 *  (Oct 2025 – Sep 2026 actuals used as the proxy for the future GA pool – ESTIMATE). */
export function projectNextYear(records = []) {
  const sumTop = TOP5_2026.reduce((a, b) => a + b.mw, 0);
  const rows = TOP5_2026.map(p => { const r = records.find(x => x.day === p.date && x.he === p.he); return { ...p, kw: r ? r.kw : CLASS_A_ASSUMED_PEAK_MW * 1000, simulated: !!r }; });
  const pdf = rows.reduce((a, r) => a + r.kw / 1000, 0) / sumTop;
  const pdfBase = CLASS_A_ASSUMED_PEAK_MW * 5 / sumTop;
  return { rows, pdf, pdfBase, ga: pdf * GA_12M_TOTAL, gaBase: pdfBase * GA_12M_TOTAL, saving: (pdfBase - pdf) * GA_12M_TOTAL };
}
