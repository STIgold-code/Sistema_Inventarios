"use client";

import { useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  guardarCuentasContables,
  obtenerAsiento,
  obtenerAsientoArchivo,
  obtenerCuentasContables,
  type Asiento,
  type ConceptoContable,
  type CuentaContable,
  type SeparadorAsiento,
  type TipoAsiento,
} from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";

type Pestania = "cuentas" | "asientos";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "cuentas", etiqueta: "Configuración de cuentas" },
  { id: "asientos", etiqueta: "Generar asiento" },
];

/** Conceptos configurables, en el orden y con la etiqueta que ve el usuario. */
const CONCEPTOS: readonly { id: ConceptoContable; etiqueta: string }[] = [
  { id: "COSTO_VENTA", etiqueta: "Costo de venta" },
  { id: "CONSUMO", etiqueta: "Consumo (vales de salida)" },
  { id: "COMPRA", etiqueta: "Compra (recepción)" },
  { id: "DEVOLUCION", etiqueta: "Devolución de venta" },
];

/** Tipos de asiento que el backend puede generar (movimientos valorizados). */
const TIPOS_ASIENTO: readonly { id: TipoAsiento; etiqueta: string }[] = [
  { id: "COSTO_VENTA", etiqueta: "Costo de venta" },
  { id: "CONSUMO", etiqueta: "Consumo (vales de salida)" },
];

const PATRON_PERIODO = /^\d{6}$/;

function etiquetaConcepto(concepto: ConceptoContable): string {
  return CONCEPTOS.find((c) => c.id === concepto)?.etiqueta ?? concepto;
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** Dispara la descarga de un archivo de texto (TXT/CSV) en el navegador. */
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

/** Mapa concepto -> {debe, haber} para edición controlada de toda la tabla. */
type MapaCuentas = Record<ConceptoContable, { cuentaDebe: string; cuentaHaber: string }>;

function mapaVacio(): MapaCuentas {
  return CONCEPTOS.reduce((acc, c) => {
    acc[c.id] = { cuentaDebe: "", cuentaHaber: "" };
    return acc;
  }, {} as MapaCuentas);
}

export default function PaginaContabilidad(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("cuentas");

  // ── Configuración de cuentas ──────────────────────────────────────────────
  const [cuentas, setCuentas] = useState<MapaCuentas>(mapaVacio);
  const [cargandoCuentas, setCargandoCuentas] = useState<boolean>(true);
  const [guardandoCuentas, setGuardandoCuentas] = useState<boolean>(false);
  const [avisoCuentas, setAvisoCuentas] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const config = await obtenerCuentasContables();
        const mapa = mapaVacio();
        for (const fila of config) {
          mapa[fila.concepto] = {
            cuentaDebe: fila.cuentaDebe,
            cuentaHaber: fila.cuentaHaber,
          };
        }
        setCuentas(mapa);
      } catch (error) {
        setAvisoCuentas({
          texto: mensajeError(error, "No se pudo cargar la configuración de cuentas."),
          tono: "error",
        });
      } finally {
        setCargandoCuentas(false);
      }
    })();
  }, []);

  function editarCuenta(
    concepto: ConceptoContable,
    campo: "cuentaDebe" | "cuentaHaber",
    valor: string,
  ): void {
    setCuentas((prev) => ({
      ...prev,
      [concepto]: { ...prev[concepto], [campo]: valor.trim() },
    }));
  }

  async function guardarCuentas(): Promise<void> {
    setAvisoCuentas(null);
    // Solo se envían los conceptos con ambas cuentas llenas; una sola cuenta es inválido.
    const payload: CuentaContable[] = [];
    for (const c of CONCEPTOS) {
      const { cuentaDebe, cuentaHaber } = cuentas[c.id];
      const llenaDebe = cuentaDebe !== "";
      const llenaHaber = cuentaHaber !== "";
      if (llenaDebe !== llenaHaber) {
        setAvisoCuentas({
          texto: `"${c.etiqueta}" debe tener cuenta de debe y de haber, o ninguna.`,
          tono: "error",
        });
        return;
      }
      if (llenaDebe && llenaHaber) {
        payload.push({ concepto: c.id, cuentaDebe, cuentaHaber });
      }
    }
    if (payload.length === 0) {
      setAvisoCuentas({
        texto: "Configura al menos un concepto con sus cuentas de debe y haber.",
        tono: "error",
      });
      return;
    }
    setGuardandoCuentas(true);
    try {
      const config = await guardarCuentasContables({ cuentas: payload });
      const mapa = mapaVacio();
      for (const fila of config) {
        mapa[fila.concepto] = {
          cuentaDebe: fila.cuentaDebe,
          cuentaHaber: fila.cuentaHaber,
        };
      }
      setCuentas(mapa);
      setAvisoCuentas({ texto: "Configuración guardada.", tono: "exito" });
    } catch (error) {
      setAvisoCuentas({
        texto: mensajeError(error, "No se pudo guardar la configuración."),
        tono: "error",
      });
    } finally {
      setGuardandoCuentas(false);
    }
  }

  // ── Generación de asientos ────────────────────────────────────────────────
  const [periodo, setPeriodo] = useState<string>("");
  const [tipo, setTipo] = useState<TipoAsiento>("COSTO_VENTA");
  const [asiento, setAsiento] = useState<Asiento | null>(null);
  const [generando, setGenerando] = useState<boolean>(false);
  const [descargando, setDescargando] = useState<SeparadorAsiento | null>(null);
  const [avisoAsiento, setAvisoAsiento] = useState<Aviso | null>(null);

  const periodoInvalido = periodo !== "" && !PATRON_PERIODO.test(periodo);

  async function generarAsiento(): Promise<void> {
    setAvisoAsiento(null);
    setAsiento(null);
    if (!PATRON_PERIODO.test(periodo)) {
      setAvisoAsiento({
        texto: "Ingresa un periodo válido en formato AAAAMM (ej. 202606).",
        tono: "error",
      });
      return;
    }
    setGenerando(true);
    try {
      const resultado = await obtenerAsiento(periodo, tipo);
      setAsiento(resultado);
      if (resultado.lineas.length === 0) {
        setAvisoAsiento({
          texto: "El periodo no tiene movimientos para este tipo de asiento.",
          tono: "error",
        });
      }
    } catch (error) {
      setAvisoAsiento({
        texto: mensajeError(error, "No se pudo generar el asiento."),
        tono: "error",
      });
    } finally {
      setGenerando(false);
    }
  }

  async function descargarAsiento(separador: SeparadorAsiento): Promise<void> {
    setAvisoAsiento(null);
    if (!PATRON_PERIODO.test(periodo)) {
      setAvisoAsiento({
        texto: "Ingresa un periodo válido en formato AAAAMM (ej. 202606).",
        tono: "error",
      });
      return;
    }
    setDescargando(separador);
    try {
      const archivo = await obtenerAsientoArchivo(periodo, tipo, separador);
      if (!archivo.contenido) {
        setAvisoAsiento({
          texto: "El periodo no tiene movimientos para descargar.",
          tono: "error",
        });
        return;
      }
      // El backend devuelve nombre .txt; para CSV (separador coma) renombramos la extensión.
      const nombre =
        separador === "coma"
          ? archivo.nombre.replace(/\.txt$/i, ".csv")
          : archivo.nombre;
      descargarArchivo(nombre, archivo.contenido);
      setAvisoAsiento({ texto: `Archivo ${nombre} descargado.`, tono: "exito" });
    } catch (error) {
      setAvisoAsiento({
        texto: mensajeError(error, "No se pudo descargar el archivo."),
        tono: "error",
      });
    } finally {
      setDescargando(null);
    }
  }

  const muestraCentroCosto = useMemo(
    () => asiento?.lineas.some((l) => l.centroCosto !== null) ?? false,
    [asiento],
  );

  return (
    <div>
      <EncabezadoPagina
        titulo="Asientos contables"
        descripcion="Configura las cuentas por concepto y genera los asientos del periodo para exportar a tu sistema contable."
      />

      <div className="flex gap-1 border-b border-borde" role="tablist" aria-label="Secciones de contabilidad">
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

      {pestania === "cuentas" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Cuentas por concepto</span>
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-texto-sec">
              Define las cuentas de debe y haber para cada concepto. Estas cuentas se usan
              al generar los asientos del periodo. Deja en blanco los conceptos que no uses.
            </p>

            {avisoCuentas && (
              <div
                role={avisoCuentas.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoCuentas.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoCuentas.texto}</span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th>Cuenta debe</th>
                    <th>Cuenta haber</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoCuentas ? (
                    <tr>
                      <td colSpan={3} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : (
                    CONCEPTOS.map((c) => (
                      <tr key={c.id}>
                        <td className="text-tinta">{c.etiqueta}</td>
                        <td>
                          <label htmlFor={`debe-${c.id}`} className="sr-only">
                            Cuenta debe de {c.etiqueta}
                          </label>
                          <input
                            id={`debe-${c.id}`}
                            value={cuentas[c.id].cuentaDebe}
                            onChange={(e) => editarCuenta(c.id, "cuentaDebe", e.target.value)}
                            placeholder="Ej. 6911"
                            className="campo font-mono"
                          />
                        </td>
                        <td>
                          <label htmlFor={`haber-${c.id}`} className="sr-only">
                            Cuenta haber de {c.etiqueta}
                          </label>
                          <input
                            id={`haber-${c.id}`}
                            value={cuentas[c.id].cuentaHaber}
                            onChange={(e) => editarCuenta(c.id, "cuentaHaber", e.target.value)}
                            placeholder="Ej. 2911"
                            className="campo font-mono"
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void guardarCuentas()}
                disabled={cargandoCuentas || guardandoCuentas}
                className="btn btn-primario"
              >
                {guardandoCuentas ? "Guardando…" : "Guardar configuración"}
              </button>
            </div>
          </div>
        </section>
      )}

      {pestania === "asientos" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Asiento del periodo</span>
            {asiento && asiento.lineas.length > 0 && (
              <span className="text-sm text-texto-sec">
                Total:{" "}
                <span className="font-mono text-base font-semibold text-tinta">
                  {formatearSoles(asiento.totalImporte)}
                </span>
              </span>
            )}
          </div>
          <div className="space-y-4 p-5">
            <p className="text-sm text-texto-sec">
              Elige el periodo y el tipo de asiento. Previsualiza las líneas y descárgalas en
              TXT (separador pipe) o CSV (separador coma) para tu sistema contable.
            </p>

            {avisoAsiento && (
              <div
                role={avisoAsiento.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoAsiento.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoAsiento.texto}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="asiento-periodo" className="etiqueta-campo">
                  Periodo (AAAAMM)
                </label>
                <input
                  id="asiento-periodo"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="202606"
                  aria-invalid={periodoInvalido}
                  className="campo font-mono"
                />
              </div>
              <div>
                <label htmlFor="asiento-tipo" className="etiqueta-campo">
                  Tipo de asiento
                </label>
                <select
                  id="asiento-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoAsiento)}
                  className="campo"
                >
                  {TIPOS_ASIENTO.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void generarAsiento()}
                  disabled={generando}
                  className="btn btn-primario w-full"
                >
                  {generando ? "Generando…" : "Generar"}
                </button>
              </div>
            </div>

            {asiento && asiento.lineas.length > 0 && (
              <>
                <div className="flex flex-wrap items-center gap-3 border-t border-borde pt-4">
                  <span className="text-sm text-texto-sec">
                    {etiquetaConcepto(asiento.concepto)} · Debe{" "}
                    <span className="font-mono text-tinta">{asiento.cuentaDebe}</span> · Haber{" "}
                    <span className="font-mono text-tinta">{asiento.cuentaHaber}</span>
                  </span>
                  <div className="ml-auto flex gap-2">
                    <button
                      type="button"
                      onClick={() => void descargarAsiento("pipe")}
                      disabled={descargando !== null}
                      className="btn btn-contorno"
                    >
                      {descargando === "pipe" ? "Descargando…" : "Descargar TXT"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void descargarAsiento("coma")}
                      disabled={descargando !== null}
                      className="btn btn-contorno"
                    >
                      {descargando === "coma" ? "Descargando…" : "Descargar CSV"}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Cuenta debe</th>
                        <th>Cuenta haber</th>
                        <th className="num">Importe</th>
                        <th>Glosa</th>
                        {muestraCentroCosto && <th>Centro de costo</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {asiento.lineas.map((linea, indice) => (
                        <tr key={`${linea.fecha}-${indice}`}>
                          <td className="font-mono">{linea.fecha}</td>
                          <td className="font-mono">{linea.cuentaDebe}</td>
                          <td className="font-mono">{linea.cuentaHaber}</td>
                          <td className="num font-semibold text-tinta">
                            {formatearSoles(linea.importe)}
                          </td>
                          <td className="text-texto-sec">{linea.glosa}</td>
                          {muestraCentroCosto && (
                            <td className="text-texto-sec">{linea.centroCosto ?? "—"}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-texto-ter">
                  {formatearNumero(asiento.lineas.length)} línea(s) en el periodo{" "}
                  <span className="font-mono">{asiento.periodo}</span>.
                </p>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
