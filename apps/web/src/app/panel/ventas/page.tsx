"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { FormularioGuia } from "@/componentes/formulario-guia";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  anularOrdenVenta,
  crearDespacho,
  crearOrdenVenta,
  obtenerClientes,
  obtenerOrdenesVenta,
  type Cliente,
  type EstadoOrdenVenta,
  type OrdenVenta,
  type Sku,
} from "@/lib/api";
import { COMPROBANTES_VENTA } from "@/lib/comprobantes";
import { formatearSoles } from "@/lib/formato";

const ALMACEN_PRINCIPAL = 1;
const IGV_TASA = 0.18;

type Pestania = "ordenes" | "despacho";
type Moneda = "PEN" | "USD";

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
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Órdenes de venta
  const [numeroOrden, setNumeroOrden] = useState<string>("");
  const [clienteId, setClienteId] = useState<string>("");
  const [moneda, setMoneda] = useState<Moneda>("PEN");
  const [tipoCambio, setTipoCambio] = useState<string>("");
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
  const [fechaEmision, setFechaEmision] = useState<string>("");
  const [subtotalDoc, setSubtotalDoc] = useState<string>("");
  const [igvDoc, setIgvDoc] = useState<string>("");
  const [totalDoc, setTotalDoc] = useState<string>("");
  const [despachados, setDespachados] = useState<DespachoBorrador>({});
  const [guardandoDespacho, setGuardandoDespacho] = useState<boolean>(false);
  const [avisoDespacho, setAvisoDespacho] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [respOrdenes, respClientes] = await Promise.all([
          obtenerOrdenesVenta(),
          obtenerClientes(),
        ]);
        setOrdenes(respOrdenes);
        setClientes(respClientes);
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

  const subtotalBorrador = useMemo(() => {
    return lineas.reduce((acumulado, linea) => {
      const cantidad = Number(linea.cantidad);
      const precio = Number(linea.precioUnitario);
      if (Number.isNaN(cantidad) || Number.isNaN(precio)) return acumulado;
      return acumulado + cantidad * precio;
    }, 0);
  }, [lineas]);

  const igvBorrador = subtotalBorrador * IGV_TASA;
  const totalBorrador = subtotalBorrador + igvBorrador;

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
    if (!clienteId) {
      setAvisoOrden({ texto: "Selecciona un cliente.", tono: "error" });
      return;
    }
    if (moneda === "USD" && (!tipoCambio.trim() || Number(tipoCambio) <= 0)) {
      setAvisoOrden({ texto: "Ingresa un tipo de cambio válido para dólares.", tono: "error" });
      return;
    }
    const lineasValidas = lineas.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null && l.cantidad !== "",
    );
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
        clienteId: Number(clienteId),
        moneda,
        tipoCambio: moneda === "USD" ? tipoCambio : undefined,
        observaciones: observaciones || undefined,
        lineas: lineasValidas.map((l) => ({
          skuId: l.sku.id,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario || undefined,
        })),
      });
      setAvisoOrden({
        texto: `Orden de venta creada (${respuesta.numero}, total: ${formatearSoles(respuesta.total)}). El stock quedó reservado.`,
        tono: "exito",
      });
      setNumeroOrden("");
      setClienteId("");
      setMoneda("PEN");
      setTipoCambio("");
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

  function limpiarComprobante(): void {
    setTipoDocumento("");
    setSerie("");
    setNumeroComprobante("");
    setFechaEmision("");
    setSubtotalDoc("");
    setIgvDoc("");
    setTotalDoc("");
    setDespachados({});
  }

  async function manejarDespacho(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoDespacho(null);
    if (!ordenSeleccionada) {
      setAvisoDespacho({ texto: "Selecciona una orden de venta.", tono: "error" });
      return;
    }
    if (!tipoDocumento) {
      setAvisoDespacho({ texto: "Selecciona el tipo de comprobante.", tono: "error" });
      return;
    }
    if (!serie.trim() || !numeroComprobante.trim() || !fechaEmision) {
      setAvisoDespacho({
        texto: "Completa serie, número y fecha de emisión del comprobante.",
        tono: "error",
      });
      return;
    }
    if (!subtotalDoc.trim() || !igvDoc.trim() || !totalDoc.trim()) {
      setAvisoDespacho({
        texto: "Completa subtotal, IGV y total del comprobante.",
        tono: "error",
      });
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
        comprobante: {
          tipoDocumentoSunat: tipoDocumento,
          serie: serie.trim(),
          numero: numeroComprobante.trim(),
          fechaEmision: new Date(fechaEmision).toISOString(),
          moneda: ordenSeleccionada.moneda,
          tipoCambio: ordenSeleccionada.tipoCambio ?? undefined,
          subtotal: subtotalDoc.trim(),
          igv: igvDoc.trim(),
          total: totalDoc.trim(),
        },
        lineas: lineasDespacho,
      });
      setAvisoDespacho({
        texto: "Despacho registrado. Comprobante guardado, stock físico descontado y estado actualizado.",
        tono: "exito",
      });
      limpiarComprobante();
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
        descripcion="Gestiona órdenes de venta y despachos con comprobante e IGV."
      />

      <div className="aviso aviso-exito mb-6" role="note">
        <span>
          <span className="font-semibold">¿Cómo funciona el stock en ventas?</span> Al{" "}
          <span className="font-medium">crear la orden</span> el stock queda{" "}
          <span className="font-medium">reservado</span> (comprometido): no se descuenta del
          inventario físico, pero queda apartado para esa venta. Al{" "}
          <span className="font-medium">despachar</span> se descuenta el stock físico real y se
          registra el comprobante de venta. Si no hay stock disponible suficiente, la creación de
          la orden falla.
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
                    Cliente
                  </label>
                  <select
                    id="cliente"
                    value={clienteId}
                    onChange={(e) => setClienteId(e.target.value)}
                    disabled={cargandoBase}
                    required
                    className="campo"
                  >
                    <option value="">{cargandoBase ? "Cargando…" : "Selecciona…"}</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.numeroDoc} — {c.razonSocial}
                      </option>
                    ))}
                  </select>
                  {!cargandoBase && clientes.length === 0 && (
                    <p className="mt-1.5 text-xs text-texto-ter">
                      No hay clientes registrados. Crea uno en el módulo Clientes.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="moneda-orden" className="etiqueta-campo">
                      Moneda
                    </label>
                    <select
                      id="moneda-orden"
                      value={moneda}
                      onChange={(e) => setMoneda(e.target.value as Moneda)}
                      className="campo"
                    >
                      <option value="PEN">PEN — Soles</option>
                      <option value="USD">USD — Dólares</option>
                    </select>
                  </div>
                  {moneda === "USD" && (
                    <div>
                      <label htmlFor="tipo-cambio" className="etiqueta-campo">
                        Tipo de cambio
                      </label>
                      <input
                        id="tipo-cambio"
                        value={tipoCambio}
                        onChange={(e) => setTipoCambio(e.target.value)}
                        inputMode="decimal"
                        className="campo font-mono"
                      />
                    </div>
                  )}
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
                        Precio unit.
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

              <div className="border-t border-borde pt-4">
                <dl className="ml-auto max-w-xs space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-texto-sec">Subtotal</dt>
                    <dd className="font-mono text-tinta">{formatearSoles(subtotalBorrador)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-texto-sec">IGV (18%)</dt>
                    <dd className="font-mono text-tinta">{formatearSoles(igvBorrador)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-borde pt-1.5">
                    <dt className="font-medium text-texto">Total</dt>
                    <dd className="font-mono font-semibold text-tinta">
                      {formatearSoles(totalBorrador)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 flex justify-end">
                  <button type="submit" disabled={guardandoOrden} className="btn btn-primario">
                    {guardandoOrden ? "Creando…" : "Crear orden"}
                  </button>
                </div>
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
                  <article key={orden.id} className="rounded-md border border-borde p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold text-tinta">
                          {orden.numero}
                        </p>
                        <p className="text-xs text-texto-sec">
                          {orden.cliente ?? "Sin cliente"} · {orden.moneda}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
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
                    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      <div className="flex gap-1.5">
                        <dt className="text-texto-ter">Subtotal:</dt>
                        <dd className="font-mono text-texto">{formatearSoles(orden.subtotal)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-texto-ter">IGV:</dt>
                        <dd className="font-mono text-texto">{formatearSoles(orden.igv)}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-texto-ter">Total:</dt>
                        <dd className="font-mono font-semibold text-tinta">
                          {formatearSoles(orden.total)}
                        </dd>
                      </div>
                    </dl>
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
                              <td>
                                <span className="font-mono text-xs text-texto-sec">
                                  {linea.codigoSku}
                                </span>{" "}
                                <span className="text-texto">{linea.nombreSku}</span>
                              </td>
                              <td className="num">{linea.cantidad}</td>
                              <td className="num">{linea.cantidadDespachada}</td>
                              <td className="num font-semibold text-tinta">{linea.pendiente}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(orden.estado === "DESPACHADA" || orden.estado === "PARCIAL") && (
                      <FormularioGuia
                        vinculo={{ ordenVentaId: orden.id }}
                        motivoDefecto="01"
                        puntoLlegadaSugerido={orden.cliente ?? ""}
                      />
                    )}
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
                  limpiarComprobante();
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
                    {orden.numero} — {orden.cliente ?? "Sin cliente"} ({orden.estado})
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
                          <td>
                            <span className="font-mono text-xs text-texto-sec">
                              {linea.codigoSku}
                            </span>{" "}
                            <span className="text-texto">{linea.nombreSku}</span>
                          </td>
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

                <fieldset className="space-y-4 rounded-md border border-borde bg-panel-alt p-4">
                  <legend className="px-1 text-sm font-medium text-texto">
                    Comprobante de venta (obligatorio)
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="tipo-documento" className="etiqueta-campo">
                        Tipo de comprobante
                      </label>
                      <select
                        id="tipo-documento"
                        value={tipoDocumento}
                        onChange={(e) => setTipoDocumento(e.target.value)}
                        required
                        className="campo"
                      >
                        <option value="">Selecciona…</option>
                        {COMPROBANTES_VENTA.map((opcion) => (
                          <option key={opcion.codigo} value={opcion.codigo}>
                            {opcion.codigo} — {opcion.etiqueta}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="serie" className="etiqueta-campo">
                        Serie
                      </label>
                      <input
                        id="serie"
                        value={serie}
                        onChange={(e) => setSerie(e.target.value)}
                        required
                        placeholder="Ej. F001"
                        className="campo font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="numero-comprobante" className="etiqueta-campo">
                        Número
                      </label>
                      <input
                        id="numero-comprobante"
                        value={numeroComprobante}
                        onChange={(e) => setNumeroComprobante(e.target.value)}
                        required
                        placeholder="Ej. 0001234"
                        className="campo font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="fecha-emision" className="etiqueta-campo">
                      Fecha de emisión
                    </label>
                    <input
                      id="fecha-emision"
                      type="date"
                      value={fechaEmision}
                      onChange={(e) => setFechaEmision(e.target.value)}
                      required
                      className="campo sm:max-w-xs"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="subtotal-doc" className="etiqueta-campo">
                        Subtotal
                      </label>
                      <input
                        id="subtotal-doc"
                        value={subtotalDoc}
                        onChange={(e) => setSubtotalDoc(e.target.value)}
                        inputMode="decimal"
                        required
                        className="campo font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="igv-doc" className="etiqueta-campo">
                        IGV
                      </label>
                      <input
                        id="igv-doc"
                        value={igvDoc}
                        onChange={(e) => setIgvDoc(e.target.value)}
                        inputMode="decimal"
                        required
                        className="campo font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="total-doc" className="etiqueta-campo">
                        Total
                      </label>
                      <input
                        id="total-doc"
                        value={totalDoc}
                        onChange={(e) => setTotalDoc(e.target.value)}
                        inputMode="decimal"
                        required
                        className="campo font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-texto-ter">
                    El comprobante es el sustento SUNAT del despacho. La orden debe tener un
                    cliente identificado; de lo contrario el registro será rechazado.
                  </p>
                </fieldset>

                <button type="submit" disabled={guardandoDespacho} className="btn btn-primario">
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
