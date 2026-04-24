import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send } from "lucide-react";
import type { ChatMessage, DiscoveryState, QuickReply } from "../types";
import {
  questionFor,
  summaryMessage,
  interpretAnswer,
  interpretFreeText,
  isAnswered,
  nextStepAfter,
  openSteps,
  parseSeed,
  scriptedFaqReply,
  nudgeLineFor,
  skipKnown,
  type AskStep,
  type FlowStep,
} from "../lib/agent";
import { buildQuote } from "../lib/sizing";
import { saveDiscovery, saveQuote, loadSeed } from "../lib/store";
import { track } from "../lib/analytics";
import { ChatBubble, TypingBubble } from "../components/ChatBubble";
import { QuickReplies } from "../components/QuickReplies";
import { SliderCard } from "../components/SliderCard";
import { InputCard } from "../components/InputCard";
import { USE_CLAUDE, fetchClaudeReply, fetchClaudeQA, fetchExtract } from "../lib/claudeClient";

// Feels more like a human typing than a form. 300ms base + 14ms/char, capped 1600ms.
function typingDelayFor(content: string): number {
  return Math.min(1600, 300 + content.length * 14);
}

// Patches can freely add or correct fields, but `track` is special: once the
// user has committed to a flow (via seed inference or the ask_product chip),
// a chat model re-reading the conversation must NOT silently flip it. Flipping
// tracks mid-flow breaks skipKnown and produces "why is it asking about
// panels when I said I want a heat pump?" moments.
function mergePatchSafe(base: DiscoveryState, patch: Partial<DiscoveryState>): DiscoveryState {
  const safe = { ...patch };
  if (base.track && safe.track && safe.track !== base.track) {
    delete safe.track;
  }
  return { ...base, ...safe };
}

export function DiscoveryPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<DiscoveryState>({});
  // currentAsk = the step the assistant is currently asking about
  // (i.e. what the user's next answer will be interpreted as).
  const [currentAsk, setCurrentAsk] = useState<AskStep>("ask_name");
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [awaitingUser, setAwaitingUser] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  // Guard against React 19 StrictMode running the init effect twice in dev.
  const initRef = useRef(false);

  // Keep latest messages in a ref so async turns don't read stale state.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    track("discovery_started");
    const seed = loadSeed();
    const initialUser: ChatMessage[] = seed
      ? [{ id: crypto.randomUUID(), role: "user", content: seed, createdAt: Date.now() }]
      : [];
    if (initialUser.length) setMessages(initialUser);

    // Synchronous regex hydration — ensures state is populated even if the
    // extractor call is slow or disabled.
    const regexSeeded = seed ? parseSeed(seed) : {};
    if (Object.keys(regexSeeded).length) {
      setState(regexSeeded);
      saveDiscovery(regexSeeded);
    }

    (async () => {
      let hydrated: DiscoveryState = regexSeeded;

      // Agentic seed pass — catch phrasings the regex misses ("5-koppig
      // gezin", "jaren '70 woning", "stoppen met gas"). Without this, any
      // answer implied in the landing prompt gets re-asked by the script.
      if (seed && USE_CLAUDE) {
        setTyping(true);
        const extracted = await Promise.race([
          fetchExtract({
            currentStep: "ask_name",
            state: regexSeeded,
            userText: seed,
            openSteps: openSteps(regexSeeded),
            history: [],
          }),
          new Promise<null>((r) => setTimeout(() => r(null), 5000)),
        ]);
        setTyping(false);
        if (extracted?.patch && Object.keys(extracted.patch).length > 0) {
          hydrated = mergePatchSafe(regexSeeded, extracted.patch);
          setState(hydrated);
          saveDiscovery(hydrated);
        }
      }

      // Start at the first *actually unanswered* step — never ask twice.
      const firstStep: FlowStep = skipKnown("ask_name", hydrated);
      if (firstStep === "summary") {
        renderSummary(hydrated);
      } else {
        renderQuestion(firstStep, hydrated, seed ?? undefined);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  async function renderQuestion(
    step: AskStep,
    st: DiscoveryState,
    lastUserInput?: string,
    colorLine?: string,
  ) {
    setAwaitingUser(false);
    setCurrentAsk(step);

    // Color ack: a short bubble that reacts to something the user volunteered
    // beyond the asked question, shown before the next scripted question.
    if (colorLine) {
      setTyping(true);
      await new Promise((r) => setTimeout(r, typingDelayFor(colorLine)));
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: colorLine, createdAt: Date.now() },
      ]);
    }

    setTyping(true);
    const scripted = questionFor(step, st);

    // Hybrid Claude phrasing — optional, silently falls back on error/timeout.
    let claudeText: string | null = null;
    if (USE_CLAUDE) {
      claudeText = await Promise.race([
        fetchClaudeReply({
          step,
          state: st,
          lastUserInput,
          history: messagesRef.current,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
    }

    // Dynamic typing delay — scales with length so longer replies feel human.
    const finalMessage = claudeText ? { ...scripted, content: claudeText } : scripted;
    await new Promise((r) => setTimeout(r, typingDelayFor(finalMessage.content)));

    setMessages((prev) => [...prev, finalMessage]);
    setTyping(false);
    setAwaitingUser(true);
  }

  async function renderSummary(st: DiscoveryState) {
    setAwaitingUser(false);
    setTyping(true);

    const scripted = summaryMessage(st);
    // Summary line can also be Claude-generated.
    let claudeText: string | null = null;
    if (USE_CLAUDE) {
      claudeText = await Promise.race([
        fetchClaudeReply({
          step: "summary" as AskStep,
          state: st,
          history: messagesRef.current,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 5000)),
      ]);
    }
    const productLabel = st.track === "heatpump" ? "warmtepomp" : "thuisbatterij";
    const finalMessage = claudeText
      ? { ...scripted, content: `${claudeText}\n\nIk bereken nu jouw ideale ${productLabel}…` }
      : scripted;
    await new Promise((r) => setTimeout(r, typingDelayFor(finalMessage.content)));

    setMessages((prev) => [...prev, finalMessage]);
    setTyping(false);

    const quote = buildQuote(st);
    saveQuote(quote);
    saveDiscovery(st);
    track("discovery_completed", {
      hasSolar: st.hasSolar,
      usage: st.yearlyUsageKwh,
      budget: st.budget,
      battery: quote.recommended.id,
    });
    setTimeout(() => navigate("/voorstel"), 1800);
  }

  function pushUserMessage(text: string) {
    const m: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text, createdAt: Date.now() };
    setMessages((prev) => [...prev, m]);
  }

  function commitAnswer(rawValue: string, displayText: string) {
    pushUserMessage(displayText);
    const patch = interpretAnswer(currentAsk, rawValue, state);
    const next = { ...state, ...patch };
    setState(next);
    saveDiscovery(next);

    const nextStep: FlowStep = skipKnown(nextStepAfter(currentAsk, next, rawValue), next);
    if (nextStep === "summary") {
      renderSummary(next);
    } else {
      renderQuestion(nextStep, next, rawValue);
    }
  }

  async function handleText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !awaitingUser) return;
    setInput("");

    // Optimistic UI — show user bubble and typing indicator immediately so the
    // extractor latency (if used) doesn't feel laggy.
    setAwaitingUser(false);
    pushUserMessage(trimmed);
    setTyping(true);

    // Agentic path: Claude extracts structured facts, decides whether the
    // current question was answered, picks the next open step, and can emit a
    // short acknowledgement for anything the user volunteered beyond the ask.
    // Times out cleanly to regex fallback.
    let extract: Awaited<ReturnType<typeof fetchExtract>> = null;
    if (USE_CLAUDE) {
      extract = await Promise.race([
        fetchExtract({
          currentStep: currentAsk,
          state,
          userText: trimmed,
          openSteps: openSteps(state),
          history: messagesRef.current,
        }),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
    }

    const patch: Partial<DiscoveryState> = extract?.patch ?? interpretFreeText(currentAsk, trimmed, state);
    const hasFacts = Object.keys(patch).length > 0;
    const answeredCurrent = extract
      ? extract.answeredCurrent
      : isAnsweredAfterPatch(currentAsk, patch, state);
    const colorLine = extract?.topicOfInterest?.acknowledgement?.trim() || undefined;

    // Turn off typing — renderQuestion / handleQuestion will restart it.
    setTyping(false);

    if (answeredCurrent) {
      const next = mergePatchSafe(state, patch);
      setState(next);
      saveDiscovery(next);

      // Prefer the step the model chose — but only if it's still open after
      // the patch is applied. Otherwise fall back to the deterministic walk.
      const deterministic: FlowStep = skipKnown(nextStepAfter(currentAsk, next, trimmed), next);
      const modelPick = extract?.nextStep;
      const chosen: FlowStep =
        modelPick === "summary"
          ? "summary"
          : modelPick && isValidOpenStep(modelPick, next)
          ? (modelPick as FlowStep)
          : deterministic;

      track("discovery_turn", {
        step: currentAsk,
        via_extractor: Boolean(extract),
        patch_keys: Object.keys(patch),
        next_step: chosen,
        model_pick_used: chosen === modelPick,
        topic_of_interest: extract?.topicOfInterest?.topic,
      });

      if (chosen === "summary") renderSummary(next);
      else renderQuestion(chosen, next, trimmed, colorLine);
      return;
    }

    // Not an answer: treat as a free-form question. Still apply any stray
    // facts the extractor pulled out (e.g. user asked a question but mentioned
    // "tesla"), then answer briefly and re-ask the current step.
    let appliedState = state;
    if (hasFacts) {
      appliedState = mergePatchSafe(state, patch);
      setState(appliedState);
      saveDiscovery(appliedState);
    }
    await handleQuestion(trimmed, appliedState, colorLine);
  }

  // A model-chosen step is valid only if it's in the current openSteps set
  // (i.e. applicable + unanswered after the patch).
  function isValidOpenStep(step: string, st: DiscoveryState): step is AskStep {
    const open = openSteps(st);
    return (open as string[]).includes(step) && !isAnswered(step as AskStep, st);
  }

  function isAnsweredAfterPatch(step: AskStep, patch: Partial<DiscoveryState>, base: DiscoveryState): boolean {
    const merged = { ...base, ...patch };
    switch (step) {
      case "ask_name": return Boolean(merged.firstName) && !base.firstName;
      case "ask_product": return merged.track !== undefined && base.track === undefined;
      case "ask_solar": return merged.hasSolar !== undefined && base.hasSolar === undefined;
      case "ask_solar_panels": return merged.solarPanels !== undefined && base.solarPanels === undefined;
      case "ask_usage_profile": return merged.yearlyUsageKwh !== undefined && base.yearlyUsageKwh === undefined;
      case "ask_household_size": return merged.householdSize !== undefined && base.householdSize === undefined;
      case "ask_usage_kwh": return merged.yearlyUsageKwh !== undefined && merged.yearlyUsageKwh !== base.yearlyUsageKwh;
      case "ask_ev_hp": return (merged.hasEv !== undefined || merged.hasHeatPump !== undefined) && base.hasEv === undefined && base.hasHeatPump === undefined;
      case "ask_tariff": return merged.dynamicTariff !== undefined && base.dynamicTariff === undefined;
      case "ask_backup": return merged.backupImportant !== undefined && base.backupImportant === undefined;
      case "ask_budget": return merged.budget !== undefined && base.budget === undefined;
      case "ask_hp_house_age": return merged.hpHouseOld !== undefined && base.hpHouseOld === undefined;
      case "ask_hp_insulation": return merged.hpInsulation !== undefined && base.hpInsulation === undefined;
      case "ask_hp_household": return merged.householdSize !== undefined && base.householdSize === undefined;
      case "ask_hp_emission": return merged.hpEmission !== undefined && base.hpEmission === undefined;
      case "ask_hp_source": return merged.hpCurrentSource !== undefined && base.hpCurrentSource === undefined;
      case "ask_hp_gas_m3": return merged.hpGasM3 !== undefined && base.hpGasM3 === undefined;
      case "ask_hp_oil_l": return merged.hpOilL !== undefined && base.hpOilL === undefined;
      case "ask_hp_current_kw": return merged.hpCurrentKw !== undefined && base.hpCurrentKw === undefined;
      case "ask_hp_budget": return merged.hpBudget !== undefined && base.hpBudget === undefined;
    }
  }

  async function handleQuestion(question: string, currentState: DiscoveryState, colorLine?: string) {
    setAwaitingUser(false);
    setTyping(true);

    // Try Claude first; fall back to scripted FAQ; else a generic acknowledgement.
    let answer: string | null = null;
    if (USE_CLAUDE) {
      answer = await Promise.race([
        fetchClaudeQA({ question, step: currentAsk, state: currentState, history: messagesRef.current }),
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
    }
    if (!answer) answer = scriptedFaqReply(question);

    const nudge = nudgeLineFor(currentAsk, currentState);
    const reply = answer
      ? `${answer}\n\n${nudge}`
      : `Goeie vraag — die bespreken we graag in detail tijdens het adviesgesprek. ${nudge}`;

    await new Promise((r) => setTimeout(r, typingDelayFor(reply)));
    setMessages((prev) => [...prev, {
      id: crypto.randomUUID(),
      role: "assistant",
      content: reply,
      createdAt: Date.now(),
    }]);
    setTyping(false);

    track("chat_question_asked", { step: currentAsk, via_claude: Boolean(USE_CLAUDE && answer) });

    // Re-render the widget for the current step so the user can still answer.
    // Color line (if any) is shown just before the re-asked question.
    renderQuestion(currentAsk, currentState, undefined, colorLine);
  }

  function handleQuickReply(r: QuickReply) {
    commitAnswer(r.value, r.label);
  }

  function handleSlider(value: number, prompt: { fieldKey: keyof DiscoveryState; unit: string; toState?: (v: number) => Partial<DiscoveryState>; displayFormat?: (v: number) => string }) {
    const patch = prompt.toState ? prompt.toState(value) : ({ [prompt.fieldKey]: value } as Partial<DiscoveryState>);
    const next = { ...state, ...patch };
    setState(next);
    saveDiscovery(next);

    const label = prompt.displayFormat
      ? prompt.displayFormat(value)
      : `${value.toLocaleString("nl-BE")} ${prompt.unit}`;
    pushUserMessage(label);

    const nextStep: FlowStep = skipKnown(nextStepAfter(currentAsk, next, String(value)), next);
    if (nextStep === "summary") {
      renderSummary(next);
    } else {
      renderQuestion(nextStep, next, String(value));
    }
  }

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const showQuickReplies = awaitingUser && lastAssistant?.quickReplies;
  const showSlider = awaitingUser && lastAssistant?.sliderPrompt;
  const showInputCard = awaitingUser && lastAssistant?.inputPrompt;
  // Free text is ALWAYS allowed while we're awaiting the user — parser will
  // decide whether it's an answer, an answer + extra facts, or a question.
  const acceptText = awaitingUser;
  const hasWidget = Boolean(showQuickReplies || showSlider || showInputCard);

  return (
    <div className="max-w-[720px] mx-auto px-4 md:px-6 pt-6 pb-10 flex flex-col h-[calc(100vh-64px-56px)]">
      <div ref={scrollRef} className="chat-scroll flex-1 overflow-y-auto space-y-3 pr-1 pb-4">
        {messages.map((m) => (
          <ChatBubble key={m.id} msg={m} />
        ))}
        {typing && <TypingBubble />}
        {showQuickReplies && lastAssistant?.quickReplies && (
          <QuickReplies options={lastAssistant.quickReplies} onPick={handleQuickReply} />
        )}
        {showSlider && lastAssistant?.sliderPrompt && (
          <SliderCard
            prompt={lastAssistant.sliderPrompt}
            onSubmit={(v) => handleSlider(v, lastAssistant.sliderPrompt!)}
          />
        )}
        {showInputCard && lastAssistant?.inputPrompt && (
          <InputCard
            key={lastAssistant.id}
            prompt={lastAssistant.inputPrompt}
            onSubmit={(v) => commitAnswer(v, v)}
          />
        )}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/50 rounded-full shadow-soft flex items-center px-2 py-1.5 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleText(input);
          }}
          disabled={!acceptText}
          placeholder={
            !acceptText
              ? "Even wachten…"
              : hasWidget
              ? "Of typ een vraag of een eigen antwoord…"
              : "Typ je antwoord of stel een vraag…"
          }
          className="flex-1 bg-transparent px-4 py-2 outline-none text-[15px] disabled:opacity-60"
        />
        <button
          onClick={() => handleText(input)}
          disabled={!acceptText || !input.trim()}
          className="bg-primary-dark text-on-primary w-10 h-10 rounded-full flex items-center justify-center disabled:opacity-40"
          aria-label="Verstuur"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
