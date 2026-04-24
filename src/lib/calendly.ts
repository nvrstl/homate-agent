// Lazy-load the Calendly widget script + CSS exactly once. Called on-demand
// from the checkout button so the bundle isn't impacted for users who never
// reach checkout or never click the alternative scheduling CTA.

interface CalendlyPopup {
  initPopupWidget: (args: { url: string; prefill?: Record<string, string> }) => void;
}

declare global {
  interface Window {
    Calendly?: CalendlyPopup;
  }
}

let loadingPromise: Promise<void> | null = null;

export function loadCalendly(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Calendly) return Promise.resolve();
  if (loadingPromise) return loadingPromise;

  loadingPromise = new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://assets.calendly.com/assets/external/widget.css";
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://assets.calendly.com/assets/external/widget.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Calendly script failed to load"));
    document.body.appendChild(script);
  });

  return loadingPromise;
}

export async function openCalendlyPopup(url: string, prefill?: Record<string, string>) {
  await loadCalendly();
  if (window.Calendly) {
    window.Calendly.initPopupWidget({ url, prefill });
  }
}
