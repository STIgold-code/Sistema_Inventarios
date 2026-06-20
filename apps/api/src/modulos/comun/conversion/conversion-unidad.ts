import { Prisma } from "@prisma/client";

const D = Prisma.Decimal;

/**
 * Convierte una cantidad capturada en la unidad de REFERENCIA del SKU hacia la
 * unidad de CONTROL (la que gobierna el stock del ledger).
 *
 * Regla: cantidadControl = cantidadReferencia * factorConversion
 * donde factorConversion = cuantas unidades de control equivalen a UNA unidad
 * de referencia.
 *
 * La conversion es OPCIONAL: si el SKU no define factor (null) o este es 1,
 * la cantidad pasa sin transformacion. Esto preserva los flujos existentes
 * que capturan directamente en unidad de control.
 *
 * @param cantidadReferencia Cantidad ingresada por el usuario (string para no
 *   perder precision decimal).
 * @param factorConversion Factor del SKU (Decimal de Prisma o null).
 * @returns Cantidad equivalente en unidad de control, como string.
 */
export function aUnidadDeControl(
  cantidadReferencia: string,
  factorConversion: Prisma.Decimal | null | undefined,
): string {
  const factor = normalizarFactor(factorConversion);
  if (factor.equals(1)) {
    return new D(cantidadReferencia).toString();
  }
  return new D(cantidadReferencia).mul(factor).toString();
}

/**
 * Convierte una cantidad expresada en unidad de CONTROL hacia la unidad de
 * REFERENCIA del SKU (operacion inversa, util para mostrar saldos al usuario).
 *
 * cantidadReferencia = cantidadControl / factorConversion
 */
export function aUnidadDeReferencia(
  cantidadControl: string,
  factorConversion: Prisma.Decimal | null | undefined,
): string {
  const factor = normalizarFactor(factorConversion);
  if (factor.equals(1)) {
    return new D(cantidadControl).toString();
  }
  return new D(cantidadControl).div(factor).toString();
}

/**
 * Convierte un precio/costo unitario expresado POR unidad de referencia hacia
 * un precio POR unidad de control, preservando el importe monetario total.
 *
 * Si el usuario compra a `costoReferencia` por cada unidad de referencia y una
 * unidad de referencia equivale a `factorConversion` unidades de control, el
 * costo por unidad de control es costoReferencia / factorConversion. Asi
 * cantidadControl * costoControl == cantidadReferencia * costoReferencia.
 */
export function precioAUnidadDeControl(
  precioReferencia: string,
  factorConversion: Prisma.Decimal | null | undefined,
): string {
  const factor = normalizarFactor(factorConversion);
  if (factor.equals(1)) {
    return new D(precioReferencia).toString();
  }
  return new D(precioReferencia).div(factor).toString();
}

/**
 * Valida que un factor de conversion sea utilizable: debe ser positivo y
 * distinto de cero. Lanza un error de dominio si no lo es.
 */
export function validarFactorConversion(factor: Prisma.Decimal): void {
  if (!factor.isFinite() || factor.lessThanOrEqualTo(0)) {
    throw new Error("El factor de conversion debe ser un decimal mayor que cero");
  }
}

/** Devuelve el factor efectivo: 1 cuando es null/undefined. */
function normalizarFactor(factor: Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (factor === null || factor === undefined) {
    return new D(1);
  }
  return factor;
}
