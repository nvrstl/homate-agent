import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Zap, TrendingDown, Leaf, Shield, ArrowRight, ChevronDown, ChevronUp, Sparkles, Flame, Thermometer } from "lucide-react";
import type { Battery, HeatPump, QuoteResult } from "../types";
import { loadQuote } from "../lib/store";
import { fmtEur, fmtNum } from "../lib/format";
import { track } from "../lib/analytics";
import { USE_CLAUDE, fetchNarration } from "../lib/claudeClient";

type Product = Battery | HeatPump;
const isBattery = (p: Product): p is Battery => "capacityKwh" in p;
const isHeatPump = (p: Product): p is HeatPump => "nominalKw" in p;

export function QuotePage() {
  const navigate = useNavigate();
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [altOpen, setAltOpen] = useState(false);
  // Narrated "why this one for you" — fetched per selected product, cached by id.
  const [narrations, setNarrations] = useState<Record<string, string>>({});
  const [narrating, setNarrating] = useState(false);

  useEffect(() => {
    const q = loadQuote();
    if (!q) {
      navigate("/");
      return;
    }
    setQuote(q);
    setSelectedId(q.recommended.id);
    track("quote_viewed", { recommended: q.recommended.id, kind: q.productKind });
  }, [navigate]);

  // Fetch a personalised paragraph for whichever product is currently selected.
  useEffect(() => {
    if (!USE_CLAUDE || !quote || !selectedId) return;
    if (narrations[selectedId]) return;

    let cancelled = false;
    setNarrating(true);

    // Build a quote-like object with the selected product swapped in so the
    // narration is tailored to the user's active pick, not just the default.
    const selectedProduct = [quote.recommended, ...quote.alternatives].find((p) => p.id === selectedId)
      ?? quote.recommended;
    const quoteForNarration: QuoteResult = { ...quote, recommended: selectedProduct };

    fetchNarration({ quote: quoteForNarration })
      .then((text) => {
        if (cancelled || !text) return;
        setNarrations((prev) => ({ ...prev, [selectedId]: text }));
        track("quote_narration_shown", { id: selectedId });
      })
      .finally(() => {
        if (!cancelled) setNarrating(false);
      });

    return () => { cancelled = true; };
  }, [quote, selectedId, narrations]);

  const selected = useMemo(() => {
    if (!quote) return null;
    return [quote.recommended, ...quote.alternatives].find((b) => b.id === selectedId) ?? quote.recommended;
  }, [quote, selectedId]);

  if (!quote || !selected) return null;

  const productLabel = quote.productKind === "heatpump" ? "warmtepomp" : "thuisbatterij";
  const btwNote = quote.productKind === "heatpump" && isHeatPump(selected) && selected.btwReduced
    ? "incl. 6% BTW (woning ≥10 jaar), levering en installatie"
    : "incl. 21% BTW, levering en installatie";

  return (
    <div className="max-w-[1100px] mx-auto px-5 md:px-6 pt-10 pb-20">
      <div className="flex items-center gap-2 text-xs font-semibold text-secondary bg-secondary-soft w-fit px-3 py-1.5 rounded-full mb-4">
        <Sparkles className="w-3.5 h-3.5" />
        Jouw persoonlijk voorstel is klaar
      </div>
      <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-dark mb-3">
        {quote.discovery.firstName ? `${quote.discovery.firstName}, dit past het best bij jou.` : "Dit past het best bij jou."}
      </h1>
      <p className="text-on-surface-variant text-lg max-w-[680px] mb-10">
        Gebaseerd op jouw antwoorden hebben we het Homate-aanbod doorgerekend en deze {productLabel} gevonden. Prijzen zijn inclusief BTW, levering en installatie door een Homate-vakman.
      </p>

      <div className="grid md:grid-cols-[1fr_340px] gap-6 items-start">
        <div className="space-y-6">
          <RecommendationCard product={selected} quote={quote} />
          <ImpactRow quote={quote} />
          {(narrations[selected.id] || narrating) && (
            <NarrationCard text={narrations[selected.id]} loading={narrating && !narrations[selected.id]} />
          )}
          <ReasonsCard product={selected} />
        </div>

        <aside className="bg-primary-dark text-on-primary rounded-2xl p-6 sticky top-24 shadow-pop">
          <div className="text-sm opacity-80 mb-1">Prijsindicatie</div>
          <div className="font-display font-bold text-4xl mb-1">{fmtEur(selected.priceIncl)}</div>
          <div className="text-xs opacity-70 mb-5">{btwNote}</div>

          {isHeatPump(selected) && (selected.subsidyEur ?? 0) > 0 && (
            <div className="bg-secondary-soft/10 border border-secondary/30 rounded-xl p-3 mb-5 text-sm">
              <div className="flex justify-between">
                <span className="opacity-80">Mijn VerbouwPremie</span>
                <span className="font-semibold text-secondary">− {fmtEur(selected.subsidyEur!)}</span>
              </div>
              <div className="flex justify-between mt-1.5 pt-1.5 border-t border-white/10">
                <span>Netto na premie</span>
                <span className="font-display font-bold">{fmtEur(selected.priceIncl - (selected.subsidyEur ?? 0))}</span>
              </div>
            </div>
          )}

          <div className="space-y-2.5 text-sm mb-6 border-t border-white/10 pt-4">
            <Row k="Systeem" v={`${selected.brand} ${selected.model}`} />
            {isBattery(selected) && (
              <>
                <Row k="Bruikbare capaciteit" v={`${fmtNum(selected.usableKwh)} kWh`} />
                <Row k="Waarborg" v={`${selected.warrantyYears} jaar`} />
                <Row k="Back-up" v={selected.backup ? "Ja" : "Niet inbegrepen"} />
              </>
            )}
            {isHeatPump(selected) && (
              <>
                <Row k="Nominaal vermogen" v={`${fmtNum(selected.nominalKw)} kW`} />
                <Row k="Energielabel" v={selected.efficiencyClass ?? `SCOP ${selected.scop.toFixed(1)}`} />
                <Row k="Sanitair warm water" v={selected.dhwLiters > 0 ? `${selected.dhwLiters} L ingebouwd` : "aparte boiler"} />
                <Row k="Geluidsniveau" v={selected.noiseDb ? `${selected.noiseDb} dB(A)` : "—"} />
                <Row k="Waarborg" v={`${selected.warrantyYears} jaar`} />
              </>
            )}
          </div>

          <button
            onClick={() => {
              track("quote_cta_clicked", { id: selected.id, kind: quote.productKind });
              navigate("/checkout");
            }}
            className="w-full bg-secondary text-on-secondary font-semibold px-5 py-3 rounded-full hover:opacity-90 transition flex items-center justify-center gap-2"
          >
            Plan gratis adviesgesprek
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate("/gesprek")}
            className="w-full mt-2 text-sm text-white/70 hover:text-white py-2"
          >
            Gesprek aanpassen
          </button>
        </aside>
      </div>

      {quote.alternatives.length > 0 && (
        <div className="mt-12">
          <button
            onClick={() => setAltOpen((o) => !o)}
            className="flex items-center gap-2 font-semibold text-primary-dark hover:text-secondary transition"
          >
            {altOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            Bekijk alternatieven ({quote.alternatives.length})
          </button>
          {altOpen && (
            <div className="grid md:grid-cols-2 gap-4 mt-4 fade-in-up">
              {quote.alternatives.map((alt) => (
                <AlternativeCard
                  key={alt.id}
                  product={alt}
                  active={selectedId === alt.id}
                  onSelect={() => {
                    setSelectedId(alt.id);
                    track("alternative_selected", { id: alt.id });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecommendationCard({ product, quote }: { product: Product; quote: QuoteResult }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/40 p-6">
      <div className="flex items-center gap-2 text-xs font-semibold text-secondary mb-2">
        <CheckCircle2 className="w-4 h-4" />
        AI-aanbeveling
      </div>
      <h2 className="font-display text-2xl font-bold text-primary-dark">
        {product.brand} {product.model}
      </h2>
      <div className="text-sm text-on-surface-variant mt-1 mb-4">{product.bestFor}</div>

      <div className="grid grid-cols-3 gap-3 py-4 border-y border-outline-variant/40">
        {isBattery(product) ? (
          <>
            <Stat label="Capaciteit" value={`${fmtNum(product.usableKwh)} kWh`} />
            <Stat label="Waarborg" value={`${product.warrantyYears} jaar`} />
            <Stat label="Terugverdientijd" value={`±${quote.paybackYears} jaar`} />
          </>
        ) : (
          <>
            <Stat label="Vermogen" value={`${fmtNum(product.nominalKw)} kW`} />
            <Stat label="SCOP" value={product.scop.toFixed(1)} />
            <Stat label="Terugverdientijd" value={`±${quote.paybackYears} jaar`} />
          </>
        )}
      </div>

      <ul className="space-y-2.5 mt-5">
        {product.highlights.map((h, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-on-surface-variant">
            <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
            {h}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ImpactRow({ quote }: { quote: QuoteResult }) {
  const isHp = quote.productKind === "heatpump";
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <ImpactCard
        icon={<TrendingDown className="w-5 h-5" />}
        label="Geschatte jaarbesparing"
        value={fmtEur(quote.estimatedYearlySavingsEur)}
        color="secondary"
      />
      {isHp ? (
        <ImpactCard
          icon={<Thermometer className="w-5 h-5" />}
          label="Berekend vermogen"
          value={quote.targetKw ? `${quote.targetKw} kW` : "n.v.t."}
          color="primary"
        />
      ) : (
        <ImpactCard
          icon={<Zap className="w-5 h-5" />}
          label="Zelfverbruik stijgt met"
          value={(quote.selfConsumptionIncreasePct ?? 0) > 0 ? `+${quote.selfConsumptionIncreasePct}%` : "n.v.t."}
          color="primary"
        />
      )}
      <ImpactCard
        icon={isHp ? <Flame className="w-5 h-5" /> : <Leaf className="w-5 h-5" />}
        label="CO₂-reductie per jaar"
        value={`${fmtNum(quote.co2SavedKgPerYear)} kg`}
        color="secondary"
      />
    </div>
  );
}

function ImpactCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: "primary" | "secondary" }) {
  const colors =
    color === "secondary"
      ? "bg-secondary-soft text-secondary"
      : "bg-primary-container text-primary-dark";
  return (
    <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/40 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${colors}`}>{icon}</div>
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className="font-display font-bold text-xl text-primary-dark tabular-nums">{value}</div>
    </div>
  );
}

function NarrationCard({ text, loading }: { text?: string; loading: boolean }) {
  return (
    <div className="bg-gradient-to-br from-primary-container/60 to-secondary-soft/40 rounded-2xl border border-secondary/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-secondary" />
        <div className="font-display font-semibold text-primary-dark">Waarom voor jou</div>
      </div>
      {loading ? (
        <div className="flex gap-1.5 py-1">
          <span className="w-1.5 h-1.5 bg-secondary/60 rounded-full animate-pulse" />
          <span className="w-1.5 h-1.5 bg-secondary/60 rounded-full animate-pulse [animation-delay:120ms]" />
          <span className="w-1.5 h-1.5 bg-secondary/60 rounded-full animate-pulse [animation-delay:240ms]" />
        </div>
      ) : (
        <p className="text-[15px] leading-relaxed text-primary-dark/90">{text}</p>
      )}
    </div>
  );
}

function ReasonsCard({ product }: { product: Product }) {
  if (!product.matchReasons?.length) return null;
  return (
    <div className="bg-secondary-soft/50 rounded-2xl border border-secondary/20 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-secondary" />
        <div className="font-display font-semibold text-primary-dark">Waarom deze keuze</div>
      </div>
      <ul className="space-y-1.5 text-sm text-on-surface-variant">
        {product.matchReasons.map((r, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-secondary">•</span>
            {r}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlternativeCard({ product, onSelect, active }: { product: Product; onSelect: () => void; active: boolean }) {
  const spec = isBattery(product)
    ? `${fmtNum(product.usableKwh)} kWh · ${product.warrantyYears}j waarborg`
    : `${fmtNum(product.nominalKw)} kW · SCOP ${product.scop.toFixed(1)}`;
  return (
    <div
      className={[
        "rounded-2xl border p-5 cursor-pointer transition",
        active
          ? "bg-secondary-soft border-secondary shadow-soft"
          : "bg-surface-container-lowest border-outline-variant/40 hover:border-secondary/50",
      ].join(" ")}
      onClick={onSelect}
    >
      <div className="text-xs uppercase tracking-wide text-on-surface-variant font-semibold mb-1">
        {product.tier === "premium" ? "Premium" : product.tier === "mid" ? "Middenklasse" : "Instap"}
      </div>
      <div className="font-display font-bold text-lg text-primary-dark">
        {product.brand} {product.model}
      </div>
      <div className="text-sm text-on-surface-variant mt-1 mb-3">{product.bestFor}</div>
      <div className="flex items-baseline justify-between">
        <div className="text-xs text-on-surface-variant">{spec}</div>
        <div className="font-display font-bold text-primary-dark">{fmtEur(product.priceIncl)}</div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="opacity-70">{k}</span>
      <span className="font-semibold text-right">{v}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className="font-display font-bold text-primary-dark">{value}</div>
    </div>
  );
}
