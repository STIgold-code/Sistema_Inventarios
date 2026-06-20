"use client";

import { useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  descargarArchivo,
  ErrorApi,
  obtenerRentabilidad,
  type EjeRentabilidad,
  type ReporteRentabilidad,
} from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

const EJES: readonly { id: EjeRentabilidad; etiqueta: string }[] = [
  { id: "articulo", etiqueta: "Artículo" },
  { id: "cliente", etiqueta: "Cliente" },
];

/** Fecha local en formato AAAA-MM-DD para los campos de rango. */
function fechaISO(fecha: Date): string {
  const a = fecha.getFullYear().toString();
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const d = fecha.getDate().toString().padStart(2, "0");
  return `${a}-${m}-${d}`;
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** Formatea un porcentaje en texto decimal (o null) como "34.40 %". */
function formatearPorcentaje(valor: string | null): string {
  if (valor === null) return "—";
  return `${formatearNumero(valor)} %`;
}

export default function PaginaRentabilidad(): React.JSX.Element {
  const hoy = new Date();
  const [desde, setDesde] = useState<string>(
    fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
  );
  const [hasta, setHasta] = useState<string>(fechaISO(hoy));
  const [agrupar, setAgrupar] = useState<EjeRentabilidad>("articulo");
  const [reporte, setReporte] = useState<ReporteRentabilidad | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function generar(): Promise<void> {
    setAviso(null);
    if (!desde || !hasta) {
      setAviso({ texto: "Selecciona un rango de fechas.", tono: "error" });
      return;
    }
    if (hasta < desde) {
      setAviso({
        texto: "La fecha final no puede ser anterior a la inicial.",
        tono: "error",
      });
      return;
    }
    setCargando(true);
    try {
      setReporte(await obtenerRentabilidad(desde, hasta, agrupar));
    } catch (error) {
      setReporte(null);
      setAviso({
        texto: mensajeError(error, "No se pudo generar el reporte de rentabilidad."),
        tono: "error",
      });
    } finally {
      setCargando(false);
    }
  }

  const [exportando, setExportando] = useState<boolean>(false);

  async function exportar(): Promise<void> {
    setAviso(null);
    if (!desde || !hasta) {
      setAviso({ texto: "Selecciona un rango de fechas.", tono: "error" });
      return;
    }
    if (hasta < desde) {
      setAviso({
        texto: "La fecha final no puede ser anterior a la inicial.",
        tono: "error",
      });
      return;
    }
    setExportando(true);
    try {
      const query = new URLSearchParams({ desde, hasta, agrupar });
      await descargarArchivo(
        `/reportes/rentabilidad/export.xlsx?${query.toString()}`,
        "rentabilidad.xlsx",
      );
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo exportar el reporte."),
        tono: "error",
      });
    } finally {
      setExportando(false);
    }
  }

  const etiquetaGrupo =
    EJES.find((e) => e.id === (reporte?.agrupar ?? agrupar))?.etiqueta ?? "Grupo";

  return (
    <div>
      <EncabezadoPagina
        titulo="Rentabilidad"
        descripcion="Margen de ventas por artículo o cliente, valorizado al costo real del kardex."
      />

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Margen de ventas</span>
          <div className="flex items-center gap-4">
            {reporte && (
              <span className="text-sm text-texto-sec">
                Margen total:{" "}
                <span className="font-mono text-base font-semibold text-tinta">
                  {formatearSoles(reporte.margenTotal)}
                </span>{" "}
                ({formatearPorcentaje(reporte.margenPorcentajeTotal)})
              </span>
            )}
            <button
              type="button"
              onClick={() => void exportar()}
              disabled={exportando || cargando}
              className="btn btn-contorno"
            >
              {exportando ? "Exportando…" : "Exportar a Excel"}
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm text-texto-sec">
            Compara la venta facturada contra el costo real (FIFO) de las salidas en el
            rango. Agrúpalo por artículo o por cliente.
          </p>

          {aviso && (
            <div
              role={aviso.tono === "error" ? "alert" : "status"}
              className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
            >
              <span>{aviso.texto}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="rent-desde" className="etiqueta-campo">
                Desde
              </label>
              <input
                id="rent-desde"
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="rent-hasta" className="etiqueta-campo">
                Hasta
              </label>
              <input
                id="rent-hasta"
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="rent-agrupar" className="etiqueta-campo">
                Agrupar por
              </label>
              <select
                id="rent-agrupar"
                value={agrupar}
                onChange={(e) => setAgrupar(e.target.value as EjeRentabilidad)}
                className="campo"
              >
                {EJES.map((eje) => (
                  <option key={eje.id} value={eje.id}>
                    {eje.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => void generar()}
                disabled={cargando}
                className="btn btn-primario w-full"
              >
                {cargando ? "Generando…" : "Generar"}
              </button>
            </div>
          </div>

          {reporte && reporte.sinPrecio > 0 && (
            <div role="status" className="aviso aviso-aviso">
              <span>
                {formatearNumero(reporte.sinPrecio)} movimiento(s) de venta no se pudieron
                emparejar con su línea de orden y se valorizaron sin venta.
              </span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>{etiquetaGrupo}</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Venta</th>
                  <th className="num">Costo</th>
                  <th className="num">Margen</th>
                  <th className="num">% Margen</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : !reporte ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      Selecciona un rango y genera el reporte.
                    </td>
                  </tr>
                ) : reporte.filas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      No hay ventas registradas en el rango seleccionado.
                    </td>
                  </tr>
                ) : (
                  reporte.filas.map((fila) => (
                    <tr key={fila.claveId ?? fila.etiqueta}>
                      <td className="text-tinta">{fila.etiqueta}</td>
                      <td className="num">{formatearNumero(fila.cantidad)}</td>
                      <td className="num">{formatearSoles(fila.venta)}</td>
                      <td className="num text-texto-sec">{formatearSoles(fila.costo)}</td>
                      <td className="num font-semibold text-tinta">
                        {formatearSoles(fila.margen)}
                      </td>
                      <td className="num">{formatearPorcentaje(fila.margenPorcentaje)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {reporte && reporte.filas.length > 0 && (
                <tfoot>
                  <tr>
                    <td className="font-semibold text-tinta">Total</td>
                    <td className="num" />
                    <td className="num font-semibold text-tinta">
                      {formatearSoles(reporte.ventaTotal)}
                    </td>
                    <td className="num font-semibold text-texto-sec">
                      {formatearSoles(reporte.costoTotal)}
                    </td>
                    <td className="num font-semibold text-tinta">
                      {formatearSoles(reporte.margenTotal)}
                    </td>
                    <td className="num font-semibold">
                      {formatearPorcentaje(reporte.margenPorcentajeTotal)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
