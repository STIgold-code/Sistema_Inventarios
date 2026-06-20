"use client";

import { type Sku } from "@/lib/api";
import { formatearNumero } from "@/lib/formato";

interface Props {
  /** SKU de la linea; si no tiene unidad de referencia, no se renderiza nada. */
  sku: Sku | null;
  /** true = la cantidad ingresada esta en unidad de referencia. */
  enUnidadReferencia: boolean;
  onCambiar: (enUnidadReferencia: boolean) => void;
  /** Cantidad cruda escrita por el usuario (string del input). */
  cantidad: string;
  /** id para asociar el <label> del selector. */
  id: string;
}

/**
 * Selector de unidad por linea para SKUs con unidad de referencia configurada.
 * Permite ingresar la cantidad en la unidad de control (la que gobierna el stock)
 * o en la unidad de referencia, y muestra la equivalencia en la otra unidad.
 *
 * factorConversion = cuantas unidades de control equivalen a UNA de referencia.
 * Si el SKU no tiene unidad de referencia, el componente no renderiza nada y los
 * flujos existentes quedan intactos.
 */
export function SelectorUnidadLinea({
  sku,
  enUnidadReferencia,
  onCambiar,
  cantidad,
  id,
}: Props): React.JSX.Element | null {
  if (!sku || !sku.unidadReferencia || !sku.factorConversion) {
    return null;
  }

  const factor = Number(sku.factorConversion);
  const cantidadNum = Number(cantidad);
  const factorValido = Number.isFinite(factor) && factor > 0;
  const cantidadValida = Number.isFinite(cantidadNum) && cantidadNum > 0;

  const unidadControl = sku.unidad;
  const unidadRef = sku.unidadReferencia;

  // Equivalencia: si el usuario ingresa en referencia, mostramos cuanto es en
  // control (cantidad * factor); si ingresa en control, cuanto es en referencia.
  let equivalencia: string | null = null;
  if (factorValido && cantidadValida) {
    if (enUnidadReferencia) {
      const enControl = cantidadNum * factor;
      equivalencia = `= ${formatearNumero(enControl)} ${unidadControl.codigo}`;
    } else {
      const enReferencia = cantidadNum / factor;
      equivalencia = `= ${formatearNumero(enReferencia)} ${unidadRef.codigo}`;
    }
  }

  return (
    <div>
      <label htmlFor={id} className="etiqueta-campo">
        Unidad
      </label>
      <select
        id={id}
        value={enUnidadReferencia ? "referencia" : "control"}
        onChange={(e) => onCambiar(e.target.value === "referencia")}
        className="campo"
      >
        <option value="control">{unidadControl.codigo} — {unidadControl.nombre}</option>
        <option value="referencia">{unidadRef.codigo} — {unidadRef.nombre}</option>
      </select>
      {equivalencia ? (
        <p className="mt-1.5 font-mono text-xs text-texto-ter">{equivalencia}</p>
      ) : (
        <p className="mt-1.5 text-xs text-texto-ter">
          1 {unidadRef.codigo} = {formatearNumero(factor)} {unidadControl.codigo}
        </p>
      )}
    </div>
  );
}
