import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, CheckCircle2, Download, Loader2, CalendarDays } from "lucide-react";
import type { QuoteResult, LeadPayload } from "../types";
import { loadQuote } from "../lib/store";
import { fmtEur } from "../lib/format";
import { generateQuotePdf } from "../lib/pdf";
import { identifyLead, track } from "../lib/analytics";
import { quoteNumber } from "../lib/format";
import { openCalendlyPopup } from "../lib/calendly";

const CALENDLY_URL = import.meta.env.VITE_CALENDLY_URL as string | undefined;
const FALLBACK_SCHEDULE_URL = "https://calendar.app.google/5tCrAqHQeVGhxFZK8";

export function CheckoutPage() {
  const navigate = useNavigate();
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteId, setQuoteId] = useState<string>("");
  const [form, setForm] = useState({
    firstName: "",
    email: "",
    phone: "",
    postcode: "",
    notes: "",
    preferredSlot: "morning",
    consent: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const q = loadQuote();
    if (!q) {
      navigate("/");
      return;
    }
    setQuote(q);
    setQuoteId(quoteNumber());
    setForm((f) => ({ ...f, firstName: q.discovery.firstName ?? "" }));
    track("checkout_viewed");
  }, [navigate]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.firstName.trim()) e.firstName = "Vul je voornaam in";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) e.email = "Geldig e-mailadres nodig";
    if (!/^[\d+\s/().-]{8,}$/.test(form.phone)) e.phone = "Geldig telefoonnummer nodig";
    if (!form.consent) e.consent = "Bevestig dat je akkoord bent";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit() {
    if (!validate() || !quote) return;
    setSubmitting(true);
    const payload: LeadPayload = {
      firstName: form.firstName,
      email: form.email,
      phone: form.phone,
      postcode: form.postcode,
      notes: `Voorkeur moment: ${form.preferredSlot}${form.notes ? " · " + form.notes : ""}`,
      quoteId,
      discovery: quote.discovery,
      productKind: quote.productKind,
      recommendedProductId: quote.recommended.id,
      recommendedBatteryId: quote.productKind === "battery" ? quote.recommended.id : undefined,
    };

    identifyLead(form.email, { first_name: form.firstName, postcode: form.postcode });
    track("lead_submitted", { id: quote.recommended.id, kind: quote.productKind, slot: form.preferredSlot });

    try {
      await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      // Even if API is not live (prototype locally), continue — lead still in PostHog.
    }

    sessionStorage.setItem("homate:lead", JSON.stringify(payload));
    navigate("/bevestigd");
  }

  function downloadPdf() {
    if (!quote) return;
    setPdfGenerating(true);
    try {
      const id = generateQuotePdf(quote, { quoteId, customerName: form.firstName || quote.discovery.firstName });
      track("pdf_downloaded", { quote_id: id });
    } finally {
      setTimeout(() => setPdfGenerating(false), 400);
    }
  }

  if (!quote) return null;
  const { recommended } = quote;

  return (
    <div className="max-w-[1100px] mx-auto px-5 md:px-6 pt-10 pb-20 grid md:grid-cols-[1fr_380px] gap-8">
      <div>
        <div className="text-xs font-semibold text-secondary mb-2">Stap 3 van 3</div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-primary-dark mb-3">
          Laat ons je bellen voor een gratis adviesgesprek
        </h1>
        <p className="text-on-surface-variant mb-8 max-w-[600px]">
          Een Homate-adviseur neemt binnen 1 werkdag contact op om je voorstel te bespreken, vragen te beantwoorden en (als je wil) een officiële offerte op te maken. Geen verplichtingen.
        </p>

        <div className="bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/40 p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Voornaam" error={errors.firstName}>
              <input
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="input"
                autoComplete="given-name"
              />
            </Field>
            <Field label="Postcode (optioneel)">
              <input
                value={form.postcode}
                onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                className="input"
                placeholder="bv. 9000"
                autoComplete="postal-code"
              />
            </Field>
          </div>
          <Field label="E-mailadres" error={errors.email}>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="input"
              autoComplete="email"
              placeholder="je@voorbeeld.be"
            />
          </Field>
          <Field label="Telefoonnummer" error={errors.phone}>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="input"
              autoComplete="tel"
              placeholder="+32 ..."
            />
          </Field>

          <div>
            <div className="text-sm font-semibold text-on-surface mb-2">Wanneer mogen we je bellen?</div>
            <div className="flex flex-wrap gap-2">
              {[
                { id: "morning", label: "Voormiddag (9-12u)" },
                { id: "afternoon", label: "Namiddag (13-17u)" },
                { id: "evening", label: "Vroege avond (17-19u)" },
                { id: "any", label: "Maakt niet uit" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setForm({ ...form, preferredSlot: opt.id })}
                  className={[
                    "text-sm px-4 py-2 rounded-full border transition",
                    form.preferredSlot === opt.id
                      ? "bg-secondary-soft border-secondary text-secondary"
                      : "bg-surface-container-lowest border-outline-variant/60 hover:border-secondary/60",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <Field label="Iets dat we moeten weten? (optioneel)">
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="input resize-none"
              placeholder="bv. ik heb al een omvormer van merk X, of specifieke voorkeur"
            />
          </Field>

          <label className="flex gap-3 items-start text-sm text-on-surface-variant">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
              className="mt-0.5 accent-secondary w-4 h-4"
            />
            <span>
              Ik ga akkoord dat Homate me mag contacteren voor dit adviesgesprek en mijn gegevens verwerkt conform de{" "}
              <a href="https://homate.be/privacy" target="_blank" rel="noreferrer" className="underline hover:text-secondary">
                privacyverklaring
              </a>.
            </span>
          </label>
          {errors.consent && <div className="text-sm text-tertiary -mt-2">{errors.consent}</div>}

          <button
            onClick={submit}
            disabled={submitting}
            className="w-full bg-secondary text-on-secondary font-semibold px-5 py-3.5 rounded-full hover:opacity-90 transition flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
            Plan mijn gratis adviesgesprek
          </button>

          <div className="flex items-center gap-3 text-xs text-on-surface-variant/80 uppercase tracking-wide">
            <div className="flex-1 h-px bg-outline-variant/50" />
            of
            <div className="flex-1 h-px bg-outline-variant/50" />
          </div>

          <button
            type="button"
            onClick={() => {
              track("schedule_call_clicked", {
                battery: quote.recommended.id,
                provider: CALENDLY_URL ? "calendly" : "google_fallback",
              });
              if (CALENDLY_URL) {
                openCalendlyPopup(CALENDLY_URL, {
                  name: form.firstName,
                  email: form.email,
                  customAnswers: JSON.stringify({
                    a1: `${recommended.brand} ${recommended.model} (quote ${quoteId})`,
                  }),
                });
              } else {
                window.open(FALLBACK_SCHEDULE_URL, "_blank", "noopener,noreferrer");
              }
            }}
            className="w-full bg-surface-container text-primary-dark font-semibold px-5 py-3.5 rounded-full border border-outline-variant/60 hover:border-secondary hover:bg-secondary-soft/40 transition flex items-center justify-center gap-2"
          >
            <CalendarDays className="w-4 h-4" />
            Kies zelf een moment in onze agenda
          </button>
        </div>
      </div>

      <aside className="bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/40 p-6 h-fit sticky top-24">
        <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-3">Jouw voorstel</div>
        <div className="font-display font-bold text-lg text-primary-dark">
          {recommended.brand} {recommended.model}
        </div>
        <div className="text-sm text-on-surface-variant mt-1 mb-4">{recommended.bestFor}</div>
        <div className="flex items-baseline justify-between mb-5">
          <span className="text-sm text-on-surface-variant">Prijsindicatie</span>
          <span className="font-display font-bold text-xl text-primary-dark">{fmtEur(recommended.priceIncl)}</span>
        </div>

        <button
          onClick={downloadPdf}
          disabled={pdfGenerating}
          className="w-full bg-surface-container text-primary-dark font-semibold px-5 py-2.5 rounded-full hover:bg-surface-container-high transition flex items-center justify-center gap-2 mb-3"
        >
          {pdfGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download prijsindicatie (PDF)
        </button>

        <ul className="space-y-2.5 text-sm text-on-surface-variant mt-4 border-t border-outline-variant/40 pt-4">
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
            Geen verkooppraatje, geen druk
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
            15+ jaar ervaring (Camino Group)
          </li>
          <li className="flex gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
            2 jaar minimum waarborg op de installatie
          </li>
        </ul>
      </aside>
    </div>
  );
}

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label className="block">
      <div className="text-sm font-semibold text-on-surface mb-1.5">{label}</div>
      {children}
      {error && <div className="text-sm text-tertiary mt-1">{error}</div>}
    </label>
  );
}
