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

/** Formatea una fecha ISO como "20/06/2026". Cadena vacia si la fecha es invalida. */
export function formatearFecha(valor: string): string {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "";
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(fecha);
}
