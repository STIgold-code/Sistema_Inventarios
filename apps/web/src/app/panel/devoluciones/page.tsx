"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { CapturaSeriesEntrada } from "@/componentes/captura-series";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { SelectorBusqueda } from "@/componentes/selector-busqueda";
import {
  ErrorApi,
  crearDevolucion,
  obtenerDevoluciones,
  obtenerOrdenesVenta,
  type CrearDevolucionLineaInput,
  type DevolucionVenta,
  type EstadoDevolucionVenta,
  type LineaOrdenVenta,
  type OrdenVenta,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

/** Cantidad a devolver y series capturadas por cada línea de la orden. */
interface BorradorLinea {
  cantidad: string;
  motivo: string;
  series: string[];
}

interface BorradorDevolucion {
  [ordenVentaLineaId: number]: BorradorLinea;
}

const INSIGNIA_ESTADO: Record<EstadoDevolucionVenta, string> = {
  REGISTRADA: "insignia insignia-exito",
  ANULADA: "insignia insignia-peligro",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function borradorLineaVacio(): BorradorLinea {
  return { cantidad: "", motivo: "", series: [] };
}

/** Una orden admite devolución si tuvo despacho: DESPACHADA o PARCIAL. */
function esDevolvible(orden: OrdenVenta): boolean {
  return orden.estado === "DESPACHADA" || orden.estado === "PARCIAL";
}

export default function PaginaDevoluciones(): React.JSX.Element {
  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionVenta[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  const [ordenId, setOrdenId] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");
  const [fecha, setFecha] = useState<string>("");
  const [borrador, setBorrador] = useState<BorradorDevolucion>({});
  const [guardando, setGuardando] = useState<boolean>(false);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [confirmarAbierto, setConfirmarAbierto] = useState<boolean>(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [respOrdenes, respDevoluciones] = await Promise.all([
          obtenerOrdenesVenta(),
          obtenerDevoluciones(),
        ]);
        setOrdenes(respOrdenes);
        setDevoluciones(respDevoluciones);
      } catch (error) {
        setAvisoLista({
          texto: mensajeError(
            error,
            "No se pudieron cargar los datos de devoluciones.",
          ),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescarDevoluciones(): Promise<void> {
    try {
      setDevoluciones(await obtenerDevoluciones());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  const ordenesDevolvibles = useMemo(
    () => ordenes.filter(esDevolvible),
    [ordenes],
  );

  const ordenSeleccionada = useMemo(
    () => ordenes.find((o) => String(o.id) === ordenId) ?? null,
    [ordenes, ordenId],
  );

  // Solo se pueden devolver líneas con cantidad despachada (tope = despachado).
  const lineasDevolvibles = useMemo<LineaOrdenVenta[]>(
    () =>
      ordenSeleccionada
        ? ordenSeleccionada.lineas.filter((l) => Number(l.cantidadDespachada) > 0)
        : [],
    [ordenSeleccionada],
  );

  function leerBorrador(lineaId: number): BorradorLinea {
    return borrador[lineaId] ?? borradorLineaVacio();
  }

  function actualizarBorrador(
    lineaId: number,
    cambios: Partial<BorradorLinea>,
  ): void {
    setBorrador((previo) => ({
      ...previo,
      [lineaId]: { ...leerBorrador(lineaId), ...cambios },
    }));
  }

  function cambiarOrden(nuevoId: string): void {
    setOrdenId(nuevoId);
    setBorrador({});
    setAvisoForm(null);
  }

  /** Líneas con cantidad > 0 a devolver, ya validadas para envío. */
  function lineasParaEnviar(): CrearDevolucionLineaInput[] | null {
    if (!ordenSeleccionada) return null;
    const seleccionadas = lineasDevolvibles
      .map((linea) => ({ linea, dato: leerBorrador(linea.id) }))
      .filter(({ dato }) => dato.cantidad.trim() !== "" && Number(dato.cantidad) > 0);

    if (seleccionadas.length === 0) {
      setAvisoForm({
        texto: "Ingresa la cantidad a devolver en al menos una línea.",
        tono: "error",
      });
      return null;
    }

    for (const { linea, dato } of seleccionadas) {
      const cantidad = Number(dato.cantidad);
      const tope = Number(linea.cantidadDespachada);
      if (cantidad > tope) {
        setAvisoForm({
          texto: `No puedes devolver más de lo despachado en ${linea.nombreSku} (despachado: ${linea.cantidadDespachada}).`,
          tono: "error",
        });
        return null;
      }
      if (linea.controlaSerie) {
        const esperadas = cantidad;
        const series = dato.series.filter((s) => s.trim() !== "");
        if (!Number.isInteger(esperadas) || series.length !== esperadas) {
          setAvisoForm({
            texto: `Ingresa ${esperadas} número(s) de serie para ${linea.nombreSku}.`,
            tono: "error",
          });
          return null;
        }
      }
    }

    return seleccionadas.map(({ linea, dato }) => ({
      ordenVentaLineaId: linea.id,
      skuId: linea.skuId,
      cantidad: dato.cantidad.trim(),
      motivo: dato.motivo.trim() || undefined,
      numerosSerie: linea.controlaSerie
        ? dato.series.filter((s) => s.trim() !== "")
        : undefined,
    }));
  }

  function manejarSolicitarConfirmacion(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setAvisoForm(null);
    if (!ordenSeleccionada) {
      setAvisoForm({ texto: "Selecciona una orden de venta.", tono: "error" });
      return;
    }
    if (lineasParaEnviar() === null) return;
    setConfirmarAbierto(true);
  }

  async function confirmarDevolucion(): Promise<void> {
    if (!ordenSeleccionada) return;
    const lineas = lineasParaEnviar();
    if (lineas === null) {
      setConfirmarAbierto(false);
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await crearDevolucion({
        ordenVentaId: ordenSeleccionada.id,
        motivo: motivo.trim() || undefined,
        fecha: fecha ? new Date(fecha).toISOString() : undefined,
        lineas,
      });
      setAvisoLista({
        texto: `Devolución ${respuesta.numero} registrada. El stock fue reingresado al inventario.`,
        tono: "exito",
      });
      setOrdenId("");
      setMotivo("");
      setFecha("");
      setBorrador({});
      setAvisoForm(null);
      await refrescarDevoluciones();
    } catch (error) {
      setAvisoForm({
        texto: mensajeError(error, "No se pudo registrar la devolución."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
      setConfirmarAbierto(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Devoluciones de venta"
        descripcion="Registra la devolución de una orden de venta despachada. Las cantidades devueltas reingresan al stock del inventario."
      />

      <div className="aviso aviso-exito mb-6" role="note">
        <span>
          <span className="font-semibold">¿Cómo funciona?</span> Selecciona una orden{" "}
          <span className="font-medium">despachada</span> (total o parcial), indica qué líneas y
          qué cantidad se devuelven. Al confirmar, el sistema crea un movimiento de entrada por
          devolución y <span className="font-medium">reingresa el stock</span> al almacén. No puedes
          devolver más de lo que se despachó por cada artículo.
        </span>
      </div>

      <div className="space-y-6">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nueva devolución</span>
          </div>
          <form onSubmit={manejarSolicitarConfirmacion} className="space-y-4 p-5">
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
                <label htmlFor="orden-devolucion" className="etiqueta-campo">
                  Orden de venta
                </label>
                <SelectorBusqueda
                  id="orden-devolucion"
                  valor={ordenId}
                  onCambio={(v) => cambiarOrden(v)}
                  disabled={cargandoBase}
                  placeholder={
                    cargandoBase ? "Cargando…" : "Selecciona una orden despachada…"
                  }
                  opciones={ordenesDevolvibles.map((orden) => ({
                    valor: String(orden.id),
                    etiqueta: `${orden.numero} — ${orden.cliente ?? "Sin cliente"} (${orden.estado})`,
                  }))}
                />
                {!cargandoBase && ordenesDevolvibles.length === 0 && (
                  <p className="mt-1.5 text-xs text-texto-ter">
                    No hay órdenes despachadas para devolver.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="fecha-devolucion" className="etiqueta-campo">
                  Fecha <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="fecha-devolucion"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="campo sm:max-w-xs"
                />
              </div>
            </div>

            <div>
              <label htmlFor="motivo-devolucion" className="etiqueta-campo">
                Motivo <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id="motivo-devolucion"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Producto fallado"
                className="campo"
              />
            </div>

            {ordenSeleccionada && (
              <div className="space-y-3">
                <span className="text-sm font-medium text-texto">Líneas a devolver</span>
                {lineasDevolvibles.length === 0 ? (
                  <p className="text-sm text-texto-ter">
                    Esta orden no tiene cantidades despachadas para devolver.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Despachado</th>
                          <th>Cantidad a devolver</th>
                          <th>Motivo (línea)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineasDevolvibles.map((linea) => {
                          const dato = leerBorrador(linea.id);
                          const cantidad = Number(dato.cantidad);
                          const mostrarSeries =
                            linea.controlaSerie &&
                            Number.isInteger(cantidad) &&
                            cantidad > 0;
                          return (
                            <Fragment key={linea.id}>
                              <tr>
                                <td>
                                  <span className="font-mono text-xs text-texto-sec">
                                    {linea.codigoSku}
                                  </span>{" "}
                                  <span className="text-texto">{linea.nombreSku}</span>
                                  {linea.controlaSerie && (
                                    <span className="insignia insignia-info ml-2">Serie</span>
                                  )}
                                </td>
                                <td className="num font-semibold text-tinta">
                                  {linea.cantidadDespachada}
                                </td>
                                <td>
                                  <input
                                    value={dato.cantidad}
                                    onChange={(e) =>
                                      actualizarBorrador(linea.id, {
                                        cantidad: e.target.value,
                                      })
                                    }
                                    inputMode="decimal"
                                    aria-label={`Cantidad a devolver de ${linea.nombreSku}`}
                                    className="campo w-28 font-mono"
                                  />
                                </td>
                                <td>
                                  <input
                                    value={dato.motivo}
                                    onChange={(e) =>
                                      actualizarBorrador(linea.id, {
                                        motivo: e.target.value,
                                      })
                                    }
                                    aria-label={`Motivo de la línea ${linea.nombreSku}`}
                                    className="campo"
                                  />
                                </td>
                              </tr>
                              {mostrarSeries && (
                                <tr>
                                  <td colSpan={4} className="bg-panel-alt">
                                    <CapturaSeriesEntrada
                                      cantidad={cantidad}
                                      valor={dato.series}
                                      onCambiar={(series) =>
                                        actualizarBorrador(linea.id, { series })
                                      }
                                      idBase={`devolucion-${linea.id}`}
                                    />
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={guardando || !ordenSeleccionada}
                className="btn btn-primario"
              >
                {guardando ? "Registrando…" : "Registrar devolución"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Devoluciones registradas</span>
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
            ) : devoluciones.length === 0 ? (
              <p className="text-sm text-texto-ter">Sin devoluciones registradas.</p>
            ) : (
              devoluciones.map((dev) => (
                <article key={dev.id} className="rounded-md border border-borde p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-tinta">{dev.numero}</p>
                      <p className="text-xs text-texto-sec">
                        Orden {dev.ordenVentaNumero} ·{" "}
                        {new Date(dev.fecha).toLocaleDateString("es-PE")}
                        {dev.motivo ? ` · ${dev.motivo}` : ""}
                      </p>
                    </div>
                    <span className={INSIGNIA_ESTADO[dev.estado]}>{dev.estado}</span>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Cantidad</th>
                          <th>Costo unit.</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dev.lineas.map((linea) => (
                          <tr key={linea.id}>
                            <td className="font-mono text-xs text-texto-sec">{linea.skuId}</td>
                            <td className="num">{linea.cantidad}</td>
                            <td className="num">{linea.costoUnitario}</td>
                            <td className="text-texto-sec">{linea.motivo ?? "—"}</td>
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

      <ModalConfirmacion
        abierto={confirmarAbierto}
        titulo="Confirmar devolución"
        mensaje="Al confirmar, las cantidades indicadas reingresarán al stock del inventario mediante un movimiento de entrada por devolución. Esta operación no puede deshacerse desde esta pantalla."
        textoConfirmar="Registrar devolución"
        textoCancelar="Cancelar"
        procesando={guardando}
        onConfirmar={() => void confirmarDevolucion()}
        onCancelar={() => setConfirmarAbierto(false)}
      />
    </div>
  );
}
