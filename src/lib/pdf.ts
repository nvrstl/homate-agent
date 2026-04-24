import jsPDF from "jspdf";
import type { QuoteResult, Battery, HeatPump } from "../types";
import { fmtEur, fmtNum, quoteNumber } from "./format";

const isBattery = (p: Battery | HeatPump): p is Battery => "capacityKwh" in p;
const isHeatPump = (p: Battery | HeatPump): p is HeatPump => "nominalKw" in p;

export function generateQuotePdf(quote: QuoteResult, opts: { quoteId?: string; customerName?: string } = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const id = opts.quoteId ?? quoteNumber();
  const today = new Date().toLocaleDateString("nl-BE", { day: "2-digit", month: "long", year: "numeric" });
  const validUntil = new Date(Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString("nl-BE");

  // Header bar
  doc.setFillColor(23, 39, 54);
  doc.rect(0, 0, 210, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Homate", 15, 19);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Jouw energie, slimmer opgeslagen.", 15, 24);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("PRIJSINDICATIE", 165, 19);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(`Nr. ${id}`, 165, 24);

  // Meta block
  doc.setTextColor(23, 39, 54);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(opts.customerName ?? quote.discovery.firstName ?? "Geachte klant", 15, 45);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(67, 71, 76);
  doc.text(`Datum: ${today}`, 15, 52);
  doc.text(`Geldig tot: ${validUntil}`, 15, 57);

  // Intro
  doc.setFontSize(10);
  doc.setTextColor(25, 28, 29);
  const productLabel = quote.productKind === "heatpump" ? "warmtepomp" : "thuisbatterij";
  const introText = quote.productKind === "heatpump"
    ? `Bedankt voor je interesse in een Homate-warmtepomp. Op basis van jouw antwoorden — ${quote.discovery.hpHouseOld ? "woning ≥10 jaar, " : "recente woning, "}${quote.discovery.hpInsulation ? `${quote.discovery.hpInsulation} isolatie, ` : ""}${quote.discovery.hpCurrentSource === "gas" ? `±${fmtNum(quote.discovery.hpGasM3 ?? 0)} m³ gas/jaar` : quote.discovery.hpCurrentSource === "oil" ? `±${fmtNum(quote.discovery.hpOilL ?? 0)} L mazout/jaar` : quote.discovery.hpCurrentSource === "heatpump" ? `vervanging ${quote.discovery.hpCurrentKw ?? "?"} kW WP` : ""} — is dit de ${productLabel} die we aanbevelen.`
    : `Bedankt voor je interesse in een Homate-thuisbatterij. Op basis van jouw antwoorden — ${quote.discovery.hasSolar ? `${quote.discovery.solarKwp ?? "?"} kWp zonnepanelen, ` : "geen zonnepanelen, "}jaarverbruik ±${fmtNum(quote.discovery.yearlyUsageKwh ?? 0)} kWh${quote.discovery.dynamicTariff ? ", dynamisch tarief" : ""}${quote.discovery.hasEv ? ", elektrische wagen" : ""}${quote.discovery.hasHeatPump ? ", warmtepomp" : ""} — is dit de ${productLabel} die we aanbevelen.`;
  const intro = doc.splitTextToSize(introText, 180);
  doc.text(intro, 15, 70);

  // Product box
  const y = 92;
  doc.setDrawColor(196, 198, 204);
  doc.roundedRect(15, y, 180, 55, 3, 3);
  doc.setFillColor(230, 247, 241);
  doc.roundedRect(15, y, 180, 10, 3, 3, "F");
  doc.setTextColor(0, 166, 118);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("AANBEVOLEN SYSTEEM", 20, y + 6.5);
  doc.setTextColor(25, 28, 29);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`${quote.recommended.brand} ${quote.recommended.model}`, 20, y + 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const best = doc.splitTextToSize(quote.recommended.bestFor, 170);
  doc.text(best, 20, y + 27);

  doc.setFontSize(9);
  doc.setTextColor(67, 71, 76);
  const rec = quote.recommended;
  const specs: [string, string][] = [];
  if (isBattery(rec)) {
    specs.push(["Capaciteit (bruikbaar)", `${fmtNum(rec.usableKwh)} kWh`]);
    specs.push(["Waarborg", `${rec.warrantyYears} jaar`]);
    specs.push(["Back-up", rec.backup ? "Ja" : "Niet inbegrepen"]);
  } else if (isHeatPump(rec)) {
    specs.push(["Nominaal vermogen", `${fmtNum(rec.nominalKw)} kW`]);
    specs.push(["SCOP (rendement)", rec.scop.toFixed(1)]);
    specs.push(["Sanitair warm water", rec.dhwLiters > 0 ? `${rec.dhwLiters} L ingebouwd` : "aparte boiler"]);
    specs.push(["Waarborg", `${rec.warrantyYears} jaar`]);
  }
  specs.push(["Geschatte jaarbesparing", fmtEur(quote.estimatedYearlySavingsEur)]);
  specs.push(["Terugverdientijd", `±${quote.paybackYears} jaar`]);
  let row = y + 38;
  specs.forEach(([k, v]) => {
    doc.text(k, 20, row);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(25, 28, 29);
    doc.text(v, 110, row);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(67, 71, 76);
    row += 5;
  });

  // Pricing
  const py = 165;
  doc.setFillColor(23, 39, 54);
  doc.roundedRect(15, py, 180, 22, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const btwLabel = quote.productKind === "heatpump" && isHeatPump(quote.recommended) && quote.recommended.btwReduced
    ? "Totale prijsindicatie (incl. 6% BTW woning ≥10j, levering en installatie)"
    : "Totale prijsindicatie (incl. 21% BTW, levering en installatie)";
  doc.text(btwLabel, 20, py + 9);

  // Subsidy line for heat pumps (under the price block).
  if (quote.productKind === "heatpump" && isHeatPump(quote.recommended) && (quote.subsidyEur ?? 0) > 0) {
    doc.setTextColor(0, 166, 118);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Mijn VerbouwPremie: − ${fmtEur(quote.subsidyEur ?? 0)}`, 20, py + 23);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(23, 39, 54);
    doc.setFontSize(11);
    doc.text(`Netto na premie: ${fmtEur(quote.netPriceAfterSubsidy ?? quote.recommended.priceIncl)}`, 20, py + 29);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(fmtEur(quote.recommended.priceIncl), 20, py + 17);

  // Disclaimer
  doc.setTextColor(67, 71, 76);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  const disclaimer = doc.splitTextToSize(
    "Dit is een prijsindicatie, geen bindende offerte. De definitieve offerte wordt opgemaakt na een kort adviesgesprek en eventuele site check, zodat we zeker zijn dat alles past. Prijs is geldig 30 dagen.",
    180,
  );
  doc.text(disclaimer, 15, py + 32);

  // Next steps
  doc.setFont("helvetica", "bold");
  doc.setTextColor(23, 39, 54);
  doc.setFontSize(11);
  doc.text("Volgende stap", 15, py + 50);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(67, 71, 76);
  doc.text("Een Homate-adviseur belt je binnen 1 werkdag om dit voorstel te bespreken en de", 15, py + 57);
  doc.text("officiële offerte op te maken. Geen verplichtingen.", 15, py + 62);

  // Footer
  doc.setDrawColor(196, 198, 204);
  doc.line(15, 282, 195, 282);
  doc.setFontSize(7);
  doc.setTextColor(116, 119, 124);
  doc.text(`Homate · Onderdeel van Camino Group · BTW BE 0XXX.XXX.XXX · hello@homate.be · homate.be`, 105, 288, { align: "center" });

  doc.save(`Homate-prijsindicatie-${id}.pdf`);
  return id;
}
