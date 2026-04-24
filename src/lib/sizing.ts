import type { Battery, DiscoveryState, HeatPump, QuoteResult } from "../types";
import { CATALOG, HEAT_PUMP_CATALOG } from "./catalog";

// -----------------------------------------------------------------------------
// Battery sizing (unchanged logic)
// -----------------------------------------------------------------------------

const GRID_PRICE_EUR_KWH = 0.32;
const INJECTION_VALUE_EUR_KWH = 0.05;
const CO2_PER_KWH_KG = 0.18;

export function recommendedCapacity(d: DiscoveryState): number {
  const usage = d.yearlyUsageKwh ?? 4000;
  const dailyAvg = usage / 365;
  let target = dailyAvg * 0.6;
  if (d.hasSolar) target = Math.max(target, (d.solarKwp ?? 5) * 1.2);
  if (d.hasEv) target += 3;
  if (d.hasHeatPump) target += 2;
  if (d.budget === "entry") target *= 0.7;
  if (d.budget === "premium") target *= 1.2;
  return Math.max(4, Math.min(20, target));
}

function scoreBattery(b: Battery, d: DiscoveryState): { score: number; reasons: string[] } {
  const target = recommendedCapacity(d);
  const reasons: string[] = [];
  let score = 100;
  const delta = Math.abs(b.capacityKwh - target);
  score -= delta * 6;
  if (delta < 2) reasons.push(`Past perfect bij jouw geschat verbruik (~${Math.round(target)} kWh/dag opslag)`);
  if (d.budget && b.tier === d.budget) { score += 15; reasons.push("Zit helemaal in jouw budgetcategorie"); }
  else if (d.budget === "entry" && b.tier === "premium") score -= 25;
  if (d.backupImportant && b.backup) { score += 20; reasons.push("Heeft back-up bij stroompanne — jouw prioriteit"); }
  else if (d.backupImportant && !b.backup) score -= 20;
  if (b.brand === "Alpha ESS" && (d.hasHeatPump || d.hasEv)) { score += 10; reasons.push("EMS stuurt automatisch warmtepomp en/of EV-laden aan"); }
  if (d.dynamicTariff && b.capacityKwh >= 10) { score += 10; reasons.push("Groot genoeg om optimaal te profiteren van dynamisch tarief"); }
  return { score, reasons };
}

function buildBatteryQuote(d: DiscoveryState): QuoteResult {
  const ranked = CATALOG.map((b) => ({ b, ...scoreBattery(b, d) })).sort((x, y) => y.score - x.score);
  const recommended = { ...ranked[0].b, matchReasons: ranked[0].reasons };
  const alternatives = ranked.slice(1, 3).map((r) => ({ ...r.b, matchReasons: r.reasons }));

  const usage = d.yearlyUsageKwh ?? 4000;
  const capacity = recommended.usableKwh;
  const cycles = 280;
  const kwhShifted = Math.min(capacity * cycles, usage * 0.55);
  const perKwhSavings = d.hasSolar ? GRID_PRICE_EUR_KWH - INJECTION_VALUE_EUR_KWH : GRID_PRICE_EUR_KWH * 0.45;
  const yearlySavings = Math.round(kwhShifted * perKwhSavings);
  const payback = recommended.priceIncl / Math.max(1, yearlySavings);
  const co2 = Math.round(kwhShifted * CO2_PER_KWH_KG);
  const selfConsumptionIncreasePct = d.hasSolar ? Math.min(45, Math.round(capacity * 3.5)) : 0;

  return {
    productKind: "battery",
    recommended,
    alternatives,
    estimatedYearlySavingsEur: yearlySavings,
    paybackYears: Math.round(payback * 10) / 10,
    co2SavedKgPerYear: co2,
    selfConsumptionIncreasePct,
    discovery: d,
  };
}

// -----------------------------------------------------------------------------
// Heat pump sizing
// -----------------------------------------------------------------------------

// Energy content.
const GAS_KWH_PER_M3 = 9.77;      // gross heating value for Belgian natural gas
const OIL_KWH_PER_L = 10.0;
const HP_FULL_LOAD_HOURS = 1800;  // typical Belgian climate equivalent
const GAS_PRICE_EUR_M3 = 1.15;    // 2026 indicative
const OIL_PRICE_EUR_L = 0.95;
const ELEC_PRICE_EUR_KWH = 0.32;
const CO2_GAS_KG_PER_KWH = 0.20;
const CO2_OIL_KG_PER_KWH = 0.27;

/** Estimate required nominal kW for the heat pump based on what we know. */
export function estimateHeatPumpKw(d: DiscoveryState): number {
  // 1) Direct: user knows their current heat pump kW (replacement case)
  if (d.hpCurrentKw && d.hpCurrentKw > 0) return d.hpCurrentKw;

  // 2) From fuel consumption: heat demand / 1800 full-load hours
  if (d.hpGasM3) {
    const thermalKwh = d.hpGasM3 * GAS_KWH_PER_M3;
    return clamp(thermalKwh / HP_FULL_LOAD_HOURS, 4, 18);
  }
  if (d.hpOilL) {
    const thermalKwh = d.hpOilL * OIL_KWH_PER_L;
    return clamp(thermalKwh / HP_FULL_LOAD_HOURS, 4, 18);
  }

  // 3) Fallback: lookup table by insulation × household size
  const insulFactor = { poor: 1.4, moderate: 1.1, good: 0.85, excellent: 0.65 }[d.hpInsulation ?? "moderate"];
  const base = 6 + ((d.householdSize ?? 3) - 3) * 0.8; // 3p = 6 kW baseline
  return clamp(base * insulFactor, 4, 18);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreHeatPump(hp: HeatPump, d: DiscoveryState, targetKw: number): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  // kW fit — penalise distance to target.
  const delta = Math.abs(hp.nominalKw - targetKw);
  score -= delta * 12;
  if (delta < 1.5) reasons.push(`Vermogen past bij jouw berekende warmtebehoefte (±${Math.round(targetKw * 10) / 10} kW)`);

  // Emission system compatibility.
  if (d.hpEmission && hp.suitableFor.includes(d.hpEmission)) {
    score += 15;
    if (d.hpEmission === "radiators") reasons.push("Hoge aanvoertemperatuur — werkt ook met bestaande radiatoren");
    else if (d.hpEmission === "floor") reasons.push("Optimaal rendement met vloerverwarming");
  } else if (d.hpEmission && !hp.suitableFor.includes(d.hpEmission)) {
    score -= 30;
  }

  // DHW capacity vs household size.
  const hh = d.householdSize ?? 3;
  if (hp.dhwLiters >= hh * 60) {
    score += 10;
    if (hp.dhwLiters > 0) reasons.push(`${hp.dhwLiters} L sanitair warm water — ruim voor jullie gezin`);
  } else if (hp.dhwLiters > 0 && hp.dhwLiters < hh * 50) {
    score -= 10;
  }

  // Budget alignment.
  if (d.hpBudget && hp.tier === d.hpBudget) { score += 15; reasons.push("Zit in jouw budgetcategorie"); }
  else if (d.hpBudget === "entry" && hp.tier === "premium") score -= 25;

  // Insulation penalty for low-capacity HP in poorly insulated homes.
  if (d.hpInsulation === "poor" && hp.nominalKw < 10) score -= 15;

  return { score, reasons };
}

function buildHeatPumpQuote(d: DiscoveryState): QuoteResult {
  const targetKw = estimateHeatPumpKw(d);
  const ranked = HEAT_PUMP_CATALOG.map((hp) => ({ hp, ...scoreHeatPump(hp, d, targetKw) }))
    .sort((x, y) => y.score - x.score);

  const btwReduced = d.hpHouseOld === true; // ≥10 years → 6% VAT

  // Pick the right gross price based on VAT rate, and use catalog-provided
  // savings/payback when available (more accurate than formulas).
  const applyPricing = (hp: HeatPump): HeatPump => ({
    ...hp,
    priceIncl: btwReduced ? hp.priceIncl6 : hp.priceIncl21,
    btwReduced,
  });

  const recommended = applyPricing({ ...ranked[0].hp, matchReasons: ranked[0].reasons });
  const alternatives = ranked.slice(1, 3).map((r) => applyPricing({ ...r.hp, matchReasons: r.reasons }));

  // Yearly savings: prefer catalog value if present (Homate-computed based on
  // reference scenario); otherwise fall back to the generic formula using actual
  // consumption data.
  let yearlySavings: number;
  if (recommended.savingsPerYearEur !== undefined) {
    yearlySavings = recommended.savingsPerYearEur;
  } else {
    const thermalKwh = d.hpGasM3
      ? d.hpGasM3 * GAS_KWH_PER_M3
      : d.hpOilL
      ? d.hpOilL * OIL_KWH_PER_L
      : targetKw * HP_FULL_LOAD_HOURS;
    const currentFuelCost = d.hpGasM3
      ? d.hpGasM3 * GAS_PRICE_EUR_M3
      : d.hpOilL
      ? d.hpOilL * OIL_PRICE_EUR_L
      : (thermalKwh / GAS_KWH_PER_M3) * GAS_PRICE_EUR_M3;
    const elecKwh = thermalKwh / recommended.scop;
    yearlySavings = Math.max(0, Math.round(currentFuelCost - elecKwh * ELEC_PRICE_EUR_KWH));
  }

  // Payback: prefer catalog value (net of subsidy) if available.
  let paybackYears: number;
  if (btwReduced && recommended.paybackYears6 !== undefined) {
    paybackYears = recommended.paybackYears6;
  } else if (!btwReduced && recommended.paybackYears21 !== undefined) {
    paybackYears = recommended.paybackYears21;
  } else {
    const netPrice = Math.max(0, recommended.priceIncl - (recommended.subsidyEur ?? 0));
    paybackYears = netPrice / Math.max(1, yearlySavings);
  }

  // CO₂: based on the thermal load the HP replaces.
  const thermalKwh = d.hpGasM3
    ? d.hpGasM3 * GAS_KWH_PER_M3
    : d.hpOilL
    ? d.hpOilL * OIL_KWH_PER_L
    : targetKw * HP_FULL_LOAD_HOURS;
  const elecKwh = thermalKwh / recommended.scop;
  const co2BeforeKg = d.hpOilL ? thermalKwh * CO2_OIL_KG_PER_KWH : thermalKwh * CO2_GAS_KG_PER_KWH;
  const co2AfterKg = elecKwh * 0.18;
  const co2Savings = Math.max(0, Math.round(co2BeforeKg - co2AfterKg));

  const subsidyEur = recommended.subsidyEur ?? 0;
  const netPriceAfterSubsidy = Math.max(0, recommended.priceIncl - subsidyEur);

  return {
    productKind: "heatpump",
    recommended,
    alternatives,
    estimatedYearlySavingsEur: yearlySavings,
    paybackYears: Math.round(paybackYears * 10) / 10,
    co2SavedKgPerYear: co2Savings,
    targetKw: Math.round(targetKw * 10) / 10,
    subsidyEur,
    netPriceAfterSubsidy,
    discovery: d,
  };
}

// -----------------------------------------------------------------------------
// Dispatcher
// -----------------------------------------------------------------------------

export function buildQuote(d: DiscoveryState): QuoteResult {
  if (d.track === "heatpump") return buildHeatPumpQuote(d);
  return buildBatteryQuote(d);
}
