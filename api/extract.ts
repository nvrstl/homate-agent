// Agentic extractor.
//
// One tool-use call per user turn. Replaces regex-based parsing with Claude
// extracting structured DiscoveryState updates AND choosing the next scripted
// step to ask. Also emits an optional `topicOfInterest` — a short warm ack in
// Dutch when the user volunteered something notable beyond the asked field.
//
// Body: {
//   currentStep: AskStep,
//   state: DiscoveryState,
//   userText: string,
//   openSteps: AskStep[],       // candidate next steps (client-computed)
//   history?: Array<{role, content}>
// }
// Response: {
//   patch: Partial<DiscoveryState>,
//   answeredCurrent: boolean,
//   nextStep: string,            // one of AskStep | "summary"
//   topicOfInterest?: { topic: string, acknowledgement: string } | null
// }

import Anthropic from "@anthropic-ai/sdk";
import { PostHog } from "posthog-node";

export const config = { runtime: "edge" };

const SYSTEM = `Je bent de extractie-laag van de Homate-adviseur (Belgisch, Nederlands, je/jij).
Per beurt krijg je de huidige discovery-staat, de vraag die net gesteld werd, en de reactie van de gebruiker.

De meegegeven 'state' is de BRON VAN WAARHEID voor al bekende feiten. Je patcht ALLEEN wat bijkomt uit de laatste input. Overschrijf reeds gekende velden NIET tenzij de gebruiker zich expliciet corrigeert ("Nee, toch geen warmtepomp — ik wil een batterij"). Zonder expliciete correctie: laat state.track, state.firstName, state.hasSolar, etc. met rust en zet die NIET in patch.

Roep ALTIJD de tool 'record_turn' aan, met:
- patch: nieuwe velden die uit de LAATSTE gebruikersinput af te leiden zijn — ook als die meerdere antwoorden in één zin geeft. Velden die al in state staan, NIET opnieuw zetten. Velden die je niet met zekerheid kan afleiden, weglaten.
- answeredCurrent: true als de reactie de huidige vraag beantwoordt (direct of impliciet). False als het een wedervraag of off-topic is.
- nextStep: kies uit de meegegeven openSteps welke vraag logisch volgt. Als alles beantwoord is, kies "summary". Kies NOOIT een stap die al in patch wordt beantwoord — dan voelt het als een duplicate vraag.
- topicOfInterest: alleen invullen als de gebruiker iets opmerkelijks deelde BUITEN de vragen die scripted worden gesteld (bv. zwembad, rijhuis, thuiskantoor, nachtverbruik, oudere ouder in huis, pasgeboren baby). NIET invullen voor dingen die sowieso in een latere stap worden gevraagd (warmtepomp/batterij-intentie, gasverbruik, panelen, gezinsgrootte, isolatie, emissiesysteem, budget — die mag je niet 'erkennen', want ze worden straks gewoon gesteld of zijn al beantwoord). Als je toch een topicOfInterest zet, schrijf één warme NL-zin (max 1 zin, geen emoji, geen vraagteken, eindigt op een punt, geen verkooppraat, niet langer dan 12 woorden).

Regels voor extractie:
- Numerieke waardes alleen vullen als ze plausibel zijn. Jaarverbruik elektriciteit 500–20.000 kWh. Gas 200–10.000 m³. Mazout 200–10.000 L. Panelen 2–60. Gezinsgrootte 1–7. hpCurrentKw 3–25.
TRACK-INFERENTIE — wees ASSERTIEF. Als de context één richting wijst, kies die; laat track alleen undefined bij écht ambigue of puur sociale input.

Kies track="heatpump" bij:
- Expliciete warmtepomp-intentie of vraag ("welke warmtepomp", "warmtepomp advies", "warmtepomp plaatsen", "warmtepomp bij renovatie").
- Van-gas/mazout-af signalen: "van gas af", "weg met gas", "stoppen met gas", "gas eruit", "van mazout af", "stookolie weg".
- Verwarmings-pijnpunten: "gasrekening te hoog", "gasprijzen", "oude gasketel", "CV-ketel vervangen", "mazoutketel", "koude winter", "huis is koud", "verwarmingskost".
- Renovatie-context waarbij verwarming centraal staat ("oude woning opknappen en verwarming aanpakken").
- Isolatie-gesprek gecombineerd met verwarming.

Kies track="battery" bij:
- Expliciete batterij/thuisbatterij-intentie of vraag ("welke thuisbatterij", "batterij voor mijn zonnepanelen", "energieopslag").
- Zonnepanelen-optimalisatie: "mijn panelen beter benutten", "teveel injecteren", "zelfverbruik verhogen", "injectievergoeding benutten", "capaciteitstarief".
- Dynamisch-tarief-optimalisatie: "Tibber", "Bolt energie", "uurtarief benutten", "dynamisch contract uitbuiten".
- Back-up/stroompanne-zorgen zonder warmtepomp-context: "back-up bij stroomuitval", "blackout", "stroompanne".
- "Onafhankelijker van het net worden" (zonder verwarmings-context).

Laat track UNDEFINED bij:
- Pure begroetingen ("hallo", "hoi", "waarmee kan je helpen?").
- Volledig ambigue besparen-vragen ("ik wil energie besparen") zonder richting-signaal.

Let op: soft signals wegen mee. "Gasrekening is gek hoog" → track=heatpump, ook zonder het woord 'warmtepomp'. "Mijn zonnepanelen leveren te veel terug" → track=battery, ook zonder het woord 'batterij'.

BEZIT vs. INTENTIE — dit is kritiek, verwar deze niet:
- hasHeatPump=true ALLEEN als de gebruiker expliciet zegt dat ze al een warmtepomp BEZITTEN ("ik heb een warmtepomp", "onze warmtepomp", "bestaande warmtepomp", "huidige warmtepomp"). Een vraag stellen OVER een warmtepomp of er een WILLEN is GEEN bezit.
- hasEv=true ALLEEN bij duidelijk bezit ("ik heb een Tesla", "onze EV", "rij elektrisch"). Niet bij "ik denk aan een EV" of "wil een laadpaal".
- Als state.hasHeatPump=true of state.hasEv=true maar de gebruiker zei dat NOOIT (bv. de regex heeft het foutief gezet omdat de gebruiker alleen een vraag over een warmtepomp stelde), corrigeer het: zet hasHeatPump=false of hasEv=false in patch.

- hpHouseOld: true bij ≥10j woning, oude woning, "jaren 70/80/90", renovatie; false bij nieuwbouw, "minder dan 10j", "recent gebouwd".
- hpCurrentSource: "gas" bij gasketel/CV op gas/"van gas af"; "oil" bij mazout/stookolie; "heatpump" alleen als er al een warmtepomp staat en die vervangen wordt (NIET bij een vraag over een nieuwe warmtepomp).
- hpEmission: "floor" bij vloerverwarming, "radiators" bij radiatoren, "mix" bij combinatie.
- householdSize: "gezin van 5" → 5, "met z'n vijven/vieren" → 5/4, "alleen" → 1, "koppel" → 2.
- Niet hallucineren: als iets onduidelijk is, laat het veld weg.`;

const TOOL_DEF = {
  name: "record_turn",
  description: "Record extracted facts, whether the current question was answered, and the next scripted step.",
  input_schema: {
    type: "object" as const,
    properties: {
      patch: {
        type: "object",
        description: "Partial DiscoveryState updates — only include fields extracted with confidence.",
        properties: {
          firstName: { type: "string" },
          track: { type: "string", enum: ["battery", "heatpump", "both"] },
          hasSolar: { type: "boolean" },
          solarPanels: { type: "number" },
          yearlyUsageKwh: { type: "number" },
          usageEstimated: { type: "boolean" },
          householdSize: { type: "number" },
          hasEv: { type: "boolean" },
          hasHeatPump: { type: "boolean" },
          dynamicTariff: { type: "boolean" },
          tariffUnknown: { type: "boolean" },
          backupImportant: { type: "boolean" },
          budget: { type: "string", enum: ["entry", "mid", "premium"] },
          hpHouseOld: { type: "boolean" },
          hpInsulation: { type: "string", enum: ["poor", "moderate", "good", "excellent"] },
          hpEmission: { type: "string", enum: ["radiators", "floor", "mix"] },
          hpCurrentSource: { type: "string", enum: ["gas", "oil", "heatpump"] },
          hpGasM3: { type: "number" },
          hpOilL: { type: "number" },
          hpCurrentKw: { type: "number" },
          hpBudget: { type: "string", enum: ["entry", "mid", "premium"] },
        },
      },
      answeredCurrent: { type: "boolean" },
      nextStep: {
        type: "string",
        description: "Pick from openSteps. Use 'summary' only if all required info is collected.",
      },
      topicOfInterest: {
        type: "object",
        description: "Set ONLY when the user volunteered a notable detail beyond the asked question.",
        properties: {
          topic: { type: "string", description: "Short tag, bv. 'zwembad', 'tesla', 'thuiskantoor'." },
          acknowledgement: { type: "string", description: "Eén warme NL-zin die dat erkent. Max 1 zin." },
        },
        required: ["topic", "acknowledgement"],
      },
    },
    required: ["patch", "answeredCurrent", "nextStep"],
  },
};

interface Body {
  currentStep: string;
  state: Record<string, unknown>;
  userText: string;
  openSteps: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface ToolResult {
  patch: Record<string, unknown>;
  answeredCurrent: boolean;
  nextStep: string;
  topicOfInterest?: { topic: string; acknowledgement: string } | null;
}

export default async function handler(req: Request) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }

  const userPrompt = `Huidige stap: ${body.currentStep}.
Huidige staat: ${JSON.stringify(body.state)}.
Nog openstaande stappen (nextStep MOET uit deze lijst, of 'summary'): ${JSON.stringify(body.openSteps)}.
Gebruiker zei net: "${body.userText}".

Roep record_turn aan met de velden die je uit deze tekst kan halen, of een lege patch als er niks bruikbaars in staat.`;

  const history = (body.history ?? []).slice(-6);
  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: userPrompt },
  ];

  const anthropicClient = new Anthropic({ apiKey });
  const posthog = new PostHog(process.env.VITE_POSTHOG_KEY ?? "", {
    host: process.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });
  const distinctId = (body.state.firstName as string | undefined) ?? "anonymous";
  const traceId = crypto.randomUUID();

  try {
    const t0 = Date.now();
    const resp = await anthropicClient.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: SYSTEM,
      tools: [TOOL_DEF],
      tool_choice: { type: "tool", name: "record_turn" },
      messages,
    });
    const latency = (Date.now() - t0) / 1000;

    const toolUse = resp.content.find((c) => c.type === "tool_use") as
      | { type: "tool_use"; name: string; input: ToolResult }
      | undefined;

    if (!toolUse) {
      await posthog.captureImmediate({
        distinctId,
        event: "$ai_generation",
        properties: {
          $ai_trace_id: traceId,
          $ai_model: resp.model,
          $ai_provider: "anthropic",
          $ai_is_error: true,
          $ai_error: "no tool_use in response",
          step: body.currentStep,
        },
      });
      await posthog.shutdown();
      return new Response(JSON.stringify({ error: "No tool_use returned" }), { status: 502 });
    }

    const result = toolUse.input;

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
        $ai_stop_reason: resp.stop_reason,
        $ai_input: messages,
        $ai_output_choices: [{ role: "assistant", content: JSON.stringify(result) }],
        $ai_is_error: false,
        step: body.currentStep,
        extraction_kind: "turn",
        has_patch: Object.keys(result.patch ?? {}).length > 0,
        answered_current: result.answeredCurrent,
        has_topic_of_interest: Boolean(result.topicOfInterest),
      },
    });
    await posthog.shutdown();

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("extract error", err);
    posthog.captureException(err, distinctId, { step: body.currentStep });
    await posthog.shutdown();
    return new Response(JSON.stringify({ error: "Model call failed" }), { status: 500 });
  }
}
