"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { SelectorSeriesSalida } from "@/componentes/captura-series";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { SelectorSku } from "@/componentes/selector-sku";
import { SelectorUnidadLinea } from "@/componentes/selector-unidad-linea";
import {
  ErrorApi,
  anularVale,
  autorizarVale,
  crearVale,
  despacharVale,
  obtenerAlmacenes,
  obtenerCentrosCosto,
  obtenerOrdenesTrabajo,
  obtenerVales,
  type Almacen,
  type CentroCosto,
  type EstadoValeSalida,
  type OrdenTrabajo,
  type SeriesPorSku,
  type Sku,
  type ValeSalida,
} from "@/lib/api";
import { formatearNumero } from "@/lib/formato";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  observacion: string;
  enUnidadReferencia: boolean;
}

type TipoAccion = "autorizar" | "despachar" | "anular";

interface AccionPendiente {
  id: number;
  numero: string;
  tipo: TipoAccion;
}

const INSIGNIA_ESTADO: Record<EstadoValeSalida, string> = {
  BORRADOR: "insignia insignia-neutra",
  AUTORIZADO: "insignia insignia-info",
  DESPACHADO: "insignia insignia-exito",
  ANULADO: "insignia insignia-peligro",
};

const ETIQUETA_ESTADO: Record<EstadoValeSalida, string> = {
  BORRADOR: "Borrador",
  AUTORIZADO: "Autorizado",
  DESPACHADO: "Despachado",
  ANULADO: "Anulado",
};

const TITULO_ACCION: Record<TipoAccion, string> = {
  autorizar: "Autorizar vale",
  despachar: "Despachar vale",
  anular: "Anular vale",
};

const TEXTO_CONFIRMAR: Record<TipoAccion, string> = {
  autorizar: "Autorizar",
  despachar: "Despachar",
  anular: "Anular",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "", observacion: "", enUnidadReferencia: false };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function mensajeAccion(accion: AccionPendiente): string {
  switch (accion.tipo) {
    case "autorizar":
      return `¿Autorizar el vale ${accion.numero}? Quedará listo para su despacho.`;
    case "despachar":
      return `¿Despachar el vale ${accion.numero}? Esta acción descuenta el stock real del almacén y no se puede revertir.`;
    case "anular":
      return `¿Anular el vale ${accion.numero}? Esta acción no se puede revertir.`;
  }
}

export default function PaginaVales(): React.JSX.Element {
  const [vales, setVales] = useState<ValeSalida[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  const [almacenId, setAlmacenId] = useState<string>("");
  const [centroCostoId, setCentroCostoId] = useState<string>("");
  const [ordenTrabajoId, setOrdenTrabajoId] = useState<string>("");
  const [destino, setDestino] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [accion, setAccion] = useState<AccionPendiente | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState<boolean>(false);

  // Despacho con captura de series (solo vales con SKUs serializados).
  const [valeSeries, setValeSeries] = useState<ValeSalida | null>(null);
  const [seriesPorLinea, setSeriesPorLinea] = useState<Record<number, string[]>>({});
  const [despachandoSeries, setDespachandoSeries] = useState<boolean>(false);
  const [avisoSeries, setAvisoSeries] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [vls, alms, centros, ots] = await Promise.all([
          obtenerVales(),
          obtenerAlmacenes(),
          obtenerCentrosCosto(),
          obtenerOrdenesTrabajo(),
        ]);
        setVales(vls);
        setAlmacenes(alms);
        setCentrosCosto(centros.filter((c) => c.activo));
        setOrdenesTrabajo(ots.filter((o) => o.estado === "ABIERTA"));
      } catch (error) {
        setAvisoLista({
          texto: mensajeError(error, "No se pudieron cargar los vales."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescar(): Promise<void> {
    try {
      setVales(await obtenerVales());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  function actualizarLinea(indice: number, cambios: Partial<LineaBorrador>): void {
    setLineas((previas) =>
      previas.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)),
    );
  }

  // Al cambiar el SKU, si el nuevo no tiene unidad de referencia se vuelve a la
  // unidad de control para no arrastrar un flag invalido entre productos.
  function cambiarSkuLinea(indice: number, sku: Sku | null): void {
    const tieneReferencia = Boolean(sku?.unidadReferencia && sku.factorConversion);
    actualizarLinea(
      indice,
      tieneReferencia ? { sku } : { sku, enUnidadReferencia: false },
    );
  }

  function agregarLinea(): void {
    setLineas((previas) => [...previas, lineaVacia()]);
  }

  function quitarLinea(indice: number): void {
    setLineas((previas) =>
      previas.length === 1 ? previas : previas.filter((_, i) => i !== indice),
    );
  }

  async function manejarCreacion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    if (!almacenId) {
      setAvisoForm({ texto: "Selecciona un almacén de origen.", tono: "error" });
      return;
    }
    if (!centroCostoId) {
      setAvisoForm({ texto: "Selecciona un centro de costo.", tono: "error" });
      return;
    }
    if (!destino.trim()) {
      setAvisoForm({ texto: "Indica el destino del vale.", tono: "error" });
      return;
    }
    const conDatos = lineas.filter((l) => l.cantidad.trim() && Number(l.cantidad) > 0);
    if (conDatos.length === 0) {
      setAvisoForm({
        texto: "Agrega al menos una línea con SKU y cantidad.",
        tono: "error",
      });
      return;
    }
    const validas = conDatos.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null,
    );
    if (validas.length !== conDatos.length) {
      setAvisoForm({ texto: "Selecciona un producto en cada línea.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await crearVale({
        almacenId: Number(almacenId),
        centroCostoId: Number(centroCostoId),
        destino: destino.trim(),
        ordenTrabajoId: ordenTrabajoId ? Number(ordenTrabajoId) : undefined,
        observaciones: observaciones.trim() || undefined,
        lineas: validas.map((l) => ({
          skuId: l.sku.id,
          cantidad: l.cantidad,
          observacion: l.observacion.trim() || undefined,
          enUnidadReferencia: l.enUnidadReferencia || undefined,
        })),
      });
      setAvisoForm({
        texto: `Vale creado (#${respuesta.id}) en estado Borrador.`,
        tono: "exito",
      });
      setAlmacenId("");
      setCentroCostoId("");
      setOrdenTrabajoId("");
      setDestino("");
      setObservaciones("");
      setLineas([lineaVacia()]);
      await refrescar();
    } catch (error) {
      setAvisoForm({
        texto: mensajeError(error, "No se pudo crear el vale."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarAccion(): Promise<void> {
    if (!accion) return;
    setProcesandoAccion(true);
    setAvisoLista(null);
    try {
      if (accion.tipo === "autorizar") {
        await autorizarVale(accion.id);
        setAvisoLista({ texto: `Vale ${accion.numero} autorizado.`, tono: "exito" });
      } else if (accion.tipo === "despachar") {
        await despacharVale(accion.id);
        setAvisoLista({
          texto: `Vale ${accion.numero} despachado. Se descontó el stock del almacén.`,
          tono: "exito",
        });
      } else {
        await anularVale(accion.id);
        setAvisoLista({ texto: `Vale ${accion.numero} anulado.`, tono: "exito" });
      }
      setAccion(null);
      await refrescar();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo actualizar el vale."),
        tono: "error",
      });
    } finally {
      setProcesandoAccion(false);
    }
  }

  // Inicia el despacho de un vale. Si tiene lineas serializadas abre la captura
  // de series; si no, usa el modal de confirmacion estandar.
  function iniciarDespacho(vale: ValeSalida): void {
    const tieneSeries = vale.lineas.some(
      (l) => l.controlaSerie && Number(l.cantidad) - Number(l.cantidadDespachada) > 0,
    );
    if (tieneSeries) {
      setSeriesPorLinea({});
      setAvisoSeries(null);
      setValeSeries(vale);
      return;
    }
    setAccion({ id: vale.id, numero: vale.numero, tipo: "despachar" });
  }

  async function confirmarDespachoSeries(): Promise<void> {
    if (!valeSeries) return;
    setAvisoSeries(null);
    // Agrupa las series por SKU. Cada linea serializada debe tener exactamente
    // la cantidad pendiente de numeros de serie seleccionados.
    const acumulado = new Map<number, string[]>();
    for (const linea of valeSeries.lineas) {
      if (!linea.controlaSerie) continue;
      const pendiente = Number(linea.cantidad) - Number(linea.cantidadDespachada);
      if (pendiente <= 0) continue;
      const series = seriesPorLinea[linea.id] ?? [];
      if (series.length !== pendiente) {
        setAvisoSeries({
          texto: `Selecciona ${pendiente} número(s) de serie para ${linea.nombreSku}.`,
          tono: "error",
        });
        return;
      }
      const previas = acumulado.get(linea.skuId) ?? [];
      acumulado.set(linea.skuId, [...previas, ...series]);
    }
    const series: SeriesPorSku[] = Array.from(acumulado.entries()).map(
      ([skuId, numerosSerie]) => ({ skuId, numerosSerie }),
    );
    setDespachandoSeries(true);
    setAvisoLista(null);
    try {
      await despacharVale(valeSeries.id, series);
      setAvisoLista({
        texto: `Vale ${valeSeries.numero} despachado. Se descontó el stock del almacén.`,
        tono: "exito",
      });
      setValeSeries(null);
      await refrescar();
    } catch (error) {
      setAvisoSeries({
        texto: mensajeError(error, "No se pudo despachar el vale."),
        tono: "error",
      });
    } finally {
      setDespachandoSeries(false);
    }
  }

  // La OT pertenece a un centro de costo; al filtrar evitamos imputar el vale a
  // una OT de otro centro. Si no hay centro elegido aun, no se ofrece ninguna.
  const ordenesDisponibles = centroCostoId
    ? ordenesTrabajo.filter((o) => String(o.centroCostoId) === centroCostoId)
    : [];

  function cambiarCentroCosto(valor: string): void {
    setCentroCostoId(valor);
    // Si la OT seleccionada ya no pertenece al nuevo centro, se limpia.
    if (
      ordenTrabajoId &&
      !ordenesTrabajo.some(
        (o) => String(o.id) === ordenTrabajoId && String(o.centroCostoId) === valor,
      )
    ) {
      setOrdenTrabajoId("");
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Vales de salida"
        descripcion="Registra y autoriza hojas de cargo para entregar materiales del almacén a un centro de costo."
      />

      <div className="space-y-6">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nuevo vale de salida</span>
          </div>
          <form onSubmit={manejarCreacion} className="space-y-4 p-5">
            {avisoForm && (
              <div
                role={avisoForm.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoForm.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoForm.texto}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="vale-almacen" className="etiqueta-campo">
                  Almacén de origen
                </label>
                <select
                  id="vale-almacen"
                  value={almacenId}
                  onChange={(e) => setAlmacenId(e.target.value)}
                  disabled={cargandoBase}
                  required
                  className="campo"
                >
                  <option value="">{cargandoBase ? "Cargando…" : "Selecciona…"}</option>
                  {almacenes.map((almacen) => (
                    <option key={almacen.id} value={almacen.id}>
                      {almacen.codigo} — {almacen.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="vale-centro-costo" className="etiqueta-campo">
                  Centro de costo
                </label>
                <select
                  id="vale-centro-costo"
                  value={centroCostoId}
                  onChange={(e) => cambiarCentroCosto(e.target.value)}
                  disabled={cargandoBase}
                  required
                  className="campo"
                >
                  <option value="">{cargandoBase ? "Cargando…" : "Selecciona…"}</option>
                  {centrosCosto.map((centro) => (
                    <option key={centro.id} value={centro.id}>
                      {centro.codigo} — {centro.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="vale-orden-trabajo" className="etiqueta-campo">
                  Orden de trabajo <span className="text-texto-ter">(opcional)</span>
                </label>
                <select
                  id="vale-orden-trabajo"
                  value={ordenTrabajoId}
                  onChange={(e) => setOrdenTrabajoId(e.target.value)}
                  disabled={cargandoBase || !centroCostoId}
                  className="campo"
                >
                  <option value="">
                    {!centroCostoId
                      ? "Selecciona primero un centro de costo"
                      : ordenesDisponibles.length === 0
                        ? "Sin órdenes abiertas para este centro"
                        : "Sin orden de trabajo"}
                  </option>
                  {ordenesDisponibles.map((ot) => (
                    <option key={ot.id} value={ot.id}>
                      {ot.numero} — {ot.descripcion}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="vale-destino" className="etiqueta-campo">
                  Destino
                </label>
                <input
                  id="vale-destino"
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  required
                  placeholder="Área, obra o proyecto"
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="vale-observaciones" className="etiqueta-campo">
                  Observaciones <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="vale-observaciones"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="campo"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-texto">Líneas</span>
                <button type="button" onClick={agregarLinea} className="btn btn-contorno">
                  Agregar línea
                </button>
              </div>

              {lineas.map((linea, indice) => (
                <div
                  key={indice}
                  className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto_1fr_auto]"
                >
                  <div>
                    <label htmlFor={`vale-sku-${indice}`} className="etiqueta-campo">
                      SKU
                    </label>
                    <SelectorSku
                      valor={linea.sku}
                      onSeleccionar={(sku) => cambiarSkuLinea(indice, sku)}
                      placeholder="Busca por código o nombre…"
                    />
                  </div>
                  <div>
                    <label htmlFor={`vale-cantidad-${indice}`} className="etiqueta-campo">
                      Cantidad
                    </label>
                    <input
                      id={`vale-cantidad-${indice}`}
                      value={linea.cantidad}
                      onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                      inputMode="decimal"
                      className="campo w-28 font-mono"
                    />
                  </div>
                  <SelectorUnidadLinea
                    sku={linea.sku}
                    enUnidadReferencia={linea.enUnidadReferencia}
                    onCambiar={(v) =>
                      actualizarLinea(indice, { enUnidadReferencia: v })
                    }
                    cantidad={linea.cantidad}
                    id={`vale-unidad-${indice}`}
                  />
                  <div>
                    <label htmlFor={`vale-obs-${indice}`} className="etiqueta-campo">
                      Observación <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id={`vale-obs-${indice}`}
                      value={linea.observacion}
                      onChange={(e) =>
                        actualizarLinea(indice, { observacion: e.target.value })
                      }
                      className="campo"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => quitarLinea(indice)}
                      disabled={lineas.length === 1}
                      className="btn btn-contorno"
                      aria-label={`Quitar línea ${indice + 1}`}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-borde pt-4">
              <button type="submit" disabled={guardando} className="btn btn-primario">
                {guardando ? "Creando…" : "Crear vale"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Vales registrados</span>
          </div>
          <div className="space-y-4 p-5">
            {avisoLista && (
              <div
                role={avisoLista.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoLista.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoLista.texto}</span>
              </div>
            )}
            {cargandoBase ? (
              <p className="text-sm text-texto-ter">Cargando…</p>
            ) : vales.length === 0 ? (
              <p className="text-sm text-texto-ter">Sin vales registrados.</p>
            ) : (
              vales.map((vale) => (
                <article key={vale.id} className="rounded-md border border-borde p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-tinta">
                        {vale.numero}
                      </p>
                      <p className="text-xs text-texto-sec">
                        {vale.centroCosto} · {vale.destino} · {vale.solicitante}
                      </p>
                      {vale.ordenTrabajo && (
                        <p className="text-xs text-texto-ter">
                          Orden de trabajo: {vale.ordenTrabajo}
                        </p>
                      )}
                      {vale.autorizadoPor && (
                        <p className="text-xs text-texto-ter">
                          Autorizado por {vale.autorizadoPor}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={INSIGNIA_ESTADO[vale.estado]}>
                        {ETIQUETA_ESTADO[vale.estado]}
                      </span>
                      <Link
                        href={`/panel/vales/${vale.id}/imprimir`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-contorno h-9"
                      >
                        Imprimir
                      </Link>
                      {vale.estado === "BORRADOR" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setAccion({ id: vale.id, numero: vale.numero, tipo: "autorizar" })
                            }
                            className="btn btn-primario h-9"
                          >
                            Autorizar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAccion({ id: vale.id, numero: vale.numero, tipo: "anular" })
                            }
                            className="btn btn-peligro h-9"
                          >
                            Anular
                          </button>
                        </div>
                      )}
                      {vale.estado === "AUTORIZADO" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => iniciarDespacho(vale)}
                            className="btn btn-primario h-9"
                          >
                            Despachar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAccion({ id: vale.id, numero: vale.numero, tipo: "anular" })
                            }
                            className="btn btn-peligro h-9"
                          >
                            Anular
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-texto-sec">Almacén: {vale.almacen}</p>
                  {vale.observaciones && (
                    <p className="mt-1 text-xs text-texto-sec">{vale.observaciones}</p>
                  )}
                  <div className="mt-3 overflow-x-auto">
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Cantidad</th>
                          <th>Despachada</th>
                          <th>Observación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vale.lineas.map((linea) => (
                          <tr key={linea.id}>
                            <td>
                              <span className="font-mono text-xs text-texto-sec">
                                {linea.codigoSku}
                              </span>{" "}
                              <span className="text-texto">{linea.nombreSku}</span>
                              {linea.controlaSerie && (
                                <span className="insignia insignia-info ml-2">Serie</span>
                              )}
                            </td>
                            <td className="num">{formatearNumero(linea.cantidad)}</td>
                            <td className="num">
                              {formatearNumero(linea.cantidadDespachada)}
                            </td>
                            <td className="text-texto-sec">{linea.observacion ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      {valeSeries && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-series-titulo"
        >
          <div
            className="fixed inset-0 bg-black/40"
            onClick={() => !despachandoSeries && setValeSeries(null)}
            aria-hidden
          />
          <div className="panel relative z-10 w-full max-w-lg">
            <div className="panel-cabecera">
              <span id="modal-series-titulo" className="panel-titulo">
                Despachar vale {valeSeries.numero}
              </span>
            </div>
            <div className="space-y-4 p-5">
              {avisoSeries && (
                <div
                  role={avisoSeries.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoSeries.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoSeries.texto}</span>
                </div>
              )}
              <p className="text-sm text-texto-sec">
                Este vale incluye artículos que controlan número de serie.
                Selecciona los números a despachar. Al confirmar se descuenta el
                stock real del almacén y no se puede revertir.
              </p>
              {valeSeries.lineas
                .filter(
                  (l) =>
                    l.controlaSerie &&
                    Number(l.cantidad) - Number(l.cantidadDespachada) > 0,
                )
                .map((linea) => {
                  const pendiente =
                    Number(linea.cantidad) - Number(linea.cantidadDespachada);
                  return (
                    <div
                      key={linea.id}
                      className="rounded-md border border-borde p-3"
                    >
                      <p className="mb-2 text-sm">
                        <span className="font-mono text-xs text-texto-sec">
                          {linea.codigoSku}
                        </span>{" "}
                        <span className="text-tinta">{linea.nombreSku}</span>
                      </p>
                      <SelectorSeriesSalida
                        skuId={linea.skuId}
                        almacenId={valeSeries.almacenId}
                        cantidad={pendiente}
                        valor={seriesPorLinea[linea.id] ?? []}
                        onCambiar={(s) =>
                          setSeriesPorLinea((previo) => ({
                            ...previo,
                            [linea.id]: s,
                          }))
                        }
                      />
                    </div>
                  );
                })}
              <div className="flex justify-end gap-3 border-t border-borde pt-4">
                <button
                  type="button"
                  onClick={() => !despachandoSeries && setValeSeries(null)}
                  disabled={despachandoSeries}
                  className="btn btn-contorno"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarDespachoSeries()}
                  disabled={despachandoSeries}
                  className="btn btn-primario"
                >
                  {despachandoSeries ? "Despachando…" : "Despachar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ModalConfirmacion
        abierto={accion !== null}
        titulo={accion ? TITULO_ACCION[accion.tipo] : ""}
        mensaje={accion ? mensajeAccion(accion) : ""}
        textoConfirmar={accion ? TEXTO_CONFIRMAR[accion.tipo] : "Confirmar"}
        tono={accion?.tipo === "anular" ? "peligro" : "primario"}
        procesando={procesandoAccion}
        onConfirmar={() => void confirmarAccion()}
        onCancelar={() => !procesandoAccion && setAccion(null)}
      />
    </div>
  );
}
