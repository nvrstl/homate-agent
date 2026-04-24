// Vercel serverless function: persists a lead.
// For the pilot we simply log to stdout + (optionally) forward via Resend if configured.
// Real CRM integration (HubSpot/Pipedrive/sheet) can swap in here later.

import { PostHog } from "posthog-node";

export const config = { runtime: "edge" };

interface LeadPayload {
  firstName?: string;
  email: string;
  phone: string;
  postcode?: string;
  notes?: string;
  quoteId: string;
  discovery: Record<string, unknown>;
  productKind?: "battery" | "heatpump";
  recommendedProductId?: string;
  recommendedBatteryId?: string;    // legacy / batteries only
}

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: LeadPayload;
  try {
    payload = (await req.json()) as LeadPayload;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  if (!payload.email || !payload.phone) {
    return new Response(JSON.stringify({ error: "Missing contact fields" }), { status: 400 });
  }

  // 1) Always log so Vercel shows it in the function logs during pilot.
  console.log("[lead]", JSON.stringify(payload));

  // 2) PostHog server-side tracking (edge-safe, flushAt=1 so events send before function exits).
  const posthog = new PostHog(process.env.VITE_POSTHOG_KEY ?? "", {
    host: process.env.VITE_POSTHOG_HOST ?? "https://eu.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
    enableExceptionAutocapture: true,
  });

  const distinctId = payload.email;

  posthog.identify({
    distinctId,
    properties: {
      $set: {
        email: payload.email,
        first_name: payload.firstName,
        postcode: payload.postcode,
      },
    },
  });

  const recommendedId = payload.recommendedProductId ?? payload.recommendedBatteryId ?? "unknown";
  const productKind = payload.productKind ?? "battery";

  await posthog.captureImmediate({
    distinctId,
    event: "lead_received",
    properties: {
      product_kind: productKind,
      product_id: recommendedId,
      battery_id: productKind === "battery" ? recommendedId : undefined,
      quote_id: payload.quoteId,
      postcode: payload.postcode,
      has_solar: payload.discovery.hasSolar,
      budget: payload.discovery.budget,
    },
  });

  // 3) Optionally notify the Homate team by email via Resend if configured.
  const resendKey = process.env.RESEND_API_KEY;
  const notifyTo = process.env.LEAD_NOTIFY_EMAIL;
  if (resendKey && notifyTo) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Homate Agent <no-reply@homate.be>",
          to: [notifyTo],
          subject: `Nieuwe lead — ${payload.firstName ?? payload.email} (${productKind}: ${recommendedId})`,
          html: renderLeadEmail(payload, productKind, recommendedId),
        }),
      });
      await posthog.captureImmediate({
        distinctId,
        event: "lead_email_sent",
        properties: { quote_id: payload.quoteId },
      });
    } catch (err) {
      console.error("resend failed", err);
      await posthog.captureExceptionImmediate(err, distinctId, { quote_id: payload.quoteId });
      await posthog.captureImmediate({
        distinctId,
        event: "lead_email_failed",
        properties: { quote_id: payload.quoteId },
      });
    }
  }

  await posthog.shutdown();

  return new Response(JSON.stringify({ ok: true, quoteId: payload.quoteId }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderLeadEmail(p: LeadPayload, productKind: string, productId: string): string {
  const d = p.discovery as Record<string, unknown>;
  const rows = Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${k}</td><td>${String(v)}</td></tr>`)
    .join("");
  const productLabel = productKind === "heatpump" ? "warmtepomp" : "thuisbatterij";
  return `
    <div style="font-family:system-ui,sans-serif;color:#191c1d;max-width:560px">
      <h2 style="color:#172736">Nieuwe lead uit Homate Agent</h2>
      <p><strong>${p.firstName ?? ""}</strong> — ${p.email} — ${p.phone}</p>
      <p>Postcode: ${p.postcode ?? "-"}</p>
      <p>Aanbevolen ${productLabel}: <strong>${productId}</strong></p>
      <p>Offerte-ID: ${p.quoteId}</p>
      ${p.notes ? `<p><em>${p.notes}</em></p>` : ""}
      <h3 style="margin-top:24px">Discovery</h3>
      <table>${rows}</table>
    </div>
  `;
}
