# Homate Agent

> **Van nieuwsgierig naar afspraak in 2 minuten.** Een agentic entry-point voor Homate die via een kort gesprek een thuisbatterij-match, prijsindicatie en adviseur-afspraak oplevert.

**Focus:** thuisbatterijen (solar volgt later) &nbsp;·&nbsp; **Taal:** Nederlands (BE) &nbsp;·&nbsp; **Status:** prototype

---

## Waarom dit bestaat

Homate's vetted-installer marketplace werkt, maar de consumer-side vraagt veel lees- en keuzework. Dit prototype test één hypothese: **een kort gesprek converteert beter dan een productcatalogus.** Geen vrije chat — elke stap heeft chips, sliders of knoppen, zodat gebruikers niet kunnen vastlopen.

## Stack

| Laag | Keuze |
| --- | --- |
| Build | Vite 8 + React 19 + TypeScript |
| Styling | Tailwind CSS v4 (tokens uit Stitch design system) |
| Routing | React Router 7 |
| Export | `jspdf` — downloadbare prijsindicatie |
| Analytics | `posthog-js` — pilot-funnel & session replay |
| LLM (optioneel) | `@anthropic-ai/sdk` — Claude Haiku 4.5 achter feature flag |

Default-modus is **scripted** (zero-cost, deterministisch). Claude-modus staat klaar voor live user studies zodra dynamische follow-ups nodig zijn.

## Quickstart

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open **http://localhost:5177**.

```bash
npm run build     # tsc + vite build → dist/
npm run preview   # serve dist lokaal
npm run lint      # eslint
```

## Flow

1. **Landing** — pill chat input, 4 seed-prompts, TL;DR waarde-blok
2. **Discovery** — scripted chat: naam → zon → kWp → verbruik → EV/HP → tarief → back-up → budget
3. **Voorstel** — beste match + 2 alternatieven, impact (besparing, zelfverbruik, CO₂), *"Waarom deze keuze"*
4. **Checkout** — lead-form + voorkeur-tijdslot → `/api/lead` + PDF-download
5. **Bevestigd** — download-PDF, CTA-call, reset

## Project layout

```
src/
  lib/
    agent.ts       # step-machine (eigenaar van stap-volgorde + widgets)
    catalog.ts     # mock batterij-catalogus (swap voor Google Sheet later)
    match.ts       # matching-algoritme
    pdf.ts         # prijsindicatie-PDF
  components/      # UI
  routes/          # landing, chat, quote, checkout, confirmed
api/
  chat.ts          # optionele Claude Haiku edge function
  lead.ts          # lead-intake → Resend email
```

## Catalog

Mock-data staat in [src/lib/catalog.ts](src/lib/catalog.ts). Wanneer de echte sheet beschikbaar is: schrijf een importer die dezelfde `Battery[]` shape output — de rest van de app blijft werken.

## Hybride Claude-modus

De app draait in twee modi, gestuurd door `VITE_USE_CLAUDE`:

| Modus | Gedrag | Kost per gesprek |
| --- | --- | --- |
| `0` *(default)* | Scripted Nederlandse zinnen uit [src/lib/agent.ts](src/lib/agent.ts) | €0 |
| `1` | Elke beurt live geschreven door Claude Haiku 4.5 via `/api/chat`. UI blijft vast (chips, sliders, step-volgorde) | ±€0,001–0,003 |

Onder Claude-modus:

- De step-machine blijft **eigenaar** van stap-volgorde en widget-keuze
- `/api/chat` krijgt stap + discovery-state + laatste user-input + korte history en schrijft **alleen** de Nederlandse zin
- Bij API-fout of > 6 s → stille fallback naar scripted zin. Nooit een blanco scherm.

### Claude lokaal testen

Edge functions draaien niet onder `vite dev`. Voor live Claude lokaal:

```bash
npx vercel login   # eerste keer
npx vercel dev     # serveert Vite + /api/*
```

Of push naar een Vercel preview branch — minder friction.

Prompt-engineering zit gecentraliseerd in [api/chat.ts](api/chat.ts) (`SYSTEM_PROMPT` + `stepInstruction`). Pas de toon daar aan, niet verspreid door de codebase.

## Deploy (Vercel)

```bash
vercel
```

Env vars in het Vercel dashboard:

| Key | Verplicht | Doel |
| --- | --- | --- |
| `VITE_POSTHOG_KEY` | aanbevolen | funnel-tracking + session replay |
| `VITE_POSTHOG_HOST` | optioneel | default `https://eu.posthog.com` |
| `VITE_USE_CLAUDE` | optioneel | `1` om `/api/chat` live te zetten |
| `ANTHROPIC_API_KEY` | optioneel | nodig voor Claude-modus |
| `RESEND_API_KEY` | optioneel | leadmail naar Homate-team |
| `LEAD_NOTIFY_EMAIL` | optioneel | waar de leadmail naartoe moet |

## Analytics events

Elk event is een stap in de funnel — zo zie je direct waar pilot-gebruikers afhaken:

```
landing_viewed      → landing_started
discovery_started   → discovery_completed
quote_viewed        → alternative_selected → quote_cta_clicked
checkout_viewed     → lead_submitted → pdf_downloaded
confirmation_viewed
```

## Roadmap

- [ ] Real catalog-import vanuit Google Sheet
- [ ] Solar-extensie (zelfde flow, andere matching)
- [ ] A/B test Claude-modus vs scripted op conversie
- [ ] Adviseur-dashboard voor binnengekomen leads

---

Built with ☀️ + 🔋 for [Homate](https://homate.be).
# homate-agent
