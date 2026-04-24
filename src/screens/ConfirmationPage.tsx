import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Download, Phone, Mail, Home } from "lucide-react";
import type { QuoteResult, LeadPayload } from "../types";
import { loadQuote, clearFlow } from "../lib/store";
import { generateQuotePdf } from "../lib/pdf";
import { track } from "../lib/analytics";
import { fmtEur } from "../lib/format";

export function ConfirmationPage() {
  const navigate = useNavigate();
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [lead, setLead] = useState<LeadPayload | null>(null);

  useEffect(() => {
    const q = loadQuote();
    const leadRaw = sessionStorage.getItem("homate:lead");
    if (!q || !leadRaw) {
      navigate("/");
      return;
    }
    setQuote(q);
    setLead(JSON.parse(leadRaw));
    track("confirmation_viewed");
  }, [navigate]);

  if (!quote || !lead) return null;

  return (
    <div className="max-w-[720px] mx-auto px-5 md:px-6 pt-16 pb-24 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary-soft flex items-center justify-center mx-auto mb-6">
        <CheckCircle2 className="w-8 h-8 text-secondary" />
      </div>
      <h1 className="font-display text-4xl md:text-5xl font-bold text-primary-dark mb-4">
        Bedankt, {lead.firstName}!
      </h1>
      <p className="text-lg text-on-surface-variant mb-8">
        Een Homate-adviseur belt je <strong className="text-primary-dark">binnen 1 werkdag</strong> op{" "}
        <strong className="text-primary-dark">{lead.phone}</strong>. We bespreken je voorstel en beantwoorden al je vragen — geen verplichtingen.
      </p>

      <div className="bg-surface-container-lowest rounded-2xl shadow-soft border border-outline-variant/40 p-6 text-left mb-6">
        <div className="text-xs uppercase tracking-wide text-on-surface-variant font-semibold mb-2">
          Voorlopige selectie · Offerte-ID {lead.quoteId}
        </div>
        <div className="font-display font-bold text-xl text-primary-dark">
          {quote.recommended.brand} {quote.recommended.model}
        </div>
        <div className="flex items-baseline justify-between mt-3">
          <span className="text-sm text-on-surface-variant">Prijsindicatie</span>
          <span className="font-display font-bold text-lg text-primary-dark">{fmtEur(quote.recommended.priceIncl)}</span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => generateQuotePdf(quote, { quoteId: lead.quoteId, customerName: lead.firstName })}
          className="inline-flex items-center justify-center gap-2 bg-primary-dark text-on-primary font-semibold px-5 py-3 rounded-full hover:bg-primary transition"
        >
          <Download className="w-4 h-4" />
          Download prijsindicatie (PDF)
        </button>
        <button
          onClick={() => {
            clearFlow();
            navigate("/");
          }}
          className="inline-flex items-center justify-center gap-2 text-primary-dark font-semibold px-5 py-3 rounded-full border border-outline-variant/60 hover:border-primary-dark transition"
        >
          <Home className="w-4 h-4" />
          Terug naar start
        </button>
      </div>

      <div className="flex gap-6 justify-center mt-10 text-sm text-on-surface-variant">
        <a href="tel:+3280000000" className="inline-flex items-center gap-2 hover:text-secondary">
          <Phone className="w-4 h-4" />
          Zelf eerder bellen?
        </a>
        <a href="mailto:hello@homate.be" className="inline-flex items-center gap-2 hover:text-secondary">
          <Mail className="w-4 h-4" />
          hello@homate.be
        </a>
      </div>
    </div>
  );
}
