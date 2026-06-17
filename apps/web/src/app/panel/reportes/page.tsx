"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  obtenerAlertasStock,
  obtenerPle,
  obtenerValorizacion,
  type AlertaStock,
  type FormatoPle,
  type ReporteValorizacion,
} from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";

type Pestania = "valorizacion" | "alertas" | "ple";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "valorizacion", etiqueta: "Valorización" },
  { id: "alertas", etiqueta: "Alertas de stock" },
  { id: "ple", etiqueta: "Libros SUNAT (PLE)" },
];

/** Periodo SUNAT en formato AAAAMM (6 dígitos). */
const PATRON_PERIODO = /^\d{6}$/;

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** Dispara la descarga de un archivo .txt en el navegador a partir de su contenido. */
function descargarArchivo(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  URL.revokeObjectURL(url);
}

export default function PaginaReportes(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("valorizacion");

  const [valorizacion, setValorizacion] = useState<ReporteValorizacion | null>(null);
  const [paginaVal, setPaginaVal] = useState<number>(1);
  const [cargandoVal, setCargandoVal] = useState<boolean>(true);
  const [alertas, setAlertas] = useState<AlertaStock[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);
  const [avisoBase, setAvisoBase] = useState<Aviso | null>(null);

  const POR_PAGINA_VAL = 50;

  // PLE
  const [periodo, setPeriodo] = useState<string>("");
  const [descargandoPle, setDescargandoPle] = useState<FormatoPle | null>(null);
  const [avisoPle, setAvisoPle] = useState<Aviso | null>(null);

  // Alertas: una sola carga al montar.
  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setAlertas(await obtenerAlertasStock());
      } catch (error) {
        setAvisoBase({
          texto: mensajeError(error, "No se pudieron cargar las alertas."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  // Valorizacion: se recarga al cambiar de pagina.
  useEffect(() => {
    setCargandoVal(true);
    void (async (): Promise<void> => {
      try {
        setValorizacion(await obtenerValorizacion(paginaVal, POR_PAGINA_VAL));
      } catch (error) {
        setAvisoBase({
          texto: mensajeError(error, "No se pudo cargar la valorización."),
          tono: "error",
        });
      } finally {
        setCargandoVal(false);
      }
    })();
  }, [paginaVal]);

  async function manejarDescargaPle(formato: FormatoPle): Promise<void> {
    setAvisoPle(null);
    if (!PATRON_PERIODO.test(periodo)) {
      setAvisoPle({
        texto: "Ingresa un periodo válido en formato AAAAMM (ej. 202606).",
        tono: "error",
      });
      return;
    }
    setDescargandoPle(formato);
    try {
      const archivo = await obtenerPle(formato, periodo);
      if (!archivo.contenido) {
        setAvisoPle({
          texto: "El periodo no tiene movimientos para generar el archivo.",
          tono: "error",
        });
        return;
      }
      descargarArchivo(archivo.nombre, archivo.contenido);
      setAvisoPle({
        texto: `Archivo ${archivo.nombre} descargado.`,
        tono: "exito",
      });
    } catch (error) {
      setAvisoPle({
        texto: mensajeError(error, "No se pudo generar el archivo PLE."),
        tono: "error",
      });
    } finally {
      setDescargandoPle(null);
    }
  }

  const periodoInvalido = periodo !== "" && !PATRON_PERIODO.test(periodo);

  return (
    <div>
      <EncabezadoPagina
        titulo="Reportes"
        descripcion="Valorización del inventario, alertas de stock y libros electrónicos SUNAT."
      />

      <div className="flex gap-1 border-b border-borde" role="tablist" aria-label="Secciones de reportes">
        {PESTANIAS.map((p) => {
          const activa = pestania === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestania(p.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activa
                  ? "border-oro text-tinta"
                  : "border-transparent text-texto-sec hover:text-tinta"
              }`}
            >
              {p.etiqueta}
            </button>
          );
        })}
      </div>

      {avisoBase && (
        <div role="alert" className="mt-6 aviso aviso-peligro">
          <span>{avisoBase.texto}</span>
        </div>
      )}

      {pestania === "valorizacion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Stock valorizado</span>
            {valorizacion && (
              <span className="text-sm text-texto-sec">
                Total general:{" "}
                <span className="font-mono text-base font-semibold text-tinta">
                  {formatearSoles(valorizacion.totalGeneral)}
                </span>
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Familia</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo prom.</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {cargandoVal ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : !valorizacion || valorizacion.filas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      Sin datos de valorización.
                    </td>
                  </tr>
                ) : (
                  valorizacion.filas.map((fila) => (
                    <tr key={fila.skuId}>
                      <td className="font-mono">{fila.codigoParlante}</td>
                      <td className="text-tinta">{fila.producto}</td>
                      <td className="text-texto-sec">{fila.familia}</td>
                      <td className="num">{fila.cantidad}</td>
                      <td className="num">{formatearSoles(fila.costoPromedio)}</td>
                      <td className="num font-semibold text-tinta">
                        {formatearSoles(fila.valor)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {valorizacion && valorizacion.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-5 py-3">
              <p className="text-xs text-texto-sec">
                Mostrando{" "}
                <span className="font-mono text-texto">
                  {(paginaVal - 1) * POR_PAGINA_VAL + 1}–
                  {Math.min(paginaVal * POR_PAGINA_VAL, valorizacion.total)}
                </span>{" "}
                de <span className="font-mono text-texto">{formatearNumero(valorizacion.total)}</span> posiciones
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-contorno h-9 px-3"
                  disabled={cargandoVal || paginaVal <= 1}
                  onClick={() => setPaginaVal((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span className="px-1 text-xs text-texto-sec">
                  Página <span className="font-mono text-texto">{paginaVal}</span> de{" "}
                  <span className="font-mono text-texto">
                    {Math.max(1, Math.ceil(valorizacion.total / POR_PAGINA_VAL))}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-contorno h-9 px-3"
                  disabled={cargandoVal || paginaVal >= Math.ceil(valorizacion.total / POR_PAGINA_VAL)}
                  onClick={() => setPaginaVal((p) => p + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {pestania === "alertas" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Productos bajo stock mínimo</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="num">Disponible</th>
                  <th className="num">Stock mínimo</th>
                </tr>
              </thead>
              <tbody>
                {cargandoBase ? (
                  <tr>
                    <td colSpan={3} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : alertas.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-texto-ter">
                      No hay productos bajo el stock mínimo.
                    </td>
                  </tr>
                ) : (
                  alertas.map((alerta) => (
                    <tr key={alerta.skuId}>
                      <td className="text-tinta">{alerta.producto}</td>
                      <td className="num font-semibold text-peligro">{alerta.disponible}</td>
                      <td className="num">{alerta.stockMinimo}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {pestania === "ple" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Libros electrónicos (PLE)</span>
          </div>
          <div className="p-5">
            <p className="text-sm text-texto-sec">
              Genera los formatos del Registro de Inventario Permanente para subirlos al PLE de
              SUNAT.
            </p>

            {avisoPle && (
              <div
                role={avisoPle.tono === "error" ? "alert" : "status"}
                className={`mt-4 aviso ${avisoPle.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
              >
                <span>{avisoPle.texto}</span>
              </div>
            )}

            <div className="mt-4 max-w-xs">
              <label htmlFor="periodo" className="etiqueta-campo">
                Periodo (AAAAMM)
              </label>
              <input
                id="periodo"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                placeholder="202606"
                aria-invalid={periodoInvalido}
                className="campo font-mono"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => manejarDescargaPle("121")}
                disabled={descargandoPle !== null}
                className="btn btn-primario"
              >
                {descargandoPle === "121"
                  ? "Generando…"
                  : "Descargar formato 12.1 (unidades físicas)"}
              </button>
              <button
                type="button"
                onClick={() => manejarDescargaPle("131")}
                disabled={descargandoPle !== null}
                className="btn btn-primario"
              >
                {descargandoPle === "131"
                  ? "Generando…"
                  : "Descargar formato 13.1 (valorizado)"}
              </button>
            </div>

            <p className="mt-4 text-xs text-texto-ter">
              Estos archivos se suben al PLE de SUNAT.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
