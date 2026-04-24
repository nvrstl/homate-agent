// Hybrid Claude driver.
//
// The frontend owns the step machine + widgets (chips/sliders). For each
// transition, it asks this endpoint to phrase the Dutch question naturally
// — optionally reacting to what the user just typed/picked. Scripted
// fallback is used if the API is unavailable or returns an error, so
// nothing breaks in dev or when quota runs out.
//
// Body: {
//   step: "ask_name" | "ask_solar" | ... ,
//   state: DiscoveryState,
//   lastUserInput?: string,
//   history?: Array<{role, content}>
// }
// Response: { reply: string }

import Anthropic from "@anthropic-ai/sdk";
import { PostHog } from "posthog-node";

export const config = { runtime: "edge" };

const SYSTEM_PROMPT = `Je bent de Homate-adviseur, een warme en deskundige Belgische
energie-expert. Homate (onderdeel van Camino Group, 15+ jaar ervaring) helpt
huiseigenaars met de keuze en installatie van:
• THUISBATTERIJEN (Huawei, AlphaESS, SMA, Dyness)
• WARMTEPOMPEN (Daikin, Vaillant)
• combinaties met zonnepanelen, back-up, dynamische contracten.

BELANGRIJK — geen product-bias:
- Ga NIET automatisch uit van een thuisbatterij. Homate verkoopt beide en je bent
  product-neutraal totdat de klant een richting heeft gegeven.
- Als 'track' niet gezet is in state, weet je NOG NIET welk product bij deze klant
  past. Spreek dan in het algemeen over "de juiste oplossing voor jouw woning" of
  noem EXPLICIET beide opties ("thuisbatterij of warmtepomp"). Nooit alleen batterij.
- Lees wat de klant zei. Als ze "mijn gasrekening is te hoog" schreven, praat dan
  over verwarming/warmtepomp — niet over zonnepanelen en batterijen.
- Bij meta- of begroetingsvragen ("hoe kan je helpen?", "hallo?"), antwoord warm
  en open: leg kort uit WAT Homate doet (beide productgroepen noemen) en vraag
  waar het om draait voor hen. Geen pitch, geen "je batterij".

TOON & STIJL
- Spreek de klant altijd aan met "je/jij" (nooit "u").
- Nederlands, warm maar niet overdreven enthousiast. Geen emoji. Geen uitroeptekens stapelen.
- Concreet en to-the-point. Standaard max 2 zinnen per beurt, behalve in een
  begroeting waar je de scope moet uitleggen (dan mag 3 zinnen).
- Gebruik Belgische energiecontext waar het helpt (capaciteitstarief, dynamisch
  tarief, digitale meter, injectievergoeding, zelfverbruik, mijn verbouwpremie).
  Niet overdrijven met jargon.
- Noem het altijd "prijsindicatie", nooit "offerte".
- Vermeld nooit dat je een AI bent of welk model je gebruikt.

WERKWIJZE
- Je krijgt per beurt één STAP. Stel ALLEEN de vraag die bij die stap hoort.
- Stel één vraag tegelijk. Geen lijsten van opties in de tekst — de UI toont chips/sliders.
- Als de gebruiker iets opmerkelijks vertelde (bv. "we wonen in een rijhuis",
  "ik heb een tesla"), reageer kort en persoonlijk (max 1 zin) voor je de vraag stelt.
- Als de gebruiker iets vraagt buiten je scope, antwoord kort en feitelijk en keer
  zonder jargon terug naar de huidige stap-vraag.
- Geef NOOIT prijsindicaties of productaanbevelingen in de chat — dat gebeurt op de
  volgende pagina. Hou de conversatie bij het verzamelen van info.

STATE-VELDEN — verwar deze NIET:
- track="heatpump": de klant WIL een warmtepomp (zoekt advies, wil er een kopen).
- track="battery": de klant WIL een thuisbatterij.
- track ontbreekt: je weet het NOG NIET — niet aannemen dat het batterij is.
- hasHeatPump=true: de klant HEEFT al een warmtepomp staan.
- hasEv=true: de klant HEEFT al een EV.
Verwijs alleen naar "al een X" wanneer de bijbehorende hasX=true. Bij track alleen
weet je alleen wat ze zoeken, niet wat ze bezitten.`;

type Step =
  | "ask_name"
  | "ask_solar"
  | "ask_solar_panels"
  | "ask_usage_profile"
  | "ask_household_size"
  | "ask_usage_kwh"
  | "ask_ev_hp"
  | "ask_tariff"
  | "ask_backup"
  | "ask_budget"
  | "summary";

interface DiscoveryState {
  firstName?: string;
  hasSolar?: boolean;
  solarKwp?: number;
  solarPanels?: number;
  solarEstimated?: boolean;
  yearlyUsageKwh?: number;
  usageEstimated?: boolean;
  householdSize?: number;
  dynamicTariff?: boolean;
  tariffUnknown?: boolean;
  hasEv?: boolean;
  hasHeatPump?: boolean;
  budget?: "entry" | "mid" | "premium";
  backupImportant?: boolean;
}

interface NarrateProduct {
  kind: "battery" | "heatpump";
  brand: string;
  model: string;
  bestFor: string;
  highlights: string[];
  tier?: "entry" | "mid" | "premium";
  // Battery-specific
  usableKwh?: number;
  warrantyYears?: number;
  backup?: boolean;
  // Heat-pump-specific
  nominalKw?: number;
  scop?: number;
  dhwLiters?: number;
}

interface NarrateMetrics {
  estimatedYearlySavingsEur?: number;
  paybackYears?: number;
  co2SavedKgPerYear?: number;
  selfConsumptionIncreasePct?: number;
  targetKw?: number;
  subsidyEur?: number;
  netPriceAfterSubsidy?: number;
  priceIncl?: number;
}

interface Body {
  mode?: "qa" | "narrate";
  question?: string;
  step?: Step;
  state?: DiscoveryState;
  lastUserInput?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  // Narrate-mode fields
  product?: NarrateProduct;
  metrics?: NarrateMetrics;
}

// Per-step instruction: tells Claude what info to collect in this turn.
// Crucial: the widget (chips/slider) is rendered by the frontend, so Claude
// should just ask the question naturally — not list options.
function stepInstruction(step: Step, state: DiscoveryState, lastUserInput?: string): string {
  const name = state.firstName ?? "de klant";
  switch (step) {
    case "ask_name": {
      const hasSeed = Boolean(lastUserInput);
      const hasIntent = state.track !== undefined;
      if (hasSeed && !hasIntent) {
        // Open / meta / ambiguous seed — respond to what they actually wrote,
        // explain scope (BOTH products), then ask the name. No battery pitch.
        return `De seed-input van de gebruiker is open of vaag (bv. een begroeting of een algemene vraag zoals "hoe kan je me helpen?"). Doe 3 dingen in MAX 3 zinnen:
1) Reageer genuïne op wat ze schreven — spiegel hun eigen taal, geen template-begroeting.
2) Leg in één zin uit wat Homate doet: thuisbatterijen én warmtepompen voor Belgische woningen (beide benoemen, niet alleen batterij).
3) Vraag naar hun voornaam. Geen opgesomde opties, geen pitch, geen aannames over welk product ze willen.`;
      }
      if (hasSeed && hasIntent) {
        // Intent is clear — acknowledge it in their language, then the name.
        return `De gebruiker heeft in hun seed-bericht al een duidelijke richting gegeven (zie state.track). Erken dat kort en persoonlijk (1 zin die hun eigen bewoordingen spiegelt — GEEN product-pitch), en vraag naar hun voornaam. Max 2 zinnen.`;
      }
      return `Begroet kort en warm. Vertel in één zin dat je helpt bij de juiste keuze voor thuisbatterij óf warmtepomp. Vraag dan naar de voornaam. Max 2 zinnen.`;
    }
    case "ask_solar":
      return `Spreek ${name} aan bij naam. Vraag of hij/zij al zonnepanelen op het dak heeft. Eén zin intro + één vraag.`;
    case "ask_solar_panels":
      return `De klant heeft zonnepanelen. Reageer positief (1 zin, bv. combinatie batterij + panelen is ideaal sinds capaciteitstarief) en vraag hoeveel panelen er ongeveer op het dak liggen. Geen kWp vragen — panelen is laagdrempeliger. Stel gerust dat een schatting prima is.`;
    case "ask_usage_profile":
      if (state.hasSolar === false) {
        return `De klant heeft GEEN zonnepanelen. Stel kort gerust dat een batterij ook zonder panelen kan renderen (bv. op dynamisch tarief) en vraag welk profiel het best past bij het elektriciteitsverbruik. Geen kWh-getal vragen in de tekst — de UI toont profielen.`;
      }
      return `Vraag welk profiel het best past bij het elektriciteitsverbruik van de klant (alleenstaand, koppel, gezin, groot gezin). Geen kWh-getal in de tekst — de UI toont profielen en heeft ook opties voor "weet ik niet" en "ik weet het precies".`;
    case "ask_household_size":
      return `De klant weet zijn/haar verbruik niet. Stel gerust dat we het samen schatten en vraag hoeveel personen er in het gezin wonen. Max 2 zinnen.`;
    case "ask_usage_kwh":
      return `De klant wil het precieze jaarverbruik ingeven. Vraag kort naar het jaarverbruik in kWh — vermeld dat dit op de eindafrekening staat. Eén zin.`;
    case "ask_ev_hp":
      return `Vraag of de klant een elektrische wagen en/of warmtepomp heeft. Leg in één korte bijzin uit waarom dit de batterijgrootte beïnvloedt.`;
    case "ask_tariff":
      return `Vraag of de elektriciteitsprijs per uur/dag verandert of dat het een vaste prijs is. Gebruik géén jargon zoals "dynamisch contract" — herformuleer in gewone taal. De UI heeft ook een "weet ik niet"-chip, dus maak het laagdrempelig. Max 2 zinnen.`;
    case "ask_backup":
      return `Vraag hoe belangrijk back-upstroom bij stroompanne is. Kort houden.`;
    case "ask_budget":
      return `Vraag waar de klant mikt qua budget. Benadruk dat er geen harde grens is — helpt alleen de focus.`;
    case "summary": {
      const bullets: string[] = [];
      if (state.hasSolar) {
        const panelStr = state.solarPanels ? `${state.solarPanels} panelen, ±${state.solarKwp ?? "?"} kWp` : `${state.solarKwp ?? "?"} kWp`;
        bullets.push(`zonnepanelen (${panelStr}${state.solarEstimated ? ", geschat" : ""})`);
      } else bullets.push(`geen zonnepanelen`);
      bullets.push(`jaarverbruik ~${state.yearlyUsageKwh ?? "?"} kWh${state.usageEstimated ? " (geschat)" : ""}`);
      if (state.hasEv) bullets.push(`elektrische wagen`);
      if (state.hasHeatPump) bullets.push(`warmtepomp`);
      if (state.dynamicTariff) bullets.push(`dynamisch contract`);
      if (state.backupImportant) bullets.push(`back-up gewenst`);
      return `Samenvatting van ${bullets.join(", ")}. Zeg kort dat je alles helder hebt, vat de situatie op in één zin, en eindig met: "Ik bereken nu jouw ideale thuisbatterij…" — GEEN aanbeveling in de chat, dat volgt op de volgende pagina.`;
    }
    default:
      return "";
  }
}

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  // Q&A mode: user asked a free-form question mid-flow. Answer it briefly and
  // nudge back to the current scripted step.
  let userPrompt: string;
  if (body.mode === "qa" && body.question) {
    userPrompt = `De gebruiker stelt tijdens het gesprek een vraag of wedervraag: "${body.question}".

Context: huidige scripted stap is "${body.step}". Wat we al weten over de klant: ${JSON.stringify(body.state)}.

Beantwoord wat ze vragen op HUN onderwerp — niet een ander. Als ze over verwarming vragen, ga niet over batterijen beginnen. Als state.track niet gezet is, neem GEEN product aan. Kort en feitelijk, Nederlands, geen verkoop-opsmuk. Standaard max 2 zinnen; mag 3 als de vraag echt vraagt om context.

Sluit af met één korte, luchtige zin die hen uitnodigt terug te keren naar de huidige stap-vraag — in gewone taal, geen "laten we terugkeren"-jargon.
Schrijf ALLEEN de tekst die de adviseur zou zeggen. Geen prefix, geen quotes.`;
  } else if (body.mode === "narrate" && body.product && body.state) {
    const p = body.product;
    const m = body.metrics ?? {};
    const specs: string[] = [];
    if (p.kind === "battery") {
      if (p.usableKwh) specs.push(`${p.usableKwh} kWh bruikbaar`);
      if (p.warrantyYears) specs.push(`${p.warrantyYears}j waarborg`);
      if (p.backup !== undefined) specs.push(p.backup ? "met back-up" : "zonder back-up");
    } else {
      if (p.nominalKw) specs.push(`${p.nominalKw} kW nominaal`);
      if (p.scop) specs.push(`SCOP ${p.scop}`);
      if (p.dhwLiters) specs.push(`${p.dhwLiters} L SWW-buffer`);
    }
    const metricLines: string[] = [];
    if (m.estimatedYearlySavingsEur) metricLines.push(`jaarbesparing ±€${m.estimatedYearlySavingsEur}`);
    if (m.paybackYears) metricLines.push(`terugverdien ±${m.paybackYears}j`);
    if (m.selfConsumptionIncreasePct) metricLines.push(`zelfverbruik +${m.selfConsumptionIncreasePct}%`);
    if (m.targetKw) metricLines.push(`berekend vermogen ${m.targetKw} kW`);
    if (m.co2SavedKgPerYear) metricLines.push(`CO₂-reductie ${m.co2SavedKgPerYear} kg/j`);
    if (m.subsidyEur) metricLines.push(`subsidie €${m.subsidyEur}`);

    userPrompt = `Je schrijft de "Waarom voor jou"-toelichting op de voorstelpagina.

Klant: ${JSON.stringify(body.state)}.
Aanbevolen ${p.kind === "battery" ? "thuisbatterij" : "warmtepomp"}: ${p.brand} ${p.model} — ${p.bestFor}.
Specs: ${specs.join(", ") || "n.v.t."}.
Berekende cijfers: ${metricLines.join(", ") || "n.v.t."}.
Highlights uit de catalogus: ${p.highlights.join(" • ")}.

Schrijf 2–3 zinnen in het Nederlands, je/jij, warm en concreet. Leg uit waarom DIT model bij DEZE klant past — gebruik 2 à 3 elementen uit hun situatie (bv. Tesla → hogere nachtlading, vloerverwarming → lage-temperatuur ideaal, geen zonnepanelen → dynamisch tarief compenseert). Geen bullet points, geen opsomming van specs, geen uitroeptekens, geen prijs. Niet beginnen met "Deze ${p.kind === "battery" ? "batterij" : "warmtepomp"}" — varieer. Geen prefix of quotes, alleen de prozatekst.`;
  } else {
    if (!body.step || !body.state) {
      return new Response(JSON.stringify({ error: "Missing step/state" }), { status: 400 });
    }
    const instruction = stepInstruction(body.step, body.state, body.lastUserInput);
    if (!instruction) {
      return new Response(JSON.stringify({ error: "Unknown step" }), { status: 400 });
    }
    const contextBlurb = body.lastUserInput
      ? `De gebruiker zei net: "${body.lastUserInput}". `
      : "";
    userPrompt = `${contextBlurb}Huidige stap: ${body.step}.
Context over de klant zover: ${JSON.stringify(body.state)}.

Jouw taak: ${instruction}

Schrijf ALLEEN de Nederlandse tekst die de adviseur nu zou zeggen. Geen prefix, geen
quotes, geen labels zoals "Adviseur:". Geen lijst van opties. Lengte volgens de
instructie; bij twijfel max 2 zinnen.`;
  }

  // Build conversation: past turns (if any) give Claude tone continuity.
  const history = (body.history ?? []).slice(-8);

  const anthropicClient = new Anthropic({ apiKey });
  const posthog = new PostHog(process.env.VITE_POSTHOG_KEY ?? "", {
    host: process.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });
  const distinctId = body.state?.firstName ?? "anonymous";
  const traceId = crypto.randomUUID();
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userPrompt },
  ];

  try {
    const t0 = Date.now();
    const resp = await anthropicClient.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 320,
      system: SYSTEM_PROMPT,
      messages,
    });
    const latency = (Date.now() - t0) / 1000;

    const text = resp.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("\n")
      .trim();

    await posthog.captureImmediate({
      distinctId,
      event: "$ai_generation",
      properties: {
        $ai_trace_id: traceId,
        $ai_model: resp.model,
        $ai_provider: "anthropic",
        $ai_input_tokens: resp.usage.input_tokens,
        $ai_output_tokens: resp.usage.output_tokens,
        $ai_latency: latency,
        $ai_max_tokens: 220,
        $ai_stop_reason: resp.stop_reason,
        $ai_input: messages,
        $ai_output_choices: [{ role: "assistant", content: text }],
        $ai_is_error: false,
        step: body.step,
      },
    });
    await posthog.shutdown();

    return new Response(JSON.stringify({ reply: text }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("claude error", err);
    posthog.captureException(err, distinctId, { step: body.step });
    await posthog.captureImmediate({
      distinctId,
      event: "$ai_generation",
      properties: {
        $ai_trace_id: traceId,
        $ai_model: "claude-haiku-4-5-20251001",
        $ai_provider: "anthropic",
        $ai_is_error: true,
        $ai_error: err instanceof Error ? err.message : String(err),
        step: body.step,
      },
    });
    await posthog.captureImmediate({
      distinctId,
      event: "chat_model_error",
      properties: { step: body.step },
    });
    await posthog.shutdown();
    return new Response(JSON.stringify({ error: "Model call failed" }), { status: 500 });
  }
}
