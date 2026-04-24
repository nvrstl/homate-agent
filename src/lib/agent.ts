import type { ChatMessage, DiscoveryState, InputPrompt, QuickReply, SliderPrompt } from "../types";

export type AskStep =
  // Shared / branching
  | "ask_name"
  | "ask_product"
  // Battery track
  | "ask_solar"
  | "ask_solar_panels"
  | "ask_usage_profile"
  | "ask_household_size"
  | "ask_usage_kwh"
  | "ask_ev_hp"
  | "ask_tariff"
  | "ask_backup"
  | "ask_budget"
  // Heat pump track
  | "ask_hp_house_age"
  | "ask_hp_insulation"
  | "ask_hp_household"
  | "ask_hp_emission"
  | "ask_hp_source"
  | "ask_hp_gas_m3"
  | "ask_hp_oil_l"
  | "ask_hp_current_kw"
  | "ask_hp_budget";

export type FlowStep = AskStep | "summary";

// Kept for backwards compatibility with api/chat.ts and claudeClient.
export type Step = AskStep | "summary";

// Wp per panel assumption for converting panel count → kWp.
export const KWP_PER_PANEL = 0.37;

export const PROFILE_KWH: Record<string, number> = {
  alleen: 1800,
  koppel: 3500,
  gezin_sm: 4500,
  gezin_lg: 7000,
};

export function kwhForHouseholdSize(n: number): number {
  const table: Record<number, number> = {
    1: 1800, 2: 3000, 3: 4200, 4: 4800, 5: 5500, 6: 6500, 7: 7500,
  };
  return table[Math.max(1, Math.min(7, Math.round(n)))] ?? 4500;
}

const id = () => crypto.randomUUID();
const now = () => Date.now();

function reply(content: string, extras: Partial<ChatMessage> = {}): ChatMessage {
  return { id: id(), role: "assistant", content, createdAt: now(), ...extras };
}

const CHIPS = {
  yesNo: (): QuickReply[] => [
    { id: id(), label: "Ja", value: "yes" },
    { id: id(), label: "Nee", value: "no" },
  ],
  product: (): QuickReply[] => [
    { id: id(), label: "Thuisbatterij", value: "battery" },
    { id: id(), label: "Warmtepomp", value: "heatpump" },
  ],
  usageProfile: (): QuickReply[] => [
    { id: id(), label: "Alleenstaand (±1.800 kWh)", value: "alleen" },
    { id: id(), label: "Koppel (±3.500 kWh)", value: "koppel" },
    { id: id(), label: "Gezin 3–4p (±4.500 kWh)", value: "gezin_sm" },
    { id: id(), label: "Groot gezin / elektr. verwarmd (±7.000 kWh)", value: "gezin_lg" },
    { id: id(), label: "Ik weet het niet", value: "unknown" },
    { id: id(), label: "Ik weet het precies", value: "precies" },
  ],
  solarPanelsUnknown: (): QuickReply[] => [
    { id: id(), label: "Ik weet het niet", value: "unknown" },
  ],
  evHp: (): QuickReply[] => [
    { id: id(), label: "Elektrische wagen", value: "ev" },
    { id: id(), label: "Warmtepomp", value: "hp" },
    { id: id(), label: "Beiden", value: "both" },
    { id: id(), label: "Geen van beide", value: "none" },
  ],
  backup: (): QuickReply[] => [
    { id: id(), label: "Heel belangrijk", value: "important" },
    { id: id(), label: "Nice to have", value: "nice" },
    { id: id(), label: "Niet nodig", value: "no" },
  ],
  budget: (): QuickReply[] => [
    { id: id(), label: "Scherp instappen", value: "entry" },
    { id: id(), label: "Balans prijs/kwaliteit", value: "mid" },
    { id: id(), label: "Het beste van het beste", value: "premium" },
  ],
  houseAge: (): QuickReply[] => [
    { id: id(), label: "Jonger dan 10 jaar", value: "new" },
    { id: id(), label: "10 jaar of ouder", value: "old" },
  ],
  insulation: (): QuickReply[] => [
    { id: id(), label: "Slecht (geen isolatie / enkel glas)", value: "poor" },
    { id: id(), label: "Matig (dakisolatie, deels dubbel glas)", value: "moderate" },
    { id: id(), label: "Goed (volledig geïsoleerd, HR-glas)", value: "good" },
    { id: id(), label: "Uitstekend (passief/BEN, triple glas)", value: "excellent" },
  ],
  hpHousehold: (): QuickReply[] => [
    { id: id(), label: "1–2 personen", value: "1-2" },
    { id: id(), label: "3 personen", value: "3" },
    { id: id(), label: "4 personen", value: "4" },
    { id: id(), label: "5 of meer", value: "5+" },
  ],
  emission: (): QuickReply[] => [
    { id: id(), label: "Radiatoren", value: "radiators" },
    { id: id(), label: "Vloerverwarming", value: "floor" },
    { id: id(), label: "Combinatie (mix)", value: "mix" },
  ],
  hpSource: (): QuickReply[] => [
    { id: id(), label: "Gas", value: "gas" },
    { id: id(), label: "Mazout (stookolie)", value: "oil" },
    { id: id(), label: "Warmtepomp (vervanging)", value: "heatpump" },
  ],
};

const SLIDERS: Record<string, SliderPrompt> = {
  solarPanels: {
    id: "solarPanels", label: "Hoeveel panelen heb je ongeveer op het dak?",
    min: 4, max: 40, step: 1, unit: "panelen", defaultValue: 14, fieldKey: "solarPanels",
    toState: (v) => ({ solarPanels: v, solarKwp: Math.round(v * KWP_PER_PANEL * 10) / 10, solarEstimated: false }),
    displayFormat: (v) => `${v} panelen (±${Math.round(v * KWP_PER_PANEL * 10) / 10} kWp)`,
  },
  householdSize: {
    id: "householdSize", label: "Met hoeveel zijn jullie in het gezin?",
    min: 1, max: 7, step: 1, unit: "personen", defaultValue: 3, fieldKey: "householdSize",
    toState: (v) => ({ householdSize: v, yearlyUsageKwh: kwhForHouseholdSize(v), usageEstimated: true }),
    displayFormat: (v) => `${v} ${v === 1 ? "persoon" : "personen"} (±${kwhForHouseholdSize(v).toLocaleString("nl-BE")} kWh/jaar)`,
  },
  usage: {
    id: "usage", label: "Jouw jaarverbruik elektriciteit",
    min: 1500, max: 12000, step: 250, unit: "kWh/jaar", defaultValue: 4000, fieldKey: "yearlyUsageKwh",
    toState: (v) => ({ yearlyUsageKwh: v, usageEstimated: false }),
    displayFormat: (v) => `${v.toLocaleString("nl-BE")} kWh/jaar`,
  },
  hpGasM3: {
    id: "hpGasM3", label: "Je jaarlijks gasverbruik",
    min: 500, max: 4500, step: 50, unit: "m³/jaar", defaultValue: 1800, fieldKey: "hpGasM3",
    toState: (v) => ({ hpGasM3: v }),
    displayFormat: (v) => `${v.toLocaleString("nl-BE")} m³ gas/jaar`,
  },
  hpOilL: {
    id: "hpOilL", label: "Je jaarlijks mazoutverbruik",
    min: 500, max: 5000, step: 50, unit: "L/jaar", defaultValue: 2200, fieldKey: "hpOilL",
    toState: (v) => ({ hpOilL: v }),
    displayFormat: (v) => `${v.toLocaleString("nl-BE")} L mazout/jaar`,
  },
  hpCurrentKw: {
    id: "hpCurrentKw", label: "Het huidige vermogen van je warmtepomp",
    min: 4, max: 18, step: 0.5, unit: "kW", defaultValue: 8, fieldKey: "hpCurrentKw",
    toState: (v) => ({ hpCurrentKw: v }),
    displayFormat: (v) => `${v} kW`,
  },
};

export function questionFor(step: AskStep, state: DiscoveryState): ChatMessage {
  const name = state.firstName;

  switch (step) {
    case "ask_name": {
      const acks: string[] = [];
      const wantsHp = state.track === "heatpump";
      if (wantsHp && state.hpCurrentSource === "gas") {
        acks.push("Helemaal begrepen — weg van gas. Een warmtepomp is dan de logische volgende stap.");
      } else if (wantsHp && state.hpCurrentSource === "oil") {
        acks.push("Weg van mazout — slim moment om te schakelen naar een warmtepomp.");
      } else if (wantsHp) {
        acks.push("Helder, we zoeken de juiste warmtepomp voor jouw woning.");
      } else if (state.hasSolar === true) {
        acks.push(state.solarPanels
          ? `Je hebt al ±${state.solarPanels} zonnepanelen — mooie basis om met een batterij te combineren.`
          : "Je hebt al zonnepanelen — perfecte basis om mee te combineren.");
      } else if (state.hasSolar === false) {
        acks.push("Ook zonder zonnepanelen kan een batterij zeker renderen, vooral op een dynamisch contract.");
      }
      if (!wantsHp && state.hasEv && state.hasHeatPump) acks.push("Een EV én warmtepomp — dan wordt die batterij goed benut.");
      else if (!wantsHp && state.hasEv) acks.push("Een elektrische wagen in huis — daar speelt een batterij slim op in.");
      if (!wantsHp && state.backupImportant) acks.push("Back-up bij stroompanne noteer ik al — komt verder in mijn advies terug.");

      const productLine = wantsHp
        ? "de juiste warmtepomp voor jouw woning te vinden"
        : state.track === "battery"
        ? "de juiste thuisbatterij voor jouw situatie te vinden"
        : "de juiste energie-oplossing voor jouw woning te vinden — thuisbatterij of warmtepomp";
      const intro = acks.length
        ? `${acks[0]} Ik ben je Homate-adviseur en help je in een paar minuten ${productLine}.`
        : `Hoi! Ik ben je Homate-adviseur. Ik help je in een paar minuten ${productLine}.`;

      const namePrompt: InputPrompt = {
        id: "name", placeholder: "Jouw voornaam…", submitLabel: "Verder",
        fieldKey: "firstName", autoFocus: true,
      };
      return reply(`${intro} Hoe mag ik je noemen?`, { inputPrompt: namePrompt });
    }

    case "ask_product":
      return reply(
        name
          ? `Leuk je te ontmoeten, ${name}. Waarvoor kunnen we je helpen?`
          : "Waarvoor kunnen we je helpen?",
        { quickReplies: CHIPS.product() },
      );

    // -- Battery track --
    case "ask_solar":
      return reply(
        name ? `Om te beginnen ${name}: heb je al zonnepanelen op het dak?` : "Om te beginnen: heb je al zonnepanelen op het dak?",
        { quickReplies: CHIPS.yesNo() },
      );

    case "ask_solar_panels":
      return reply(
        "Top, dan combineren we perfect met je zonnepanelen. Hoeveel panelen heb je ongeveer? Geen stress als je het niet exact weet — een schatting volstaat.",
        { sliderPrompt: SLIDERS.solarPanels, quickReplies: CHIPS.solarPanelsUnknown() },
      );

    case "ask_usage_profile": {
      const intro = state.hasSolar === false
        ? "Geen probleem — ook zonder zonnepanelen kan een batterij renderen, zeker op een dynamisch contract. "
        : "";
      return reply(
        `${intro}Wat past het beste bij jouw situatie qua elektriciteitsverbruik?`,
        { quickReplies: CHIPS.usageProfile() },
      );
    }

    case "ask_household_size":
      return reply(
        "Geen zorgen — we schatten het samen. Met hoeveel personen wonen jullie thuis?",
        { sliderPrompt: SLIDERS.householdSize },
      );

    case "ask_usage_kwh":
      return reply(
        "Perfect. Schuif naar jouw jaarverbruik — je vindt dit terug op je laatste eindafrekening.",
        { sliderPrompt: SLIDERS.usage },
      );

    case "ask_ev_hp":
      return reply(
        "Heb je een elektrische wagen of warmtepomp? Dat beïnvloedt de ideale batterijgrootte flink.",
        { quickReplies: CHIPS.evHp() },
      );

    case "ask_tariff":
      return reply(
        "Verandert jouw elektriciteitsprijs per uur of per dag, of betaal je een vaste prijs per kWh?",
        {
          quickReplies: [
            { id: id(), label: "Verandert per uur/dag", value: "yes" },
            { id: id(), label: "Vaste prijs", value: "no" },
            { id: id(), label: "Weet ik niet", value: "unknown" },
          ],
        },
      );

    case "ask_backup":
      return reply(
        "Hoe belangrijk is back-upstroom voor jou — dat je bij een stroompanne licht en koelkast behoudt?",
        { quickReplies: CHIPS.backup() },
      );

    case "ask_budget":
      return reply(
        "Laatste vraag: waar mik je ongeveer op qua budget? Geen harde grens — helpt me alleen te focussen.",
        { quickReplies: CHIPS.budget() },
      );

    // -- Heat pump track --
    case "ask_hp_house_age":
      return reply(
        "Laten we beginnen met je woning. Hoe oud is ze ongeveer?",
        { quickReplies: CHIPS.houseAge() },
      );

    case "ask_hp_insulation":
      return reply(
        "Hoe goed is je woning geïsoleerd? Een ruwe inschatting volstaat.",
        { quickReplies: CHIPS.insulation() },
      );

    case "ask_hp_household":
      return reply(
        "Met hoeveel personen wonen jullie in de woning? Dit bepaalt de capaciteit voor sanitair warm water.",
        { quickReplies: CHIPS.hpHousehold() },
      );

    case "ask_hp_emission":
      return reply(
        "Hoe wordt de warmte vandaag afgegeven in huis? Dit is cruciaal voor het juiste type warmtepomp.",
        { quickReplies: CHIPS.emission() },
      );

    case "ask_hp_source":
      return reply(
        "Hoe verwarm je momenteel?",
        { quickReplies: CHIPS.hpSource() },
      );

    case "ask_hp_gas_m3":
      return reply(
        "Wat is je jaarlijks gasverbruik ongeveer? Je vindt dit op je laatste eindafrekening.",
        { sliderPrompt: SLIDERS.hpGasM3 },
      );

    case "ask_hp_oil_l":
      return reply(
        "Hoeveel liter mazout gebruik je per jaar ongeveer?",
        { sliderPrompt: SLIDERS.hpOilL },
      );

    case "ask_hp_current_kw":
      return reply(
        "Wat is het huidige vermogen van je warmtepomp in kW? Staat meestal op het typeplaatje of in de handleiding.",
        { sliderPrompt: SLIDERS.hpCurrentKw },
      );

    case "ask_hp_budget":
      return reply(
        "Laatste vraag: waar mik je ongeveer op qua budget voor je nieuwe warmtepomp?",
        { quickReplies: CHIPS.budget() },
      );
  }
}

export function summaryMessage(state: DiscoveryState): ChatMessage {
  const bullets: string[] = [];
  const intro = state.firstName ? `Top, ${state.firstName}!` : "Top!";

  if (state.track === "heatpump") {
    bullets.push(`Woning: ${state.hpHouseOld ? "≥10 jaar (BTW 6%)" : "nieuwbouw / <10 jaar (BTW 21%)"}`);
    if (state.hpInsulation) bullets.push(`Isolatie: ${insulationLabel(state.hpInsulation)}`);
    if (state.householdSize) bullets.push(`Bewoners: ${state.householdSize} ${state.householdSize === 1 ? "persoon" : "personen"}`);
    if (state.hpEmission) bullets.push(`Afgiftesysteem: ${emissionLabel(state.hpEmission)}`);
    if (state.hpCurrentSource) bullets.push(`Huidige verwarming: ${sourceLabel(state.hpCurrentSource)}`);
    if (state.hpGasM3) bullets.push(`Gas: ±${state.hpGasM3.toLocaleString("nl-BE")} m³/jaar`);
    if (state.hpOilL) bullets.push(`Mazout: ±${state.hpOilL.toLocaleString("nl-BE")} L/jaar`);
    if (state.hpCurrentKw) bullets.push(`Huidige WP: ${state.hpCurrentKw} kW`);
    return reply(
      `${intro} Ik heb genoeg info:\n\n• ${bullets.join("\n• ")}\n\nIk bereken nu jouw ideale warmtepomp…`,
      { showQuoteCard: true },
    );
  }

  // Battery track (default)
  if (state.hasSolar) {
    const panelsStr = state.solarPanels ? `${state.solarPanels} panelen` : "";
    const kwpStr = state.solarKwp ? `±${state.solarKwp} kWp` : "";
    bullets.push(`Zonnepanelen: ${[panelsStr, kwpStr].filter(Boolean).join(" — ") || "ja"}${state.solarEstimated ? " (geschat)" : ""}`);
  } else {
    bullets.push(`Geen zonnepanelen`);
  }
  const usageNote = state.usageEstimated ? " (geschat)" : "";
  bullets.push(`Verbruik: ±${state.yearlyUsageKwh?.toLocaleString("nl-BE") ?? "?"} kWh/jaar${usageNote}`);
  if (state.hasEv) bullets.push(`Elektrische wagen`);
  if (state.hasHeatPump) bullets.push(`Warmtepomp`);
  if (state.dynamicTariff) bullets.push(`Dynamisch contract`);
  if (state.backupImportant) bullets.push(`Back-up gewenst`);
  return reply(
    `${intro} Ik heb genoeg info:\n\n• ${bullets.join("\n• ")}\n\nIk bereken nu jouw ideale thuisbatterij…`,
    { showQuoteCard: true },
  );
}

function insulationLabel(v: string): string {
  return { poor: "slecht", moderate: "matig", good: "goed", excellent: "uitstekend" }[v] ?? v;
}
function emissionLabel(v: string): string {
  return { radiators: "radiatoren", floor: "vloerverwarming", mix: "mix" }[v] ?? v;
}
function sourceLabel(v: string): string {
  return { gas: "gas", oil: "mazout", heatpump: "warmtepomp" }[v] ?? v;
}

export function interpretAnswer(step: AskStep, value: string, state: DiscoveryState): Partial<DiscoveryState> {
  const s: Partial<DiscoveryState> = {};
  const v = value.trim().toLowerCase();

  switch (step) {
    case "ask_name": {
      if (value.trim() && !state.firstName) {
        const name = value.trim().split(/\s+/)[0].replace(/[.,!?]/g, "");
        if (name.length > 0 && name.length < 30) {
          s.firstName = name[0].toUpperCase() + name.slice(1);
        }
      }
      break;
    }
    case "ask_product":
      if (v === "battery" || v === "heatpump" || v === "both") s.track = v;
      break;
    case "ask_solar":
      s.hasSolar = v === "yes";
      break;
    case "ask_solar_panels":
      if (v === "unknown") {
        s.solarPanels = 14;
        s.solarKwp = Math.round(14 * KWP_PER_PANEL * 10) / 10;
        s.solarEstimated = true;
      } else if (/^\d+(\.\d+)?$/.test(v)) {
        const panels = Number(v);
        s.solarPanels = panels;
        s.solarKwp = Math.round(panels * KWP_PER_PANEL * 10) / 10;
        s.solarEstimated = false;
      }
      break;
    case "ask_usage_profile":
      if (v in PROFILE_KWH) {
        s.yearlyUsageKwh = PROFILE_KWH[v];
        s.usageEstimated = true;
      }
      break;
    case "ask_household_size":
      if (/^\d+$/.test(v)) {
        const n = Math.max(1, Math.min(7, Number(v)));
        s.householdSize = n;
        s.yearlyUsageKwh = kwhForHouseholdSize(n);
        s.usageEstimated = true;
      }
      break;
    case "ask_usage_kwh":
      if (/^\d+$/.test(v)) { s.yearlyUsageKwh = Number(v); s.usageEstimated = false; }
      break;
    case "ask_ev_hp":
      s.hasEv = v === "ev" || v === "both";
      s.hasHeatPump = v === "hp" || v === "both";
      break;
    case "ask_tariff":
      s.dynamicTariff = v === "yes";
      s.tariffUnknown = v === "unknown";
      break;
    case "ask_backup":
      s.backupImportant = v === "important";
      break;
    case "ask_budget":
      if (v === "entry" || v === "mid" || v === "premium") s.budget = v;
      break;
    case "ask_hp_house_age":
      s.hpHouseOld = v === "old";
      break;
    case "ask_hp_insulation":
      if (v === "poor" || v === "moderate" || v === "good" || v === "excellent") s.hpInsulation = v;
      break;
    case "ask_hp_household":
      s.householdSize = v === "5+" ? 5 : v === "1-2" ? 2 : Number(v);
      break;
    case "ask_hp_emission":
      if (v === "radiators" || v === "floor" || v === "mix") s.hpEmission = v;
      break;
    case "ask_hp_source":
      if (v === "gas" || v === "oil" || v === "heatpump") s.hpCurrentSource = v;
      break;
    case "ask_hp_gas_m3":
      if (/^\d+$/.test(v)) s.hpGasM3 = Number(v);
      break;
    case "ask_hp_oil_l":
      if (/^\d+$/.test(v)) s.hpOilL = Number(v);
      break;
    case "ask_hp_current_kw":
      if (/^\d+(\.\d+)?$/.test(v)) s.hpCurrentKw = Number(v);
      break;
    case "ask_hp_budget":
      if (v === "entry" || v === "mid" || v === "premium") s.hpBudget = v;
      break;
  }
  return s;
}

export function parseSeed(seed: string): Partial<DiscoveryState> {
  const s: Partial<DiscoveryState> = {};
  if (!seed) return s;
  const t = seed.toLowerCase();

  // Product-intent detection — distinguishes "I want X" from passing mention.
  // Covers imperative ("ik wil een warmtepomp"), advisory ("advies over
  // warmtepomp"), and question forms ("welke warmtepomp past bij...").
  if (/\b(wil|interesse in|zoek|op zoek naar|vervangen door|opzoeken|advies over|welke|welk).*warmtepomp|\bwarmtepomp.*\b(prijs|kost|indicat|advies|plaatsen|kopen|vervang|past|bij|voor|kiezen|nodig)/.test(t)) {
    s.track = "heatpump";
  } else if (/\b(wil|zoek|interesse in|op zoek naar|advies over|welke|welk).*(thuisbatterij|batterij|energieopslag)|\b(thuisbatterij|batterij|energieopslag).*\b(prijs|kost|indicat|advies|plaatsen|kopen|past|voor|kiezen|nodig)/.test(t)) {
    s.track = "battery";
  }

  // Solar.
  const hasNoSolar = /\b(geen|zonder)\s+(zonne)?panelen\b/.test(t);
  const hasSolar = !hasNoSolar && /(zonnepanel|panelen op (het|mijn) dak|solar\s*panel|pv[- ]installat|ik heb al (zonne)?panelen|we hebben.*panelen)/.test(t);
  if (hasNoSolar) s.hasSolar = false;
  else if (hasSolar) s.hasSolar = true;

  const panelMatch = t.match(/(\d{1,2})\s*(zonne)?panelen/);
  if (panelMatch && s.hasSolar !== false) {
    const n = Number(panelMatch[1]);
    if (n >= 2 && n <= 60) {
      s.solarPanels = n;
      s.solarKwp = Math.round(n * KWP_PER_PANEL * 10) / 10;
      s.solarEstimated = false;
      if (s.hasSolar === undefined) s.hasSolar = true;
    }
  }

  if (/back[- ]?up|stroompanne|stroomonderbrek|stroomuitval|blackout/.test(t)) s.backupImportant = true;
  // Possession signals only — "Tesla" or "laadpaal" at home usually implies
  // ownership; mere interest like "tesla kopen" would miss this, which is fine
  // (the extractor handles the ambiguous cases).
  if (/\b(heb|hebben|rijd|rijden|staat|hebben al).{0,20}(ev|elektrische (wagen|auto)|tesla|bmw i[34]|polestar)\b|\b(onze|mijn) (ev|elektrische (wagen|auto)|tesla|laadpaal)\b|\blaadpaal (thuis|op de oprit|aan (het|ons) huis)\b/.test(t)) s.hasEv = true;
  // Only mark hasHeatPump when the user clearly says they already OWN one.
  // Asking a question about heat pumps is intent (→ track), not possession.
  if (/\b(ik heb|we hebben|wij hebben|ik bezit|we bezitten|onze|mijn|bestaande|huidige) (al )?(lucht[-/]?water[- ]?)?warmtepomp\b/.test(t)) s.hasHeatPump = true;
  if (/dynamisch|tibber|bolt energie|engie dynamic|uurtarief/.test(t)) s.dynamicTariff = true;

  // Heat-pump specific seed hints.
  if (/\bklaar met gas\b|\bweg met gas\b|\bvan gas af\b|\bstoppen met gas\b|\bgas eruit\b|\bgasketel\b|\bgasrekening\b|\bcv[- ]?ketel\b/.test(t)) {
    s.track = "heatpump";
    s.hpCurrentSource = "gas";
  }
  if (/\bmazout\b|\bstookolie\b|\bmazoutketel\b/.test(t)) {
    s.hpCurrentSource = "oil";
    if (s.track === undefined) s.track = "heatpump";
  }
  // Soft-signal fallback for the Claude-off path: pain around heating costs
  // points to a heat-pump search even without the product name being uttered.
  if (s.track === undefined && /\b(hoge|dure|stijgende) (gas|verwarmings)(prijs|prijzen|rekening|kost)\b|\b(verwarming|ketel) is (te )?(duur|oud)\b|\bkoud huis\b/.test(t)) {
    s.track = "heatpump";
  }
  // Battery-side soft signal: clear solar-optimisation framing without any
  // heating mention — likely a battery shopper.
  if (s.track === undefined && /\b(zelfverbruik|injectievergoeding|capaciteitstarief|teveel injecteren|panelen beter benutten|overschot opslaan)\b/.test(t)) {
    s.track = "battery";
  }
  if (/vloerverwarming/.test(t)) s.hpEmission = "floor";
  else if (/radiatoren/.test(t)) s.hpEmission = "radiators";

  return s;
}

// The set of steps that are still open (applicable + unanswered) given the
// current state. The extractor uses this to pick a natural next step instead
// of marching through the scripted order.
export function openSteps(state: DiscoveryState): AskStep[] {
  const out: AskStep[] = [];
  const push = (s: AskStep) => { if (!isAnswered(s, state)) out.push(s); };

  push("ask_name");
  push("ask_product");

  if (state.track === "heatpump") {
    push("ask_hp_house_age");
    push("ask_hp_insulation");
    push("ask_hp_household");
    push("ask_hp_emission");
    push("ask_hp_source");
    if (state.hpCurrentSource === "gas") push("ask_hp_gas_m3");
    else if (state.hpCurrentSource === "oil") push("ask_hp_oil_l");
    else if (state.hpCurrentSource === "heatpump") push("ask_hp_current_kw");
    push("ask_hp_budget");
  } else {
    push("ask_solar");
    if (state.hasSolar === true) push("ask_solar_panels");
    push("ask_usage_profile");
    push("ask_ev_hp");
    push("ask_tariff");
    push("ask_backup");
    push("ask_budget");
  }
  return out;
}

export function skipKnown(step: FlowStep, state: DiscoveryState): FlowStep {
  let current = step;
  for (let i = 0; i < 20 && current !== "summary"; i++) {
    if (!isAnswered(current, state)) return current;
    current = nextStepAfter(current, state);
  }
  return current;
}

export function interpretFreeText(
  step: AskStep,
  text: string,
  _state: DiscoveryState,
): Partial<DiscoveryState> {
  const patch: Partial<DiscoveryState> = { ...parseSeed(text) };
  const t = text.toLowerCase().trim();

  switch (step) {
    case "ask_name": {
      if (!patch.firstName) {
        const raw = text.trim().split(/\s+/)[0].replace(/[.,!?]/g, "");
        if (/^[A-Za-zÀ-ÿ]{2,30}$/.test(raw)) {
          patch.firstName = raw[0].toUpperCase() + raw.slice(1);
        }
      }
      break;
    }
    case "ask_product":
      if (patch.track === undefined) {
        if (/warmtepomp|heat\s*pump/.test(t)) patch.track = "heatpump";
        else if (/batterij|thuisbatterij|opslag/.test(t)) patch.track = "battery";
      }
      break;
    case "ask_solar":
      if (patch.hasSolar === undefined) {
        if (/\b(ja|jawel|jup|jep|yep|yeah|zeker|inderdaad|klopt|heb er|heb ze)\b/.test(t)) patch.hasSolar = true;
        else if (/\b(nee|neen|nope|niet|geen|nog niet)\b/.test(t)) patch.hasSolar = false;
      }
      break;
    case "ask_solar_panels": {
      if (patch.solarPanels === undefined) {
        if (/\bweet (ik )?(het )?niet|geen idee\b/.test(t)) {
          patch.solarPanels = 14;
          patch.solarKwp = Math.round(14 * KWP_PER_PANEL * 10) / 10;
          patch.solarEstimated = true;
        } else {
          const n = t.match(/\b(\d{1,2})\b/);
          if (n) {
            const num = Number(n[1]);
            if (num >= 2 && num <= 60) {
              patch.solarPanels = num;
              patch.solarKwp = Math.round(num * KWP_PER_PANEL * 10) / 10;
              patch.solarEstimated = false;
            }
          }
        }
      }
      break;
    }
    case "ask_usage_profile": {
      if (patch.yearlyUsageKwh === undefined) {
        if (/\b(alleen|alleenstaand|single)\b/.test(t)) { patch.yearlyUsageKwh = 1800; patch.usageEstimated = true; }
        else if (/\bkoppel|met (z'n)? tweeën|twee personen\b/.test(t)) { patch.yearlyUsageKwh = 3500; patch.usageEstimated = true; }
        else if (/\b(klein )?gezin( van)? [34]|3 pers|4 pers|3 kinderen|2 kinderen\b/.test(t)) { patch.yearlyUsageKwh = 4500; patch.usageEstimated = true; }
        else if (/\bgroot gezin|[567] pers|elektrisch verwarm|4 kinderen|5 kinderen\b/.test(t)) { patch.yearlyUsageKwh = 7000; patch.usageEstimated = true; }
        else {
          const m = t.match(/(\d[\d.,]{2,5})\s*(kwh|kw\/h)/);
          if (m) {
            const n = Number(m[1].replace(/[.,]/g, ""));
            if (n >= 500 && n <= 20000) { patch.yearlyUsageKwh = n; patch.usageEstimated = false; }
          }
        }
      }
      break;
    }
    case "ask_household_size": {
      const m = t.match(/\b([1-7])\b/);
      if (m) {
        const n = Number(m[1]);
        patch.householdSize = n;
        patch.yearlyUsageKwh = kwhForHouseholdSize(n);
        patch.usageEstimated = true;
      }
      break;
    }
    case "ask_usage_kwh": {
      const m = t.match(/(\d[\d.,]{2,5})/);
      if (m) {
        const n = Number(m[1].replace(/[.,]/g, ""));
        if (n >= 500 && n <= 20000) { patch.yearlyUsageKwh = n; patch.usageEstimated = false; }
      }
      break;
    }
    case "ask_ev_hp": {
      if (/\b(geen van beide|geen|niks|niet)\b/.test(t) && !/\b(ev|wagen|warmtepomp|tesla)\b/.test(t)) {
        if (patch.hasEv === undefined) patch.hasEv = false;
        if (patch.hasHeatPump === undefined) patch.hasHeatPump = false;
      }
      break;
    }
    case "ask_tariff": {
      if (patch.dynamicTariff === undefined) {
        if (/\b(dynamisch|per uur|uurtarief|variabel|verandert|tibber|bolt)\b/.test(t)) patch.dynamicTariff = true;
        else if (/\b(vast|vaste prijs|gewoon|traditioneel|nee|geen dynamisch)\b/.test(t)) patch.dynamicTariff = false;
        else if (/weet (ik )?(het )?niet|geen idee/.test(t)) { patch.dynamicTariff = false; patch.tariffUnknown = true; }
      }
      break;
    }
    case "ask_backup": {
      if (patch.backupImportant === undefined) {
        if (/(heel belangrijk|prioriteit|zeker nodig|absoluut|essentieel|moet echt)/.test(t)) patch.backupImportant = true;
        else if (/(nice to have|leuk|bonus|handig)/.test(t)) patch.backupImportant = false;
        else if (/(niet nodig|geen|maakt niet uit|boeit niet)/.test(t)) patch.backupImportant = false;
      }
      break;
    }
    case "ask_budget":
    case "ask_hp_budget": {
      let budget: "entry" | "mid" | "premium" | undefined;
      if (/(goedkoop|betaalbaar|instap|scherp|zo min mogelijk|weinig)/.test(t)) budget = "entry";
      else if (/(balans|midden|gemiddeld|normaal|schappelijk)/.test(t)) budget = "mid";
      else if (/(beste|premium|top|luxe|hoogste kwaliteit|niet op een euro)/.test(t)) budget = "premium";
      if (budget) {
        if (step === "ask_hp_budget") patch.hpBudget = budget;
        else patch.budget = budget;
      }
      break;
    }
    case "ask_hp_house_age":
      if (/(ouder|meer dan 10|oud|renovat|jaren 70|jaren 80|jaren 90|jaren 2000)/.test(t)) patch.hpHouseOld = true;
      else if (/(nieuwbouw|recent|nieuw|minder dan 10|jonger)/.test(t)) patch.hpHouseOld = false;
      break;
    case "ask_hp_insulation":
      if (/(slecht|geen isolat|enkel glas|oud)/.test(t)) patch.hpInsulation = "poor";
      else if (/(matig|dakisolat|deels)/.test(t)) patch.hpInsulation = "moderate";
      else if (/(goed|dubbel glas|volledig|hr-glas)/.test(t)) patch.hpInsulation = "good";
      else if (/(uitstek|passief|ben|triple)/.test(t)) patch.hpInsulation = "excellent";
      break;
    case "ask_hp_household": {
      const m = t.match(/\b([1-9])\b/);
      if (m) patch.householdSize = Math.max(1, Math.min(7, Number(m[1])));
      else if (/\b(alleen|1 pers)\b/.test(t)) patch.householdSize = 1;
      else if (/koppel|met z'n tweeën|2 pers/.test(t)) patch.householdSize = 2;
      break;
    }
    case "ask_hp_emission":
      if (/vloerverwarm/.test(t)) patch.hpEmission = "floor";
      else if (/radiator/.test(t)) patch.hpEmission = "radiators";
      else if (/(mix|combinatie|beide)/.test(t)) patch.hpEmission = "mix";
      break;
    case "ask_hp_source":
      if (/gas/.test(t)) patch.hpCurrentSource = "gas";
      else if (/mazout|stookolie/.test(t)) patch.hpCurrentSource = "oil";
      else if (/warmtepomp|heat\s*pump/.test(t)) patch.hpCurrentSource = "heatpump";
      break;
    case "ask_hp_gas_m3": {
      const m = t.match(/(\d[\d.,]{2,5})/);
      if (m) {
        const n = Number(m[1].replace(/[.,]/g, ""));
        if (n >= 200 && n <= 10000) patch.hpGasM3 = n;
      }
      break;
    }
    case "ask_hp_oil_l": {
      const m = t.match(/(\d[\d.,]{2,5})/);
      if (m) {
        const n = Number(m[1].replace(/[.,]/g, ""));
        if (n >= 200 && n <= 10000) patch.hpOilL = n;
      }
      break;
    }
    case "ask_hp_current_kw": {
      const m = t.match(/\b(\d{1,2}(?:[.,]\d)?)\b/);
      if (m) {
        const n = Number(m[1].replace(",", "."));
        if (n >= 3 && n <= 25) patch.hpCurrentKw = n;
      }
      break;
    }
  }

  return patch;
}

export function scriptedFaqReply(text: string): string | null {
  const t = text.toLowerCase();
  if (/(warmtepomp).*(kost|prijs|hoeveel|duur|euro)|prijs.*warmtepomp/.test(t))
    return "Een lucht/water warmtepomp kost in België meestal tussen €8.000 en €17.000 inclusief plaatsing. Het exacte bedrag hangt af van vermogen, SWW-buffer en de staat van je afgiftesysteem.";
  if (/(kost|prijs|hoeveel|duur|goedkoop|euro|€)/.test(t))
    return "Een thuisbatterij kost in België doorgaans tussen €5.000 en €13.000, inclusief plaatsing. Warmtepompen zitten typisch tussen €8.000 en €17.000.";
  if (/(waarborg|garantie|levensduur|hoelang|jaren)/.test(t))
    return "Thuisbatterijen hebben meestal 10 jaar garantie, warmtepompen 5 tot 7 jaar afhankelijk van merk. Homate geeft daarbovenop minimum 2 jaar installatiegarantie.";
  if (/(installat|plaatsing|duurt|werkdagen|hoe lang)/.test(t))
    return "Een batterij plaatsen duurt 1 dag. Een warmtepomp inclusief demontage van gasketel meestal 2 tot 3 werkdagen. Tussen bestelling en plaatsing zit 2 tot 4 weken.";
  if (/(rendabel|terugverdien|payback|zinvol|waard)/.test(t))
    return "Warmtepompen besparen tot 75% op je verwarmingskost t.o.v. mazout of gas. Thuisbatterijen hebben een typische terugverdientijd van 7 tot 10 jaar.";
  if (/(merk|welke warmtepomp|daikin|vaillant)/.test(t))
    return "We werken met Daikin en Vaillant voor warmtepompen, Huawei/AlphaESS/SMA/Dyness voor batterijen. Welke het best past volgt uit je antwoorden.";
  if (/(premie|subsid|mijn verbouwpremie|renolution)/.test(t))
    return "Voor warmtepompen is er in Vlaanderen Mijn VerbouwPremie (tot €4.000 afhankelijk van inkomen). In Brussel RENOLUTION, in Wallonië primes habitation. Daarbij komt 6% BTW voor woningen ≥10 jaar.";
  if (/(back[- ]?up|stroompanne|uitval)/.test(t))
    return "Niet elke batterij heeft back-up ingebouwd. Als back-up voor jou belangrijk is, focussen we op modellen mét die functie.";
  if (/(capaciteit|kwh|grootte|hoe groot)/.test(t))
    return "Thuisbatterijen beginnen rond 5 kWh en gaan tot 15+ kWh. De ideale grootte hangt af van je verbruik, zonnepanelen en of je een EV/warmtepomp hebt.";
  if (/(scop|cop|rendement)/.test(t))
    return "SCOP is het seizoensrendement van een warmtepomp: SCOP 4 betekent dat je 4 kWh warmte krijgt uit 1 kWh elektriciteit. Onze modellen zitten tussen 4.2 en 4.6.";
  return null;
}

export function nudgeLineFor(step: AskStep, state: DiscoveryState): string {
  const name = state.firstName ? `, ${state.firstName}` : "";
  switch (step) {
    case "ask_name": return `Om verder te gaan: hoe mag ik je noemen${name}?`;
    case "ask_product": return `Waarvoor kunnen we je helpen — thuisbatterij of warmtepomp?`;
    case "ask_solar": return `Terug naar de vraag: heb je al zonnepanelen?`;
    case "ask_solar_panels": return `Hoeveel panelen heb je ongeveer? Een schatting volstaat.`;
    case "ask_usage_profile": return `Welk profiel past het best bij je verbruik?`;
    case "ask_household_size": return `Met hoeveel personen in het gezin?`;
    case "ask_usage_kwh": return `Wat is je jaarverbruik ongeveer?`;
    case "ask_ev_hp": return `Heb je een elektrische wagen of warmtepomp?`;
    case "ask_tariff": return `Verandert je elektriciteitsprijs per uur/dag, of is het een vaste prijs?`;
    case "ask_backup": return `Hoe belangrijk is back-upstroom voor jou?`;
    case "ask_budget": return `Waar mik je op qua budget — instap, balans of premium?`;
    case "ask_hp_house_age": return `Hoe oud is je woning — jonger of ouder dan 10 jaar?`;
    case "ask_hp_insulation": return `Hoe goed is je woning geïsoleerd?`;
    case "ask_hp_household": return `Met hoeveel personen wonen jullie in de woning?`;
    case "ask_hp_emission": return `Radiatoren, vloerverwarming of een combinatie?`;
    case "ask_hp_source": return `Verwarm je nu op gas, mazout of een bestaande warmtepomp?`;
    case "ask_hp_gas_m3": return `Wat is je jaarlijks gasverbruik ongeveer?`;
    case "ask_hp_oil_l": return `Hoeveel liter mazout per jaar ongeveer?`;
    case "ask_hp_current_kw": return `Wat is het kW-vermogen van je huidige warmtepomp?`;
    case "ask_hp_budget": return `Welk budget past het best — instap, balans of premium?`;
  }
}

export function isAnswered(step: AskStep, state: DiscoveryState): boolean {
  switch (step) {
    case "ask_name": return Boolean(state.firstName);
    case "ask_product": return state.track !== undefined;
    case "ask_solar": return state.hasSolar !== undefined;
    case "ask_solar_panels": return state.solarPanels !== undefined;
    case "ask_usage_profile": return state.yearlyUsageKwh !== undefined;
    case "ask_household_size": return state.householdSize !== undefined;
    case "ask_usage_kwh": return false;
    case "ask_ev_hp": return state.hasEv !== undefined || state.hasHeatPump !== undefined;
    case "ask_tariff": return state.dynamicTariff !== undefined;
    case "ask_backup": return state.backupImportant !== undefined;
    case "ask_budget": return state.budget !== undefined;
    case "ask_hp_house_age": return state.hpHouseOld !== undefined;
    case "ask_hp_insulation": return state.hpInsulation !== undefined;
    case "ask_hp_household": return state.householdSize !== undefined;
    case "ask_hp_emission": return state.hpEmission !== undefined;
    case "ask_hp_source": return state.hpCurrentSource !== undefined;
    case "ask_hp_gas_m3": return state.hpGasM3 !== undefined;
    case "ask_hp_oil_l": return state.hpOilL !== undefined;
    case "ask_hp_current_kw": return state.hpCurrentKw !== undefined;
    case "ask_hp_budget": return state.hpBudget !== undefined;
  }
}

export function nextStepAfter(step: AskStep, state: DiscoveryState, rawValue?: string): FlowStep {
  const v = rawValue?.trim().toLowerCase();

  switch (step) {
    case "ask_name":
      return "ask_product";
    case "ask_product":
      if (state.track === "heatpump") return "ask_hp_house_age";
      return "ask_solar"; // battery track (and fallback for "both")
    // Battery
    case "ask_solar":
      return state.hasSolar ? "ask_solar_panels" : "ask_usage_profile";
    case "ask_solar_panels":
      return "ask_usage_profile";
    case "ask_usage_profile":
      if (v === "unknown") return "ask_household_size";
      if (v === "precies") return "ask_usage_kwh";
      return "ask_ev_hp";
    case "ask_household_size":
      return state.track === "heatpump" ? "ask_hp_emission" : "ask_ev_hp";
    case "ask_usage_kwh":
      return "ask_ev_hp";
    case "ask_ev_hp":
      return "ask_tariff";
    case "ask_tariff":
      return "ask_backup";
    case "ask_backup":
      return "ask_budget";
    case "ask_budget":
      return "summary";
    // Heat pump
    case "ask_hp_house_age":
      return "ask_hp_insulation";
    case "ask_hp_insulation":
      return "ask_hp_household";
    case "ask_hp_household":
      return "ask_hp_emission";
    case "ask_hp_emission":
      return "ask_hp_source";
    case "ask_hp_source":
      if (state.hpCurrentSource === "gas") return "ask_hp_gas_m3";
      if (state.hpCurrentSource === "oil") return "ask_hp_oil_l";
      if (state.hpCurrentSource === "heatpump") return "ask_hp_current_kw";
      return "ask_hp_budget";
    case "ask_hp_gas_m3":
    case "ask_hp_oil_l":
    case "ask_hp_current_kw":
      return "ask_hp_budget";
    case "ask_hp_budget":
      return "summary";
  }
}
