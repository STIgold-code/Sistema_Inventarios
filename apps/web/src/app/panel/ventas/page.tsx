"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  anularOrdenVenta,
  crearDespacho,
  crearOrdenVenta,
  obtenerOrdenesVenta,
  type EstadoOrdenVenta,
  type OrdenVenta,
  type Sku,
} from "@/lib/api";
import { formatearSoles } from "@/lib/formato";

const ALMACEN_PRINCIPAL = 1;

type Pestania = "ordenes" | "despacho";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  precioUnitario: string;
}

interface DespachoBorrador {
  [ordenVentaLineaId: number]: string;
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "ordenes", etiqueta: "Órdenes de venta" },
  { id: "despacho", etiqueta: "Despacho" },
];

const INSIGNIA_ESTADO: Record<EstadoOrdenVenta, string> = {
  PENDIENTE: "insignia insignia-neutra",
  PARCIAL: "insignia insignia-oro",
  DESPACHADA: "insignia insignia-exito",
  ANULADA: "insignia insignia-peligro",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "", precioUnitario: "" };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function esAnulable(estado: EstadoOrdenVenta): boolean {
  return estado === "PENDIENTE" || estado === "PARCIAL";
}

export default function PaginaVentas(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("ordenes");

  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Órdenes de venta
  const [numeroOrden, setNumeroOrden] = useState<string>("");
  const [cliente, setCliente] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [guardandoOrden, setGuardandoOrden] = useState<boolean>(false);
  const [avisoOrden, setAvisoOrden] = useState<Aviso | null>(null);
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);

  // Despacho
  const [ordenDespacho, setOrdenDespacho] = useState<string>("");
  const [tipoDocumento, setTipoDocumento] = useState<string>("");
  const [serie, setSerie] = useState<string>("");
  const [numeroComprobante, setNumeroComprobante] = useState<string>("");
  const [despachados, setDespachados] = useState<DespachoBorrador>({});
  const [guardandoDespacho, setGuardandoDespacho] = useState<boolean>(false);
  const [avisoDespacho, setAvisoDespacho] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setOrdenes(await obtenerOrdenesVenta());
      } catch (error) {
        setAvisoOrden({
          texto: mensajeError(error, "No se pudieron cargar los datos de ventas."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescarOrdenes(): Promise<void> {
    try {
      setOrdenes(await obtenerOrdenesVenta());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  const totalBorrador = useMemo(() => {
    return lineas.reduce((acumulado, linea) => {
      const cantidad = Number(linea.cantidad);
      const precio = Number(linea.precioUnitario);
      if (Number.isNaN(cantidad) || Number.isNaN(precio)) return acumulado;
      return acumulado + cantidad * precio;
    }, 0);
  }, [lineas]);

  const ordenesDespachables = useMemo(
    () => ordenes.filter((o) => o.estado === "PENDIENTE" || o.estado === "PARCIAL"),
    [ordenes],
  );

  const ordenSeleccionada = useMemo(
    () => ordenes.find((o) => String(o.id) === ordenDespacho) ?? null,
    [ordenes, ordenDespacho],
  );

  // ── Órdenes de venta ────────────────────────────────────────────────────────

  function actualizarLinea(indice: number, cambios: Partial<LineaBorrador>): void {
    setLineas((previas) =>
      previas.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)),
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

  async function manejarOrden(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoOrden(null);
    const lineasValidas = lineas.filter((l) => l.sku !== null && l.cantidad);
    if (lineasValidas.length === 0) {
      setAvisoOrden({
        texto: "Selecciona un producto en cada línea y agrega su cantidad.",
        tono: "error",
      });
      return;
    }
    setGuardandoOrden(true);
    try {
      const respuesta = await crearOrdenVenta({
        almacenId: ALMACEN_PRINCIPAL,
        numero: numeroOrden,
        cliente: cliente || undefined,
        observaciones: observaciones || undefined,
        lineas: lineasValidas.map((l) => ({
          skuId: l.sku!.id,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario || undefined,
        })),
      });
      setAvisoOrden({
        texto: `Orden de venta creada (#${respuesta.id}, total: ${respuesta.total}). El stock quedó reservado.`,
        tono: "exito",
      });
      setNumeroOrden("");
      setCliente("");
      setObservaciones("");
      setLineas([lineaVacia()]);
      await refrescarOrdenes();
    } catch (error) {
      setAvisoOrden({
        texto: mensajeError(
          error,
          "No se pudo crear la orden de venta. Verifica que haya stock disponible.",
        ),
        tono: "error",
      });
    } finally {
      setGuardandoOrden(false);
    }
  }

  async function manejarAnular(id: number): Promise<void> {
    setAvisoLista(null);
    setAnulandoId(id);
    try {
      await anularOrdenVenta(id);
      setAvisoLista({
        texto: `Orden #${id} anulada. El stock reservado quedó liberado.`,
        tono: "exito",
      });
      await refrescarOrdenes();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo anular la orden."),
        tono: "error",
      });
    } finally {
      setAnulandoId(null);
    }
  }

  // ── Despacho ──────────────────────────────────────────────────────────────

  function actualizarDespachado(ordenVentaLineaId: number, valor: string): void {
    setDespachados((previos) => ({ ...previos, [ordenVentaLineaId]: valor }));
  }

  async function manejarDespacho(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoDespacho(null);
    if (!ordenSeleccionada) {
      setAvisoDespacho({ texto: "Selecciona una orden de venta.", tono: "error" });
      return;
    }
    const lineasDespacho = ordenSeleccionada.lineas
      .map((linea) => ({
        ordenVentaLineaId: linea.id,
        cantidad: despachados[linea.id]?.trim() ?? "",
      }))
      .filter((l) => l.cantidad !== "" && Number(l.cantidad) > 0);
    if (lineasDespacho.length === 0) {
      setAvisoDespacho({
        texto: "Ingresa la cantidad a despachar en al menos una línea.",
        tono: "error",
      });
      return;
    }
    setGuardandoDespacho(true);
    try {
      await crearDespacho({
        ordenVentaId: ordenSeleccionada.id,
        tipoDocumentoSunat: tipoDocumento || undefined,
        serieComprobante: serie || undefined,
        numeroComprobante: numeroComprobante || undefined,
        lineas: lineasDespacho,
      });
      setAvisoDespacho({
        texto: "Despacho registrado. Stock físico descontado y estado actualizado.",
        tono: "exito",
      });
      setTipoDocumento("");
      setSerie("");
      setNumeroComprobante("");
      setDespachados({});
      await refrescarOrdenes();
    } catch (error) {
      setAvisoDespacho({
        texto: mensajeError(error, "No se pudo registrar el despacho."),
        tono: "error",
      });
    } finally {
      setGuardandoDespacho(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Ventas"
        descripcion="Gestiona órdenes de venta y despachos de mercadería."
      />

      <div className="aviso aviso-exito mb-6" role="note">
        <span>
          <span className="font-semibold">¿Cómo funciona el stock en ventas?</span> Al{" "}
          <span className="font-medium">crear la orden</span> el stock queda{" "}
          <span className="font-medium">reservado</span> (comprometido): no se descuenta del
          inventario físico, pero queda apartado para esa venta. Al{" "}
          <span className="font-medium">despachar</span> se descuenta el stock físico real. Si
          no hay stock disponible suficiente, la creación de la orden falla.
        </span>
      </div>

      <div
        className="flex gap-1 border-b border-borde"
        role="tablist"
        aria-label="Secciones de ventas"
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

      {pestania === "ordenes" && (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Nueva orden de venta</span>
            </div>
            <form onSubmit={manejarOrden} className="space-y-4 p-5">
              {avisoOrden && (
                <div
                  role={avisoOrden.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoOrden.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoOrden.texto}</span>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="numero-orden" className="etiqueta-campo">
                    Número
                  </label>
                  <input
                    id="numero-orden"
                    value={numeroOrden}
                    onChange={(e) => setNumeroOrden(e.target.value)}
                    required
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="cliente" className="etiqueta-campo">
                    Cliente <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="cliente"
                    value={cliente}
                    onChange={(e) => setCliente(e.target.value)}
                    className="campo"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="observaciones" className="etiqueta-campo">
                  Observaciones <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="observaciones"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="campo"
                />
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
                    className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <div>
                      <label className="etiqueta-campo">SKU</label>
                      <SelectorSku
                        valor={linea.sku}
                        onSeleccionar={(sku) => actualizarLinea(indice, { sku })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`linea-cantidad-${indice}`} className="etiqueta-campo">
                        Cantidad
                      </label>
                      <input
                        id={`linea-cantidad-${indice}`}
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                        inputMode="decimal"
                        className="campo w-28 font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor={`linea-precio-${indice}`} className="etiqueta-campo">
                        Precio unit. <span className="text-texto-ter">(opc.)</span>
                      </label>
                      <input
                        id={`linea-precio-${indice}`}
                        value={linea.precioUnitario}
                        onChange={(e) =>
                          actualizarLinea(indice, { precioUnitario: e.target.value })
                        }
                        inputMode="decimal"
                        className="campo w-32 font-mono"
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

              <div className="flex items-center justify-between border-t border-borde pt-4">
                <span className="text-sm text-texto-sec">
                  Total estimado:{" "}
                  <span className="font-mono font-semibold text-tinta">
                    {formatearSoles(totalBorrador)}
                  </span>
                </span>
                <button
                  type="submit"
                  disabled={guardandoOrden}
                  className="btn btn-primario"
                >
                  {guardandoOrden ? "Creando…" : "Crear orden"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Órdenes existentes</span>
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
              ) : ordenes.length === 0 ? (
                <p className="text-sm text-texto-ter">Sin órdenes registradas.</p>
              ) : (
                ordenes.map((orden) => (
                  <article
                    key={orden.id}
                    className="rounded-md border border-borde p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold text-tinta">
                          {orden.numero}
                        </p>
                        <p className="text-xs text-texto-sec">{orden.cliente}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={INSIGNIA_ESTADO[orden.estado]}>{orden.estado}</span>
                        <span className="font-mono text-sm font-semibold text-tinta">
                          {formatearSoles(orden.total)}
                        </span>
                        {esAnulable(orden.estado) && (
                          <button
                            type="button"
                            onClick={() => manejarAnular(orden.id)}
                            disabled={anulandoId === orden.id}
                            className="btn btn-contorno"
                          >
                            {anulandoId === orden.id ? "Anulando…" : "Anular"}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="tabla-datos">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Cantidad</th>
                            <th>Despachada</th>
                            <th>Pendiente</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orden.lineas.map((linea) => (
                            <tr key={linea.id}>
                              <td><span className="font-mono text-xs text-texto-sec">{linea.codigoSku}</span> <span className="text-texto">{linea.nombreSku}</span></td>
                              <td className="num">{linea.cantidad}</td>
                              <td className="num">{linea.cantidadDespachada}</td>
                              <td className="num font-semibold text-tinta">{linea.pendiente}</td>
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
      )}

      {pestania === "despacho" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Registrar despacho</span>
          </div>
          <form onSubmit={manejarDespacho} className="space-y-4 p-5">
            {avisoDespacho && (
              <div
                role={avisoDespacho.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoDespacho.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoDespacho.texto}</span>
              </div>
            )}
            <div>
              <label htmlFor="orden-despacho" className="etiqueta-campo">
                Orden de venta
              </label>
              <select
                id="orden-despacho"
                value={ordenDespacho}
                onChange={(e) => {
                  setOrdenDespacho(e.target.value);
                  setDespachados({});
                  setAvisoDespacho(null);
                }}
                disabled={cargandoBase}
                className="campo"
              >
                <option value="">
                  {cargandoBase ? "Cargando…" : "Selecciona una orden pendiente…"}
                </option>
                {ordenesDespachables.map((orden) => (
                  <option key={orden.id} value={orden.id}>
                    {orden.numero} — {orden.cliente} ({orden.estado})
                  </option>
                ))}
              </select>
              {!cargandoBase && ordenesDespachables.length === 0 && (
                <p className="mt-1.5 text-xs text-texto-ter">
                  No hay órdenes pendientes de despacho.
                </p>
              )}
            </div>

            {ordenSeleccionada && (
              <>
                <div className="overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Pendiente</th>
                        <th>Despachar ahora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenSeleccionada.lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td><span className="font-mono text-xs text-texto-sec">{linea.codigoSku}</span> <span className="text-texto">{linea.nombreSku}</span></td>
                          <td className="num font-semibold text-tinta">{linea.pendiente}</td>
                          <td>
                            <input
                              value={despachados[linea.id] ?? ""}
                              onChange={(e) => actualizarDespachado(linea.id, e.target.value)}
                              inputMode="decimal"
                              disabled={Number(linea.pendiente) <= 0}
                              aria-label={`Cantidad a despachar de ${linea.nombreSku}`}
                              className="campo w-28 font-mono"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="tipo-documento" className="etiqueta-campo">
                      Tipo doc. <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="tipo-documento"
                      value={tipoDocumento}
                      onChange={(e) => setTipoDocumento(e.target.value)}
                      className="campo"
                    />
                  </div>
                  <div>
                    <label htmlFor="serie" className="etiqueta-campo">
                      Serie <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="serie"
                      value={serie}
                      onChange={(e) => setSerie(e.target.value)}
                      className="campo font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="numero-comprobante" className="etiqueta-campo">
                      Número <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="numero-comprobante"
                      value={numeroComprobante}
                      onChange={(e) => setNumeroComprobante(e.target.value)}
                      className="campo font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={guardandoDespacho}
                  className="btn btn-primario"
                >
                  {guardandoDespacho ? "Registrando…" : "Registrar despacho"}
                </button>
              </>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
