const eur = new Intl.NumberFormat("nl-BE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const num = new Intl.NumberFormat("nl-BE", { maximumFractionDigits: 0 });

export const fmtEur = (n: number) => eur.format(n);
export const fmtNum = (n: number) => num.format(n);

export function quoteNumber() {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `HM-${y}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${Math.floor(Math.random() * 9000 + 1000)}`;
}
