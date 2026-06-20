"use client";

import { useEffect, useState } from "react";
import { obtenerSeries, type SerieArticulo } from "@/lib/api";

interface PropsEntrada {
  /** Cantidad de numeros de serie que se deben capturar (= cantidad recibida). */
  cantidad: number;
  /** Series ingresadas actualmente (longitud puede diferir de cantidad). */
  valor: string[];
  onCambiar: (series: string[]) => void;
  /** Prefijo unico para los ids de los inputs (accesibilidad). */
  idBase: string;
}

/**
 * Captura de numeros de serie para una ENTRADA de stock (recepcion de compra).
 * Renderiza un input por unidad recibida; el numero de inputs sigue a la
 * cantidad. Usado en SKUs con controlaSerie: cada unidad ingresa con su serie.
 */
export function CapturaSeriesEntrada({
  cantidad,
  valor,
  onCambiar,
  idBase,
}: PropsEntrada): React.JSX.Element {
  const filas = Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0;

  function cambiarFila(indice: number, texto: string): void {
    const copia = Array.from({ length: filas }, (_, i) => valor[i] ?? "");
    copia[indice] = texto;
    onCambiar(copia);
  }

  if (filas === 0) {
    return (
      <p className="text-xs text-texto-ter">
        Ingresa una cantidad entera para capturar los números de serie.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-texto-ter">
        Este artículo controla número de serie. Ingresa {filas}{" "}
        {filas === 1 ? "número" : "números"} de serie (uno por unidad).
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Array.from({ length: filas }, (_, i) => (
          <input
            key={i}
            id={`${idBase}-serie-${i}`}
            value={valor[i] ?? ""}
            onChange={(e) => cambiarFila(i, e.target.value)}
            placeholder={`Serie ${i + 1}`}
            aria-label={`Número de serie ${i + 1}`}
            className="campo font-mono"
          />
        ))}
      </div>
    </div>
  );
}

interface PropsSalida {
  skuId: number;
  /** Solo se ofrecen series disponibles en este almacen (null = cualquiera). */
  almacenId: number | null;
  /** Cantidad de series que deben seleccionarse (= cantidad a despachar). */
  cantidad: number;
  /** Numeros de serie seleccionados actualmente. */
  valor: string[];
  onCambiar: (series: string[]) => void;
}

/**
 * Selector de numeros de serie para una SALIDA de stock (despacho de venta o
 * vale). Carga las series DISPONIBLES del SKU desde la API y permite marcar
 * exactamente la cantidad a despachar. Solo muestra series del almacen indicado.
 */
export function SelectorSeriesSalida({
  skuId,
  almacenId,
  cantidad,
  valor,
  onCambiar,
}: PropsSalida): React.JSX.Element {
  const [disponibles, setDisponibles] = useState<SerieArticulo[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setError(null);
    void (async (): Promise<void> => {
      try {
        const todas = await obtenerSeries({ skuId, estado: "DISPONIBLE" });
        if (!activo) return;
        const filtradas =
          almacenId === null
            ? todas
            : todas.filter((s) => s.almacenId === String(almacenId));
        setDisponibles(filtradas);
      } catch {
        if (activo) setError("No se pudieron cargar las series disponibles.");
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
  }, [skuId, almacenId]);

  function alternar(numeroSerie: string): void {
    if (valor.includes(numeroSerie)) {
      onCambiar(valor.filter((n) => n !== numeroSerie));
      return;
    }
    onCambiar([...valor, numeroSerie]);
  }

  const objetivo = Number.isInteger(cantidad) && cantidad > 0 ? cantidad : 0;

  if (cargando) {
    return <p className="text-xs text-texto-ter">Cargando series disponibles…</p>;
  }

  if (error) {
    return (
      <p className="text-xs" role="alert" style={{ color: "var(--peligro)" }}>
        {error}
      </p>
    );
  }

  if (disponibles.length === 0) {
    return (
      <p className="text-xs text-texto-ter">
        No hay números de serie disponibles para este artículo en el almacén.
      </p>
    );
  }

  const completo = objetivo > 0 && valor.length === objetivo;

  return (
    <div className="space-y-2">
      <p className="text-xs text-texto-ter">
        Selecciona {objetivo} de {disponibles.length}{" "}
        {disponibles.length === 1 ? "serie disponible" : "series disponibles"}.{" "}
        <span
          className={completo ? "font-medium" : "text-texto-sec"}
          style={completo ? { color: "var(--exito)" } : undefined}
        >
          Seleccionadas: {valor.length}
          {objetivo > 0 ? ` / ${objetivo}` : ""}
        </span>
      </p>
      <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-borde bg-panel p-2">
        {disponibles.map((s) => {
          const marcada = valor.includes(s.numeroSerie);
          return (
            <label
              key={s.id}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors ${
                marcada
                  ? "border-oro bg-panel-alt text-tinta"
                  : "border-borde text-texto-sec hover:bg-panel-alt"
              }`}
            >
              <input
                type="checkbox"
                checked={marcada}
                onChange={() => alternar(s.numeroSerie)}
                className="sr-only"
              />
              <span className="font-mono">{s.numeroSerie}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
