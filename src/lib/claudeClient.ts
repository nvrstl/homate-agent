import type { Battery, ChatMessage, DiscoveryState, HeatPump, QuoteResult } from "../types";
import type { AskStep, Step } from "./agent";

export const USE_CLAUDE = import.meta.env.VITE_USE_CLAUDE === "1";

export interface ExtractResult {
  patch: Partial<DiscoveryState>;
  answeredCurrent: boolean;
  nextStep: string;
  topicOfInterest?: { topic: string; acknowledgement: string } | null;
}

export async function fetchExtract(args: {
  currentStep: AskStep;
  state: DiscoveryState;
  userText: string;
  openSteps: AskStep[];
  history: ChatMessage[];
}): Promise<ExtractResult | null> {
  try {
    const res = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentStep: args.currentStep,
        state: args.state,
        userText: args.userText,
        openSteps: args.openSteps,
        history: args.history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-6)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) return null;
    return (await res.json()) as ExtractResult;
  } catch {
    return null;
  }
}

export async function fetchNarration(args: {
  quote: QuoteResult;
}): Promise<string | null> {
  try {
    const p = args.quote.recommended;
    const isBat = "capacityKwh" in p;
    const product = isBat
      ? {
          kind: "battery" as const,
          brand: p.brand,
          model: p.model,
          bestFor: p.bestFor,
          highlights: p.highlights,
          tier: p.tier,
          usableKwh: (p as Battery).usableKwh,
          warrantyYears: p.warrantyYears,
          backup: (p as Battery).backup,
        }
      : {
          kind: "heatpump" as const,
          brand: p.brand,
          model: p.model,
          bestFor: p.bestFor,
          highlights: p.highlights,
          tier: p.tier,
          nominalKw: (p as HeatPump).nominalKw,
          scop: (p as HeatPump).scop,
          dhwLiters: (p as HeatPump).dhwLiters,
        };
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "narrate",
        state: args.quote.discovery,
        product,
        metrics: {
          estimatedYearlySavingsEur: args.quote.estimatedYearlySavingsEur,
          paybackYears: args.quote.paybackYears,
          co2SavedKgPerYear: args.quote.co2SavedKgPerYear,
          selfConsumptionIncreasePct: args.quote.selfConsumptionIncreasePct,
          targetKw: args.quote.targetKw,
          subsidyEur: args.quote.subsidyEur,
          netPriceAfterSubsidy: args.quote.netPriceAfterSubsidy,
          priceIncl: args.quote.recommended.priceIncl,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string };
    return data.reply?.trim() || null;
  } catch {
    return null;
  }
}

export async function fetchClaudeReply(args: {
  step: Step;
  state: DiscoveryState;
  lastUserInput?: string;
  history: ChatMessage[];
}): Promise<string | null> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        step: args.step,
        state: args.state,
        lastUserInput: args.lastUserInput,
        history: args.history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string };
    return data.reply?.trim() || null;
  } catch {
    return null;
  }
}

export async function fetchClaudeQA(args: {
  question: string;
  step: Step;
  state: DiscoveryState;
  history: ChatMessage[];
}): Promise<string | null> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "qa",
        question: args.question,
        step: args.step,
        state: args.state,
        history: args.history
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { reply?: string };
    return data.reply?.trim() || null;
  } catch {
    return null;
  }
}
