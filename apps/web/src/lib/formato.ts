/** Formatea un valor decimal (string o number) como soles peruanos. */
export function formatearSoles(valor: string | number): string {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Formatea un valor decimal (string o number) como dolares (USD). */
export function formatearDolares(valor: string | number): string {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

/** Formatea un numero con separadores de miles. */
export function formatearNumero(valor: string | number): string {
  const n = typeof valor === "string" ? Number(valor) : valor;
  return new Intl.NumberFormat("es-PE").format(Number.isFinite(n) ? n : 0);
}
