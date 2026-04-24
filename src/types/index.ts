export type Role = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  quickReplies?: QuickReply[];
  sliderPrompt?: SliderPrompt;
  inputPrompt?: InputPrompt;
  showQuoteCard?: boolean;
}

export interface InputPrompt {
  id: string;
  placeholder: string;
  submitLabel: string;
  fieldKey: keyof DiscoveryState;
  autoFocus?: boolean;
}

export interface QuickReply {
  id: string;
  label: string;
  value: string;
  icon?: string;
}

export interface SliderPrompt {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
  fieldKey: keyof DiscoveryState;
  // Optional: transform slider value into a patch. Overrides { [fieldKey]: v }.
  toState?: (v: number) => Partial<DiscoveryState>;
  // Optional: custom display for the submitted user bubble.
  displayFormat?: (v: number) => string;
}

export type ProductTrack = "battery" | "heatpump" | "both";

export type InsulationLevel = "poor" | "moderate" | "good" | "excellent";
export type HeatEmission = "radiators" | "floor" | "mix";
export type HeatSource = "heatpump" | "gas" | "oil";

export interface DiscoveryState {
  firstName?: string;
  track?: ProductTrack;          // which product the user is interested in

  // Battery track -------------------------------------------------------
  hasSolar?: boolean;
  solarKwp?: number;              // installed PV size (derived from solarPanels × 0.37)
  solarPanels?: number;           // user-friendly count, source of truth from UI
  solarEstimated?: boolean;       // true when derived from a default (user didn't know)
  yearlyUsageKwh?: number;        // annual electricity consumption
  usageEstimated?: boolean;       // true when derived from profile/household size
  householdSize?: number;         // people count, also used by HP track for DHW sizing
  dynamicTariff?: boolean;
  tariffUnknown?: boolean;
  hasEv?: boolean;
  hasHeatPump?: boolean;
  homeSize?: "small" | "medium" | "large";
  budget?: "entry" | "mid" | "premium";
  backupImportant?: boolean;

  // Heat-pump track -----------------------------------------------------
  hpHouseOld?: boolean;           // true = ≥10 years → BTW 6%
  hpInsulation?: InsulationLevel;
  hpEmission?: HeatEmission;
  hpCurrentSource?: HeatSource;
  hpGasM3?: number;               // annual gas consumption if source=gas
  hpOilL?: number;                // annual oil consumption if source=oil
  hpCurrentKw?: number;           // current heat pump kW if source=heatpump
  hpEstimatedKw?: number;         // computed target capacity
  hpBudget?: "entry" | "mid" | "premium";

  consent?: boolean;
}

export interface Battery {
  id: string;
  brand: string;
  model: string;
  capacityKwh: number;
  usableKwh: number;
  tier: "entry" | "mid" | "premium";
  priceIncl: number;          // EUR, incl. 21% BTW, incl. install
  warrantyYears: number;
  backup: boolean;
  highlights: string[];
  bestFor: string;
  matchReasons?: string[];
  imageUrl?: string;
  inverterKw?: number;
  cycles?: number;
}

export interface HeatPump {
  id: string;
  code?: string;              // internal Homate product code, e.g. "6WP"
  brand: string;
  model: string;
  nominalKw: number;          // nominal heat output (A7/W35)
  scop: number;               // seasonal COP, higher = more efficient
  efficiencyClass?: string;   // e.g. "A++"
  dhwLiters: number;          // integrated hot water buffer, 0 if separate boiler needed
  tier: "entry" | "mid" | "premium";

  // Pricing
  priceIncl21: number;        // EUR, incl. 21% BTW + installation (gross)
  priceIncl6: number;         // EUR, incl. 6% BTW + installation (gross, ≥10j woning)
  priceIncl: number;          // EUR, applied price depending on btwReduced flag
  btwReduced?: boolean;       // true when the 6% price applies
  subsidyEur?: number;        // e.g. Mijn VerbouwPremie (€1500)

  // Operational
  savingsPerYearEur?: number; // catalog-provided annual savings (overrides computed)
  paybackYears21?: number;    // catalog payback with 21% BTW
  paybackYears6?: number;     // catalog payback with 6% BTW

  // Compatibility & marketing
  warrantyYears: number;
  noiseDb?: number;
  suitableFor: HeatEmission[];
  highlights: string[];
  bestFor: string;
  matchReasons?: string[];
  imageUrl?: string;
  productLink?: string;
}

export interface QuoteResult {
  productKind: "battery" | "heatpump";
  recommended: Battery | HeatPump;
  alternatives: (Battery | HeatPump)[];
  estimatedYearlySavingsEur: number;
  paybackYears: number;
  co2SavedKgPerYear: number;
  // Battery-specific metric (ignored for heatpump quotes).
  selfConsumptionIncreasePct?: number;
  // Heat-pump-specific metrics (ignored for battery quotes).
  targetKw?: number;
  subsidyEur?: number;        // total subsidy applied to recommended product
  netPriceAfterSubsidy?: number; // priceIncl − subsidyEur
  discovery: DiscoveryState;
}

// Narrowing helpers.
export function isBatteryRec(q: QuoteResult): q is QuoteResult & { recommended: Battery; alternatives: Battery[] } {
  return q.productKind === "battery";
}
export function isHeatPumpRec(q: QuoteResult): q is QuoteResult & { recommended: HeatPump; alternatives: HeatPump[] } {
  return q.productKind === "heatpump";
}

export interface LeadPayload {
  firstName?: string;
  email: string;
  phone: string;
  postcode?: string;
  notes?: string;
  quoteId: string;
  discovery: DiscoveryState;
  productKind: "battery" | "heatpump";
  recommendedProductId: string;
  // Kept for back-compat with existing server log shape.
  recommendedBatteryId?: string;
}
