<wizard-report>
# PostHog post-wizard report

The wizard has completed a deep integration of PostHog into the Homate agent prototype. The project already had comprehensive client-side tracking via `posthog-js` in `src/lib/analytics.ts`. This integration adds server-side event tracking using `posthog-node` in both Vercel Edge API routes (`api/lead.ts` and `api/chat.ts`), ensuring critical business events are captured server-side where they cannot be blocked by ad blockers and provide a ground-truth record. User identity is propagated from the client (email as `distinctId`) to the server so events from both sides are correlated in PostHog.

## Events instrumented

| Event | Description | File |
|---|---|---|
| `lead_received` | Server-side confirmation that a lead was received and processed by the API, including battery ID, postcode, and discovery data. | `api/lead.ts` |
| `lead_email_sent` | Notification email successfully dispatched to the Homate team via Resend. | `api/lead.ts` |
| `lead_email_failed` | Resend email notification failed; server-side error tracking for lead email delivery. | `api/lead.ts` |
| `chat_model_error` | Claude Haiku model call failed in the chat API route; monitors AI reliability per discovery step. | `api/chat.ts` |

### LLM analytics events

| Event | Description | File |
|---|---|---|
| `$ai_generation` | PostHog standard LLM generation event. Captured on every Claude Haiku call — success or failure — with model, token counts, latency, stop reason, input messages, and output. Feeds directly into the PostHog LLM Analytics → Generations and Traces views. | `api/chat.ts` |

## Changes summary

- **`api/lead.ts`** — Added `posthog-node` client (edge-safe, `flushAt: 1`, `flushInterval: 0`). On each lead: identifies the user by email, captures `lead_received` with battery/postcode/discovery properties, captures `lead_email_sent` or `lead_email_failed` + `captureException` depending on Resend outcome. Calls `posthog.shutdown()` before returning.
- **`api/chat.ts`** — Refactored to hoist the `posthog-node` client to the top of the handler. On each successful Claude call: captures `$ai_generation` with `$ai_model`, `$ai_input_tokens`, `$ai_output_tokens`, `$ai_latency`, `$ai_stop_reason`, `$ai_input`, and `$ai_output_choices`. On failure: captures `$ai_generation` with `$ai_is_error: true`, `captureException` for stack traces, and the existing `chat_model_error` custom event. Uses manual capture (not OTel) because Vercel Edge runtime does not support `@opentelemetry/sdk-node`.
- **`.env`** — Populated `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` (used by both Vite client and referenced server-side via `process.env`).
- **`package.json`** — `posthog-node` added as a dependency.

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- **Dashboard — Analytics basics:** https://eu.posthog.com/project/164226/dashboard/636795
- **Lead conversion funnel** (landing_started → lead_submitted): https://eu.posthog.com/project/164226/insights/q7G2Umvp
- **Daily leads received (server-confirmed):** https://eu.posthog.com/project/164226/insights/boKaho05
- **Discovery drop-off: started vs completed:** https://eu.posthog.com/project/164226/insights/jwBtoDqS
- **PDF downloads vs leads submitted:** https://eu.posthog.com/project/164226/insights/AnSArHjv
- **Chat model errors over time:** https://eu.posthog.com/project/164226/insights/D3uOz7Fk

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.

</wizard-report>
