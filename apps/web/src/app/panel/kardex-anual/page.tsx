"use client";

import { useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  obtenerKardexAnual,
  type ReporteKardexAnual,
  type Sku,
} from "@/lib/api";

export default function PaginaKardexAnual(): React.JSX.Element {
  const [sku, setSku] = useState<Sku | null>(null);
  const [anio, setAnio] = useState<string>(String(new Date().getFullYear()));
  const [reporte, setReporte] = useState<ReporteKardexAnual | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar(): Promise<void> {
    if (!sku) {
      setError("Selecciona un producto.");
      return;
    }
    if (!/^\d{4}$/.test(anio)) {
      setError("Ingresa un año válido (AAAA).");
      return;
    }
    setCargando(true);
    setError(null);
    try {
      setReporte(await obtenerKardexAnual(sku.id, Number(anio)));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo cargar el kardex anual.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Kardex anual"
        descripcion="Resumen mensual de entradas, salidas y saldo de un producto en el año."
      />
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-96">
          <label className="etiqueta-campo">Producto</label>
          <SelectorSku valor={sku} onSeleccionar={setSku} />
        </div>
        <div className="w-32">
          <label htmlFor="anio" className="etiqueta-campo">
            Año
          </label>
          <input
            id="anio"
            value={anio}
            onChange={(e) => setAnio(e.target.value)}
            inputMode="numeric"
            className="campo"
          />
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando} className="btn btn-primario">
          {cargando ? "Cargando…" : "Ver kardex"}
        </button>
      </div>

      {error && (
        <div className="aviso aviso-peligro mt-4" role="alert">
          <span>{error}</span>
        </div>
      )}

      {reporte && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {reporte.codigoParlante} — {reporte.producto} ({reporte.anio})
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="num">Entradas</th>
                  <th className="num">Valor entr.</th>
                  <th className="num">Salidas</th>
                  <th className="num">Valor sal.</th>
                  <th className="num">Saldo</th>
                  <th className="num">Valor saldo</th>
                </tr>
              </thead>
              <tbody>
                {reporte.meses.map((m) => (
                  <tr key={m.mes}>
                    <td>{m.etiqueta}</td>
                    <td className="num">{m.entradasCantidad}</td>
                    <td className="num">{m.entradasValor}</td>
                    <td className="num">{m.salidasCantidad}</td>
                    <td className="num">{m.salidasValor}</td>
                    <td className="num font-semibold">{m.saldoCantidad}</td>
                    <td className="num">{m.saldoValor}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td>Total</td>
                  <td className="num">{reporte.totales.entradasCantidad}</td>
                  <td className="num">{reporte.totales.entradasValor}</td>
                  <td className="num">{reporte.totales.salidasCantidad}</td>
                  <td className="num">{reporte.totales.salidasValor}</td>
                  <td className="num" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
