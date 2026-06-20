"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  descargarArchivo,
  ErrorApi,
  clasificarAbc,
  obtenerAbc,
  obtenerReposicion,
  type ClasificacionAbc,
  type ReporteAbc,
  type ReporteReposicion,
} from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";

type Pestania = "reposicion" | "abc";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "reposicion", etiqueta: "Reposición" },
  { id: "abc", etiqueta: "Clasificación ABC" },
];

const INSIGNIA_ABC: Record<ClasificacionAbc, string> = {
  A: "insignia insignia-exito",
  B: "insignia insignia-oro",
  C: "insignia insignia-neutra",
};

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

export default function PaginaReposicion(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("reposicion");

  // ── Reposicion ──────────────────────────────────────────────────────────
  const [reposicion, setReposicion] = useState<ReporteReposicion | null>(null);
  const [cargandoRepo, setCargandoRepo] = useState<boolean>(true);
  const [avisoRepo, setAvisoRepo] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setReposicion(await obtenerReposicion());
      } catch (error) {
        setAvisoRepo({
          texto: mensajeError(
            error,
            "No se pudo cargar el reporte de reposición.",
          ),
          tono: "error",
        });
      } finally {
        setCargandoRepo(false);
      }
    })();
  }, []);

  // ── ABC ─────────────────────────────────────────────────────────────────
  const hoy = new Date();
  const [abcDesde, setAbcDesde] = useState<string>(
    fechaISO(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1)),
  );
  const [abcHasta, setAbcHasta] = useState<string>(fechaISO(hoy));
  const [abc, setAbc] = useState<ReporteAbc | null>(null);
  const [cargandoAbc, setCargandoAbc] = useState<boolean>(false);
  const [avisoAbc, setAvisoAbc] = useState<Aviso | null>(null);
  const [persistiendo, setPersistiendo] = useState<boolean>(false);
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);

  function rangoInvalido(): boolean {
    if (!abcDesde || !abcHasta) {
      setAvisoAbc({ texto: "Selecciona un rango de fechas.", tono: "error" });
      return true;
    }
    if (abcHasta < abcDesde) {
      setAvisoAbc({
        texto: "La fecha final no puede ser anterior a la inicial.",
        tono: "error",
      });
      return true;
    }
    return false;
  }

  async function generarAbc(): Promise<void> {
    setAvisoAbc(null);
    if (rangoInvalido()) return;
    setCargandoAbc(true);
    try {
      setAbc(await obtenerAbc(abcDesde, abcHasta));
    } catch (error) {
      setAbc(null);
      setAvisoAbc({
        texto: mensajeError(error, "No se pudo generar la clasificación ABC."),
        tono: "error",
      });
    } finally {
      setCargandoAbc(false);
    }
  }

  async function persistirAbc(): Promise<void> {
    setModalAbierto(false);
    setAvisoAbc(null);
    if (rangoInvalido()) return;
    setPersistiendo(true);
    try {
      const respuesta = await clasificarAbc({
        desde: abcDesde,
        hasta: abcHasta,
        persistir: true,
      });
      setAbc(respuesta);
      setAvisoAbc({
        texto: `Clasificación guardada en ${formatearNumero(respuesta.persistidos)} SKU(s).`,
        tono: "exito",
      });
    } catch (error) {
      setAvisoAbc({
        texto: mensajeError(error, "No se pudo guardar la clasificación ABC."),
        tono: "error",
      });
    } finally {
      setPersistiendo(false);
    }
  }

  const [exportandoRepo, setExportandoRepo] = useState<boolean>(false);
  const [exportandoAbc, setExportandoAbc] = useState<boolean>(false);

  async function exportarReposicion(): Promise<void> {
    setExportandoRepo(true);
    setAvisoRepo(null);
    try {
      await descargarArchivo(
        "/reportes/reposicion/export.xlsx",
        "reposicion.xlsx",
      );
    } catch (error) {
      setAvisoRepo({
        texto: mensajeError(error, "No se pudo exportar el reporte."),
        tono: "error",
      });
    } finally {
      setExportandoRepo(false);
    }
  }

  async function exportarAbc(): Promise<void> {
    setAvisoAbc(null);
    if (rangoInvalido()) return;
    setExportandoAbc(true);
    try {
      const query = new URLSearchParams({ desde: abcDesde, hasta: abcHasta });
      await descargarArchivo(
        `/reportes/abc/export.xlsx?${query.toString()}`,
        "clasificacion_abc.xlsx",
      );
    } catch (error) {
      setAvisoAbc({
        texto: mensajeError(error, "No se pudo exportar la clasificación ABC."),
        tono: "error",
      });
    } finally {
      setExportandoAbc(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Reposición y ABC"
        descripcion="Qué reponer según los niveles de stock y clasificación ABC por valor de consumo."
      />

      <div
        className="flex gap-1 border-b border-borde"
        role="tablist"
        aria-label="Secciones de reposición"
      >
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

      {pestania === "reposicion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              Qué reponer
              {reposicion && (
                <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
                  ({formatearNumero(reposicion.total)} SKUs)
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={() => void exportarReposicion()}
              disabled={exportandoRepo || cargandoRepo}
              className="btn btn-contorno"
            >
              {exportandoRepo ? "Exportando…" : "Exportar a Excel"}
            </button>
          </div>

          {avisoRepo && (
            <div role="alert" className="aviso aviso-peligro m-5">
              <span>{avisoRepo.texto}</span>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th className="num">Disponible</th>
                  <th className="num">Mínimo</th>
                  <th className="num">Punto rep.</th>
                  <th className="num">Máximo</th>
                  <th className="num">Sugerido pedir</th>
                </tr>
              </thead>
              <tbody>
                {cargandoRepo ? (
                  <tr>
                    <td colSpan={8} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : !reposicion || reposicion.filas.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-texto-ter">
                      No hay productos por reponer.
                    </td>
                  </tr>
                ) : (
                  reposicion.filas.map((fila) => (
                    <tr key={fila.skuId}>
                      <td className="font-mono">{fila.codigoParlante}</td>
                      <td className="text-tinta">{fila.producto}</td>
                      <td className="text-texto-sec">{fila.unidad}</td>
                      <td className="num font-semibold text-peligro">
                        {formatearNumero(fila.disponible)}
                      </td>
                      <td className="num text-texto-sec">
                        {fila.stockMinimo !== null
                          ? formatearNumero(fila.stockMinimo)
                          : "—"}
                      </td>
                      <td className="num text-texto-sec">
                        {fila.puntoReposicion !== null
                          ? formatearNumero(fila.puntoReposicion)
                          : "—"}
                      </td>
                      <td className="num text-texto-sec">
                        {fila.stockMaximo !== null
                          ? formatearNumero(fila.stockMaximo)
                          : "—"}
                      </td>
                      <td className="num font-semibold text-tinta">
                        {fila.sugeridoPedir !== null
                          ? formatearNumero(fila.sugeridoPedir)
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="border-t border-borde px-5 py-3 text-xs text-texto-ter">
            Se listan los SKUs cuyo disponible está en o por debajo del punto de
            reposición (o del stock mínimo si no hay punto). La cantidad sugerida
            lleva el stock al máximo; requiere tener stock máximo definido.
          </p>
        </section>
      )}

      {pestania === "abc" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Clasificación ABC</span>
            {abc && (
              <span className="text-sm text-texto-sec">
                Valor total consumido:{" "}
                <span className="font-mono text-base font-semibold text-tinta">
                  {formatearSoles(abc.valorTotal)}
                </span>
              </span>
            )}
          </div>

          <div className="space-y-4 p-5">
            <p className="text-sm text-texto-sec">
              Clasifica los productos por su valor de consumo (salidas
              valorizadas al costo FIFO) en el rango. A = 80% del valor, B = 15%,
              C = 5% (por participación acumulada). La vista previa no guarda
              nada; usa &quot;Guardar clasificación&quot; para persistirla en
              cada SKU.
            </p>

            {avisoAbc && (
              <div
                role={avisoAbc.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoAbc.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoAbc.texto}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="abc-desde" className="etiqueta-campo">
                  Desde
                </label>
                <input
                  id="abc-desde"
                  type="date"
                  value={abcDesde}
                  onChange={(e) => setAbcDesde(e.target.value)}
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="abc-hasta" className="etiqueta-campo">
                  Hasta
                </label>
                <input
                  id="abc-hasta"
                  type="date"
                  value={abcHasta}
                  onChange={(e) => setAbcHasta(e.target.value)}
                  className="campo"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void generarAbc()}
                  disabled={cargandoAbc || persistiendo}
                  className="btn btn-contorno w-full"
                >
                  {cargandoAbc ? "Generando…" : "Vista previa"}
                </button>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setAvisoAbc(null);
                    if (!rangoInvalido()) setModalAbierto(true);
                  }}
                  disabled={cargandoAbc || persistiendo}
                  className="btn btn-primario w-full"
                >
                  {persistiendo ? "Guardando…" : "Guardar clasificación"}
                </button>
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void exportarAbc()}
                  disabled={cargandoAbc || persistiendo || exportandoAbc}
                  className="btn btn-contorno w-full"
                >
                  {exportandoAbc ? "Exportando…" : "Exportar a Excel"}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th className="num">Cant. consumo</th>
                    <th className="num">Valor consumo</th>
                    <th className="num">Particip.</th>
                    <th className="num">% acum.</th>
                    <th>Clase</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoAbc ? (
                    <tr>
                      <td colSpan={7} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : !abc ? (
                    <tr>
                      <td colSpan={7} className="text-texto-ter">
                        Selecciona un rango y genera la vista previa.
                      </td>
                    </tr>
                  ) : abc.filas.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-texto-ter">
                        No hay consumo registrado en el rango seleccionado.
                      </td>
                    </tr>
                  ) : (
                    abc.filas.map((fila) => (
                      <tr key={fila.skuId}>
                        <td className="font-mono">{fila.codigoParlante}</td>
                        <td className="text-tinta">{fila.producto}</td>
                        <td className="num text-texto-sec">
                          {formatearNumero(fila.cantidadConsumo)}
                        </td>
                        <td className="num font-semibold text-tinta">
                          {formatearSoles(fila.valorConsumo)}
                        </td>
                        <td className="num text-texto-sec">
                          {fila.participacion}%
                        </td>
                        <td className="num text-texto-sec">
                          {fila.participacionAcumulada}%
                        </td>
                        <td>
                          <span className={INSIGNIA_ABC[fila.clasificacion]}>
                            {fila.clasificacion}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <ModalConfirmacion
        abierto={modalAbierto}
        titulo="Guardar clasificación ABC"
        mensaje="Se sobrescribirá la clasificación ABC de todos los SKUs con consumo en el rango seleccionado. ¿Deseas continuar?"
        textoConfirmar="Guardar"
        onConfirmar={() => void persistirAbc()}
        onCancelar={() => setModalAbierto(false)}
      />
    </div>
  );
}
