import posthog from "posthog-js";

let inited = false;

export function initAnalytics() {
  if (inited) return;
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? "https://eu.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: true,
  });
  inited = true;
}

export function track(event: string, props?: Record<string, unknown>) {
  if (!inited) return;
  posthog.capture(event, props);
}

export function identifyLead(email: string, props?: Record<string, unknown>) {
  if (!inited) return;
  posthog.identify(email, props);
}
