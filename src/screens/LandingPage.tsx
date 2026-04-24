import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowRight, ShieldCheck, Timer, Euro } from "lucide-react";
import { track } from "../lib/analytics";

const SUGGESTIONS = [
  "Ik heb al zonnepanelen en wil meer zelf verbruiken",
  "Is een thuisbatterij nog rendabel in België?",
  "Ik wil van gas af en zoek advies over een warmtepomp",
  "Welke warmtepomp past bij mijn renovatie?",
  "Ik wil back-up bij stroompanne",
];

interface RotatingWord {
  word: string;
  color: string;
}

const ROTATING_WORDS: RotatingWord[] = [
  { word: "thuisbatterij", color: "#6cc535" },
  { word: "zonnepanelen", color: "#ffcc41" },
  { word: "warmtepomp", color: "#fe5f4f" },
];

function useTypewriter(words: RotatingWord[], typeMs = 75, eraseMs = 40, pauseMs = 1400) {
  const [index, setIndex] = useState(0);
  const [display, setDisplay] = useState("");
  const [phase, setPhase] = useState<"typing" | "holding" | "erasing">("typing");

  useEffect(() => {
    const word = words[index].word;
    let timeout: ReturnType<typeof setTimeout>;

    if (phase === "typing") {
      if (display.length < word.length) {
        timeout = setTimeout(() => setDisplay(word.slice(0, display.length + 1)), typeMs);
      } else {
        timeout = setTimeout(() => setPhase("holding"), 0);
      }
    } else if (phase === "holding") {
      timeout = setTimeout(() => setPhase("erasing"), pauseMs);
    } else {
      if (display.length > 0) {
        timeout = setTimeout(() => setDisplay(display.slice(0, -1)), eraseMs);
      } else {
        setIndex((i) => (i + 1) % words.length);
        setPhase("typing");
      }
    }
    return () => clearTimeout(timeout);
  }, [display, phase, index, words, typeMs, eraseMs, pauseMs]);

  return { text: display, color: words[index].color };
}

export function LandingPage() {
  const [input, setInput] = useState("");
  const navigate = useNavigate();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rotating = useTypewriter(ROTATING_WORDS);
  // Reserve horizontal space for the longest word so the layout doesn't reflow.
  const longestWord = ROTATING_WORDS.reduce((a, b) => (a.word.length >= b.word.length ? a : b)).word;

  useEffect(() => {
    inputRef.current?.focus();
    track("landing_viewed");
  }, []);

  function start(seed?: string) {
    const text = (seed ?? input).trim();
    track("landing_started", { seeded: Boolean(seed), length: text.length });
    sessionStorage.setItem("homate:seed", text);
    navigate("/gesprek");
  }

  return (
    <div className="max-w-[880px] mx-auto px-6 pt-16 pb-24">
      <div className="flex items-center gap-2 text-xs font-semibold text-secondary bg-secondary-soft w-fit mx-auto px-3 py-1.5 rounded-full mb-6">
        <Sparkles className="w-3.5 h-3.5" />
        Nieuw · Agentic advies voor thuisbatterij, warmtepomp & zonnepanelen
      </div>

      <h1 className="text-center font-display text-5xl md:text-[56px] leading-[1.05] font-bold text-primary-dark mb-6">
        Vind jouw perfecte{" "}
        <span className="relative inline-block align-baseline" style={{ color: rotating.color }}>
          <span aria-hidden className="invisible">{longestWord}</span>
          <span className="absolute inset-0 whitespace-nowrap transition-colors duration-200" aria-live="polite">
            {rotating.text}
            <span
              className="inline-block w-[0.08em] h-[0.9em] align-middle ml-0.5 caret-blink"
              style={{ backgroundColor: rotating.color }}
            />
          </span>
        </span>
        <br />
        in een gesprek.
      </h1>

      <p className="text-center text-lg text-on-surface-variant max-w-[580px] mx-auto mb-10">
        Geen lange vragenlijsten. Vertel ons gewoon waar het om draait — onze AI-adviseur stelt de juiste vragen en geeft je binnen 2 minuten een eerlijk voorstel, inclusief prijsindicatie.
      </p>

      <div className="bg-surface-container-lowest rounded-3xl shadow-pop border border-outline-variant/50 p-3 mb-6 fade-in-up">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={2}
          placeholder="Vertel in één zin wat je wil bereiken…  bv. 'we willen van gas af' of 'we hebben 12 panelen en zoeken een batterij'"
          className="w-full resize-none px-4 py-3 text-base leading-relaxed bg-transparent outline-none placeholder:text-on-surface-variant/70"
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <div className="text-xs text-on-surface-variant">
            Duurt ongeveer 2 minuten · Geen verplichtingen
          </div>
          <button
            onClick={() => start()}
            className="inline-flex items-center gap-2 bg-primary-dark text-on-primary font-semibold px-5 py-2.5 rounded-full hover:bg-primary transition-colors"
          >
            Start gesprek
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 justify-center mb-14">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => start(s)}
            className="text-sm px-3.5 py-2 rounded-full bg-surface-container-lowest border border-outline-variant/60 hover:border-secondary/60 hover:bg-secondary-soft/40 transition-colors text-on-surface-variant"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Feature
          icon={<ShieldCheck className="w-5 h-5 text-secondary" />}
          title="Onafhankelijk advies"
          body="Geen verkooppraatje — de AI beveelt alleen aan wat bij jouw situatie past."
        />
        <Feature
          icon={<Timer className="w-5 h-5 text-secondary" />}
          title="Klaar in 2 minuten"
          body="Slimme vragen met schuifbalken en opties, geen typwerk."
        />
        <Feature
          icon={<Euro className="w-5 h-5 text-secondary" />}
          title="Transparante prijs"
          body="Prijsindicatie inclusief installatie, zonder verrassingen."
        />
      </div>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 border border-outline-variant/40 shadow-soft">
      <div className="w-10 h-10 rounded-xl bg-secondary-soft flex items-center justify-center mb-3">
        {icon}
      </div>
      <div className="font-display font-semibold text-primary-dark mb-1">{title}</div>
      <div className="text-sm text-on-surface-variant leading-relaxed">{body}</div>
    </div>
  );
}
