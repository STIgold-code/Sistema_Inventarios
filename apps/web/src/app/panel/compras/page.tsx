"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { CapturaSeriesEntrada } from "@/componentes/captura-series";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
import { SelectorSku } from "@/componentes/selector-sku";
import { SelectorBusqueda } from "@/componentes/selector-busqueda";
import { SelectorUnidadLinea } from "@/componentes/selector-unidad-linea";
import {
  ErrorApi,
  anularOrdenCompra,
  aprobarOrdenCompra,
  crearCotizacion,
  crearOrdenCompra,
  crearRecepcion,
  obtenerCotizacionesPorSku,
  obtenerDetalleRecepcion,
  obtenerOrdenesCompra,
  obtenerProveedores,
  obtenerRecepciones,
  obtenerRequerimientos,
  type CotizacionProveedorArticulo,
  type DetalleRecepcion,
  type EstadoOrdenCompra,
  type OrdenCompra,
  type Proveedor,
  type Recepcion,
  type Requerimiento,
  type Sku,
} from "@/lib/api";
import { COMPROBANTES_COMPRA } from "@/lib/comprobantes";
import { formatearDolares, formatearFecha, formatearSoles } from "@/lib/formato";

const ALMACEN_PRINCIPAL = 1;
const IGV_TASA = 0.18;

type Pestania = "ordenes" | "recepcion" | "cotizaciones";
type Moneda = "PEN" | "USD";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  costoUnitario: string;
  enUnidadReferencia: boolean;
}

interface RecepcionBorrador {
  [ordenCompraLineaId: number]: string;
}

interface SeriesBorrador {
  [ordenCompraLineaId: number]: string[];
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "ordenes", etiqueta: "Órdenes de compra" },
  { id: "recepcion", etiqueta: "Recepción" },
  { id: "cotizaciones", etiqueta: "Cotizaciones" },
];

/** Formatea un precio segun su moneda (PEN soles, cualquier otra como USD). */
function formatearPrecio(valor: string, moneda: string): string {
  return moneda === "PEN" ? formatearSoles(valor) : formatearDolares(valor);
}

const INSIGNIA_ESTADO: Record<EstadoOrdenCompra, string> = {
  BORRADOR: "insignia insignia-neutra",
  EMITIDA: "insignia insignia-info",
  PARCIAL: "insignia insignia-oro",
  COMPLETA: "insignia insignia-exito",
  ANULADA: "insignia insignia-peligro",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "", costoUnitario: "", enUnidadReferencia: false };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaCompras(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("ordenes");

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Órdenes de compra
  const [proveedorOrden, setProveedorOrden] = useState<string>("");
  const [requerimientoOrigen, setRequerimientoOrigen] = useState<string>("");
  const [moneda, setMoneda] = useState<Moneda>("PEN");
  const [tipoCambio, setTipoCambio] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [guardandoOrden, setGuardandoOrden] = useState<boolean>(false);
  const [avisoOrden, setAvisoOrden] = useState<Aviso | null>(null);
  const [accionOrden, setAccionOrden] = useState<{
    orden: OrdenCompra;
    tipo: "aprobar" | "anular";
  } | null>(null);
  const [procesandoOrden, setProcesandoOrden] = useState<boolean>(false);

  // Recepción
  const [ordenRecepcion, setOrdenRecepcion] = useState<string>("");
  const [tipoDocumento, setTipoDocumento] = useState<string>("");
  const [serie, setSerie] = useState<string>("");
  const [numeroComprobante, setNumeroComprobante] = useState<string>("");
  const [fechaEmision, setFechaEmision] = useState<string>("");
  const [subtotalRecep, setSubtotalRecep] = useState<string>("");
  const [igvRecep, setIgvRecep] = useState<string>("");
  const [totalRecep, setTotalRecep] = useState<string>("");
  const [guiaRemision, setGuiaRemision] = useState<string>("");
  const [recibidos, setRecibidos] = useState<RecepcionBorrador>({});
  const [seriesRecep, setSeriesRecep] = useState<SeriesBorrador>({});
  const [guardandoRecepcion, setGuardandoRecepcion] = useState<boolean>(false);
  const [avisoRecepcion, setAvisoRecepcion] = useState<Aviso | null>(null);
  // Listado de recepciones registradas y panel de detalle (independientes).
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);
  const [cargandoRecepciones, setCargandoRecepciones] = useState<boolean>(false);
  const [detalleRecepcionId, setDetalleRecepcionId] = useState<string | null>(null);
  const [detalleRecepcion, setDetalleRecepcion] = useState<DetalleRecepcion | null>(
    null,
  );
  const [cargandoDetalleRecep, setCargandoDetalleRecep] = useState<boolean>(false);
  const [errorDetalleRecep, setErrorDetalleRecep] = useState<string | null>(null);

  // Cotizaciones
  const [skuCotizacion, setSkuCotizacion] = useState<Sku | null>(null);
  const [cotizaciones, setCotizaciones] = useState<CotizacionProveedorArticulo[]>([]);
  const [cargandoCotizaciones, setCargandoCotizaciones] = useState<boolean>(false);
  const [proveedorCot, setProveedorCot] = useState<string>("");
  const [monedaCot, setMonedaCot] = useState<Moneda>("PEN");
  const [precioCot, setPrecioCot] = useState<string>("");
  const [fechaCot, setFechaCot] = useState<string>("");
  const [numeroCot, setNumeroCot] = useState<string>("");
  const [refOcCot, setRefOcCot] = useState<string>("");
  const [guardandoCotizacion, setGuardandoCotizacion] = useState<boolean>(false);
  const [avisoCotizacion, setAvisoCotizacion] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [respProveedores, respOrdenes, respReqs] = await Promise.all([
          obtenerProveedores(),
          obtenerOrdenesCompra(),
          obtenerRequerimientos(),
        ]);
        setProveedores(respProveedores);
        setOrdenes(respOrdenes);
        setRequerimientos(respReqs);
      } catch (error) {
        setAvisoOrden({
          texto: mensajeError(error, "No se pudieron cargar los datos de compras."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescarOrdenes(): Promise<void> {
    try {
      setOrdenes(await obtenerOrdenesCompra());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  async function refrescarRecepciones(): Promise<void> {
    setCargandoRecepciones(true);
    try {
      setRecepciones(await obtenerRecepciones());
    } catch {
      // El listado es auxiliar: el flujo principal ya informó al usuario.
    } finally {
      setCargandoRecepciones(false);
    }
  }

  // Carga la lista al entrar a la pestaña de recepción (una sola vez por entrada).
  useEffect(() => {
    if (pestania !== "recepcion") return;
    void refrescarRecepciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pestania]);

  async function abrirDetalleRecepcion(id: string): Promise<void> {
    setDetalleRecepcionId(id);
    setDetalleRecepcion(null);
    setErrorDetalleRecep(null);
    setCargandoDetalleRecep(true);
    try {
      setDetalleRecepcion(await obtenerDetalleRecepcion(id));
    } catch (error) {
      setErrorDetalleRecep(
        mensajeError(error, "No se pudo cargar el detalle de la recepción."),
      );
    } finally {
      setCargandoDetalleRecep(false);
    }
  }

  function cerrarDetalleRecepcion(): void {
    setDetalleRecepcionId(null);
    setDetalleRecepcion(null);
    setErrorDetalleRecep(null);
  }

  // ── Visibilidad del feedback inline ──────────────────────────────────────────
  // Los errores existen siempre (derivados del estado); la visibilidad depende de
  // si el usuario tocó el campo (onBlur / onCambio) o intentó enviar el formulario.
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [intentoOrden, setIntentoOrden] = useState<boolean>(false);
  const [intentoRecepcion, setIntentoRecepcion] = useState<boolean>(false);
  const [intentoCotizacion, setIntentoCotizacion] = useState<boolean>(false);

  function marcarTocado(campo: string): void {
    setTocado((previo) => ({ ...previo, [campo]: true }));
  }

  const subtotalBorrador = useMemo(() => {
    return lineas.reduce((acumulado, linea) => {
      const cantidad = Number(linea.cantidad);
      const costo = Number(linea.costoUnitario);
      if (Number.isNaN(cantidad) || Number.isNaN(costo)) return acumulado;
      return acumulado + cantidad * costo;
    }, 0);
  }, [lineas]);

  const igvBorrador = subtotalBorrador * IGV_TASA;
  const totalBorrador = subtotalBorrador + igvBorrador;

  const requerimientosAprobados = useMemo(
    () => requerimientos.filter((r) => r.estado === "APROBADO"),
    [requerimientos],
  );

  const ordenesRecepcionables = useMemo(
    () => ordenes.filter((o) => o.estado === "EMITIDA" || o.estado === "PARCIAL"),
    [ordenes],
  );

  const ordenSeleccionada = useMemo(
    () => ordenes.find((o) => String(o.id) === ordenRecepcion) ?? null,
    [ordenes, ordenRecepcion],
  );

  // ── Errores derivados (fuente única de verdad; el submit los reutiliza) ──────

  const erroresOrden = useMemo(() => {
    const e: {
      proveedorOrden?: string;
      tipoCambio?: string;
      lineas: { cantidad?: string; costoUnitario?: string; sku?: string }[];
      general?: string;
    } = { lineas: [] };
    if (!proveedorOrden) e.proveedorOrden = "Selecciona un proveedor.";
    if (moneda === "USD" && (!tipoCambio.trim() || Number(tipoCambio) <= 0)) {
      e.tipoCambio = "Ingresa un tipo de cambio mayor a 0.";
    }
    lineas.forEach((linea) => {
      const eLinea: { cantidad?: string; costoUnitario?: string; sku?: string } = {};
      const cant = linea.cantidad.trim();
      const costo = linea.costoUnitario.trim();
      if (cant && !(Number(linea.cantidad) > 0)) {
        eLinea.cantidad = "Ingresa una cantidad mayor a 0.";
      }
      if (costo && !(Number(linea.costoUnitario) > 0)) {
        eLinea.costoUnitario = "Ingresa un costo mayor a 0.";
      }
      if ((cant || costo) && !linea.sku) {
        eLinea.sku = "Selecciona un producto.";
      }
      e.lineas.push(eLinea);
    });
    const conDatos = lineas.filter((l) => l.cantidad && l.costoUnitario);
    if (conDatos.length === 0) {
      e.general = "Agrega al menos una línea con SKU, cantidad y costo.";
    }
    return e;
  }, [proveedorOrden, moneda, tipoCambio, lineas]);

  const erroresRecepcion = useMemo(() => {
    const e: {
      tipoDocumento?: string;
      serie?: string;
      numeroComprobante?: string;
      fechaEmision?: string;
      subtotalRecep?: string;
      igvRecep?: string;
      totalRecep?: string;
    } = {};
    if (!tipoDocumento) e.tipoDocumento = "Selecciona el tipo de comprobante.";
    if (!serie.trim()) e.serie = "Ingresa la serie.";
    if (!numeroComprobante.trim()) e.numeroComprobante = "Ingresa el número.";
    if (!fechaEmision) e.fechaEmision = "Indica la fecha de emisión.";
    if (subtotalRecep.trim() && !(Number(subtotalRecep) >= 0)) {
      e.subtotalRecep = "Ingresa un subtotal válido.";
    } else if (!subtotalRecep.trim()) {
      e.subtotalRecep = "Ingresa el subtotal.";
    }
    if (igvRecep.trim() && !(Number(igvRecep) >= 0)) {
      e.igvRecep = "Ingresa un IGV válido.";
    } else if (!igvRecep.trim()) {
      e.igvRecep = "Ingresa el IGV.";
    }
    if (totalRecep.trim() && !(Number(totalRecep) > 0)) {
      e.totalRecep = "Ingresa un total mayor a 0.";
    } else if (!totalRecep.trim()) {
      e.totalRecep = "Ingresa el total.";
    }
    return e;
  }, [tipoDocumento, serie, numeroComprobante, fechaEmision, subtotalRecep, igvRecep, totalRecep]);

  const erroresCotizacion = useMemo(() => {
    const e: { proveedorCot?: string; precioCot?: string; fechaCot?: string } = {};
    if (!proveedorCot) e.proveedorCot = "Selecciona un proveedor.";
    if (!precioCot.trim() || !(Number(precioCot) > 0)) {
      e.precioCot = "Ingresa un precio unitario mayor a 0.";
    }
    if (!fechaCot) e.fechaCot = "Indica la fecha de la cotización.";
    return e;
  }, [proveedorCot, precioCot, fechaCot]);

  // ── Órdenes de compra ────────────────────────────────────────────────────────

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

  async function manejarOrden(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoOrden(null);
    setIntentoOrden(true);
    const lineasConDatos = lineas.filter((l) => l.cantidad && l.costoUnitario);
    const hayErrores =
      Boolean(erroresOrden.proveedorOrden) ||
      Boolean(erroresOrden.tipoCambio) ||
      Boolean(erroresOrden.general) ||
      erroresOrden.lineas.some((l) => l.cantidad || l.costoUnitario || l.sku);
    if (hayErrores) return;
    const lineasValidas = lineasConDatos.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null,
    );
    setGuardandoOrden(true);
    try {
      const respuesta = await crearOrdenCompra({
        proveedorId: Number(proveedorOrden),
        almacenId: ALMACEN_PRINCIPAL,
        requerimientoId: requerimientoOrigen ? Number(requerimientoOrigen) : undefined,
        moneda,
        tipoCambio: moneda === "USD" ? tipoCambio : undefined,
        observaciones: observaciones || undefined,
        lineas: lineasValidas.map((l) => ({
          skuId: l.sku.id,
          cantidad: l.cantidad,
          costoUnitario: l.costoUnitario,
          enUnidadReferencia: l.enUnidadReferencia || undefined,
        })),
      });
      setAvisoOrden({
        texto: `Orden de compra creada (${respuesta.numero}, total: ${formatearSoles(respuesta.total)}).`,
        tono: "exito",
      });
      setProveedorOrden("");
      setRequerimientoOrigen("");
      setMoneda("PEN");
      setTipoCambio("");
      setObservaciones("");
      setLineas([lineaVacia()]);
      setIntentoOrden(false);
      await refrescarOrdenes();
    } catch (error) {
      setAvisoOrden({
        texto: mensajeError(error, "No se pudo crear la orden de compra."),
        tono: "error",
      });
    } finally {
      setGuardandoOrden(false);
    }
  }

  function aplicarRequerimiento(idRequerimiento: string): void {
    setRequerimientoOrigen(idRequerimiento);
    if (!idRequerimiento) return;
    const req = requerimientos.find((r) => String(r.id) === idRequerimiento);
    if (!req) return;
    // Las líneas del requerimiento solo traen skuId, no el SKU completo. Se
    // prellenan cantidades; el usuario elige el SKU en el SelectorSku y completa
    // el costo unitario, que el requerimiento no contempla.
    setLineas(
      req.lineas.map((linea) => ({
        sku: null,
        cantidad: linea.cantidad,
        costoUnitario: "",
        enUnidadReferencia: false,
      })),
    );
    if (req.observaciones) setObservaciones(req.observaciones);
  }

  async function confirmarAccionOrden(): Promise<void> {
    if (!accionOrden) return;
    setProcesandoOrden(true);
    setAvisoOrden(null);
    try {
      if (accionOrden.tipo === "aprobar") {
        await aprobarOrdenCompra(accionOrden.orden.id);
        setAvisoOrden({ texto: `Orden ${accionOrden.orden.numero} emitida.`, tono: "exito" });
      } else {
        await anularOrdenCompra(accionOrden.orden.id);
        setAvisoOrden({ texto: `Orden ${accionOrden.orden.numero} anulada.`, tono: "exito" });
      }
      setAccionOrden(null);
      await refrescarOrdenes();
    } catch (error) {
      setAvisoOrden({
        texto: mensajeError(error, "No se pudo actualizar la orden."),
        tono: "error",
      });
    } finally {
      setProcesandoOrden(false);
    }
  }

  // ── Recepción ──────────────────────────────────────────────────────────────

  function actualizarRecibido(ordenCompraLineaId: number, valor: string): void {
    setRecibidos((previos) => ({ ...previos, [ordenCompraLineaId]: valor }));
  }

  function actualizarSeriesRecep(
    ordenCompraLineaId: number,
    series: string[],
  ): void {
    setSeriesRecep((previos) => ({ ...previos, [ordenCompraLineaId]: series }));
  }

  function limpiarRecepcion(): void {
    setTipoDocumento("");
    setSerie("");
    setNumeroComprobante("");
    setFechaEmision("");
    setSubtotalRecep("");
    setIgvRecep("");
    setTotalRecep("");
    setGuiaRemision("");
    setRecibidos({});
    setSeriesRecep({});
    setIntentoRecepcion(false);
  }

  async function manejarRecepcion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoRecepcion(null);
    setIntentoRecepcion(true);
    if (!ordenSeleccionada) {
      setAvisoRecepcion({ texto: "Selecciona una orden de compra.", tono: "error" });
      return;
    }
    if (Object.keys(erroresRecepcion).length > 0) return;
    const lineasConCantidad = ordenSeleccionada.lineas
      .map((linea) => ({
        linea,
        cantidad: recibidos[linea.id]?.trim() ?? "",
      }))
      .filter((l) => l.cantidad !== "" && Number(l.cantidad) > 0);
    if (lineasConCantidad.length === 0) {
      setAvisoRecepcion({
        texto: "Ingresa la cantidad recibida en al menos una línea.",
        tono: "error",
      });
      return;
    }
    // Validacion de series para lineas serializadas: N series no vacias y unicas.
    for (const { linea, cantidad } of lineasConCantidad) {
      if (!linea.controlaSerie) continue;
      const series = (seriesRecep[linea.id] ?? [])
        .map((s) => s.trim())
        .filter((s) => s !== "");
      const esperadas = Number(cantidad);
      if (!Number.isInteger(esperadas)) {
        setAvisoRecepcion({
          texto: `${linea.nombreSku} controla número de serie: la cantidad recibida debe ser entera.`,
          tono: "error",
        });
        return;
      }
      if (series.length !== esperadas) {
        setAvisoRecepcion({
          texto: `Ingresa ${esperadas} número(s) de serie para ${linea.nombreSku}.`,
          tono: "error",
        });
        return;
      }
      if (new Set(series).size !== series.length) {
        setAvisoRecepcion({
          texto: `Hay números de serie repetidos en ${linea.nombreSku}.`,
          tono: "error",
        });
        return;
      }
    }
    const lineasRecepcion = lineasConCantidad.map(({ linea, cantidad }) => ({
      ordenCompraLineaId: linea.id,
      cantidad,
      numerosSerie: linea.controlaSerie
        ? (seriesRecep[linea.id] ?? []).map((s) => s.trim()).filter((s) => s !== "")
        : undefined,
    }));
    setGuardandoRecepcion(true);
    try {
      const respuesta = await crearRecepcion({
        ordenCompraId: ordenSeleccionada.id,
        tipoDocumentoSunat: tipoDocumento,
        serieComprobante: serie.trim(),
        numeroComprobante: numeroComprobante.trim(),
        fechaEmisionDocumento: new Date(fechaEmision).toISOString(),
        moneda: ordenSeleccionada.moneda,
        tipoCambio: ordenSeleccionada.tipoCambio ?? undefined,
        subtotal: subtotalRecep.trim(),
        igv: igvRecep.trim(),
        total: totalRecep.trim(),
        guiaRemisionProveedor: guiaRemision.trim() || undefined,
        lineas: lineasRecepcion,
      });
      setAvisoRecepcion({
        texto: `Recepción registrada (#${respuesta.recepcionId}). Stock y estado actualizados.`,
        tono: "exito",
      });
      limpiarRecepcion();
      await refrescarOrdenes();
      await refrescarRecepciones();
    } catch (error) {
      setAvisoRecepcion({
        texto: mensajeError(error, "No se pudo registrar la recepción."),
        tono: "error",
      });
    } finally {
      setGuardandoRecepcion(false);
    }
  }

  // ── Cotizaciones ─────────────────────────────────────────────────────────

  async function cargarCotizaciones(sku: Sku | null): Promise<void> {
    setSkuCotizacion(sku);
    setAvisoCotizacion(null);
    if (!sku) {
      setCotizaciones([]);
      return;
    }
    setCargandoCotizaciones(true);
    try {
      setCotizaciones(await obtenerCotizacionesPorSku(sku.id));
    } catch (error) {
      setCotizaciones([]);
      setAvisoCotizacion({
        texto: mensajeError(error, "No se pudieron cargar las cotizaciones."),
        tono: "error",
      });
    } finally {
      setCargandoCotizaciones(false);
    }
  }

  async function manejarCotizacion(
    evento: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    evento.preventDefault();
    setAvisoCotizacion(null);
    setIntentoCotizacion(true);
    if (!skuCotizacion) {
      setAvisoCotizacion({ texto: "Selecciona un SKU primero.", tono: "error" });
      return;
    }
    if (Object.keys(erroresCotizacion).length > 0) return;
    setGuardandoCotizacion(true);
    try {
      await crearCotizacion({
        proveedorId: Number(proveedorCot),
        skuId: skuCotizacion.id,
        moneda: monedaCot,
        precioUnitario: precioCot.trim(),
        fechaCotizacion: new Date(fechaCot).toISOString(),
        numeroCotizacion: numeroCot.trim() || undefined,
        ordenCompraRef: refOcCot.trim() || undefined,
      });
      setAvisoCotizacion({ texto: "Cotización registrada.", tono: "exito" });
      setProveedorCot("");
      setMonedaCot("PEN");
      setPrecioCot("");
      setFechaCot("");
      setNumeroCot("");
      setRefOcCot("");
      setIntentoCotizacion(false);
      await cargarCotizaciones(skuCotizacion);
    } catch (error) {
      setAvisoCotizacion({
        texto: mensajeError(error, "No se pudo registrar la cotización."),
        tono: "error",
      });
    } finally {
      setGuardandoCotizacion(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Compras"
        descripcion="Gestiona proveedores, órdenes de compra y recepciones de mercadería."
      />

      <div
        className="flex gap-1 border-b border-borde"
        role="tablist"
        aria-label="Secciones de compras"
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
              <span className="panel-titulo">Nueva orden de compra</span>
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

              <div>
                <label htmlFor="requerimiento-origen" className="etiqueta-campo">
                  Desde requerimiento aprobado{" "}
                  <span className="text-texto-ter">(opcional)</span>
                </label>
                <SelectorBusqueda
                  id="requerimiento-origen"
                  valor={requerimientoOrigen}
                  onCambio={(v) => aplicarRequerimiento(v)}
                  disabled={cargandoBase}
                  placeholder="Sin requerimiento de origen"
                  opciones={requerimientosAprobados.map((req) => ({
                    valor: String(req.id),
                    etiqueta: `${req.numero} — ${req.centroCosto}`,
                  }))}
                />
                {requerimientoOrigen && (
                  <p className="mt-1.5 text-xs text-texto-ter">
                    Se prellenaron las cantidades. Selecciona el SKU y completa el costo
                    unitario en cada línea.
                  </p>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="proveedor-orden" className="etiqueta-campo">
                    Proveedor
                  </label>
                  <SelectorBusqueda
                    id="proveedor-orden"
                    valor={proveedorOrden}
                    onCambio={(v) => {
                      setProveedorOrden(v);
                      marcarTocado("proveedorOrden");
                    }}
                    disabled={cargandoBase}
                    requerido
                    placeholder={cargandoBase ? "Cargando…" : "Selecciona…"}
                    opciones={proveedores
                      .filter((p) => p.activo)
                      .map((proveedor) => ({
                        valor: String(proveedor.id),
                        etiqueta: `${proveedor.ruc} — ${proveedor.razonSocial}`,
                      }))}
                  />
                  {(tocado.proveedorOrden || intentoOrden) && erroresOrden.proveedorOrden && (
                    <p className="mt-1.5 text-xs text-peligro">
                      {erroresOrden.proveedorOrden}
                    </p>
                  )}
                </div>
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
                        onBlur={() => marcarTocado("tipoCambio")}
                        inputMode="decimal"
                        aria-invalid={
                          (tocado.tipoCambio || intentoOrden) && erroresOrden.tipoCambio
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado.tipoCambio || intentoOrden) && erroresOrden.tipoCambio && (
                        <p className="mt-1.5 text-xs text-peligro">
                          {erroresOrden.tipoCambio}
                        </p>
                      )}
                    </div>
                  )}
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
                {intentoOrden && erroresOrden.general && (
                  <p className="text-xs text-peligro">{erroresOrden.general}</p>
                )}

                {lineas.map((linea, indice) => (
                  <div
                    key={indice}
                    className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
                  >
                    <div>
                      <label htmlFor={`linea-sku-${indice}`} className="etiqueta-campo">
                        SKU
                      </label>
                      <SelectorSku
                        valor={linea.sku}
                        onSeleccionar={(sku) => {
                          cambiarSkuLinea(indice, sku);
                          marcarTocado(`oc-sku-${indice}`);
                        }}
                        placeholder="Busca por código o nombre…"
                      />
                      {(tocado[`oc-sku-${indice}`] || intentoOrden) &&
                        erroresOrden.lineas[indice]?.sku && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresOrden.lineas[indice]?.sku}
                          </p>
                        )}
                    </div>
                    <div>
                      <label htmlFor={`linea-cantidad-${indice}`} className="etiqueta-campo">
                        Cantidad
                      </label>
                      <input
                        id={`linea-cantidad-${indice}`}
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                        onBlur={() => marcarTocado(`oc-cantidad-${indice}`)}
                        inputMode="decimal"
                        aria-invalid={
                          (tocado[`oc-cantidad-${indice}`] || intentoOrden) &&
                          erroresOrden.lineas[indice]?.cantidad
                            ? "true"
                            : undefined
                        }
                        className="campo w-28 font-mono"
                      />
                      {(tocado[`oc-cantidad-${indice}`] || intentoOrden) &&
                        erroresOrden.lineas[indice]?.cantidad && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresOrden.lineas[indice]?.cantidad}
                          </p>
                        )}
                    </div>
                    <SelectorUnidadLinea
                      sku={linea.sku}
                      enUnidadReferencia={linea.enUnidadReferencia}
                      onCambiar={(v) =>
                        actualizarLinea(indice, { enUnidadReferencia: v })
                      }
                      cantidad={linea.cantidad}
                      id={`linea-unidad-${indice}`}
                    />
                    <div>
                      <label htmlFor={`linea-costo-${indice}`} className="etiqueta-campo">
                        Costo unitario
                      </label>
                      <input
                        id={`linea-costo-${indice}`}
                        value={linea.costoUnitario}
                        onChange={(e) =>
                          actualizarLinea(indice, { costoUnitario: e.target.value })
                        }
                        onBlur={() => marcarTocado(`oc-costo-${indice}`)}
                        inputMode="decimal"
                        aria-invalid={
                          (tocado[`oc-costo-${indice}`] || intentoOrden) &&
                          erroresOrden.lineas[indice]?.costoUnitario
                            ? "true"
                            : undefined
                        }
                        className="campo w-32 font-mono"
                      />
                      {(tocado[`oc-costo-${indice}`] || intentoOrden) &&
                        erroresOrden.lineas[indice]?.costoUnitario && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresOrden.lineas[indice]?.costoUnitario}
                          </p>
                        )}
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
                          {orden.proveedor} · {orden.moneda}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={INSIGNIA_ESTADO[orden.estado]}>{orden.estado}</span>
                        <span className="font-mono text-sm font-semibold text-tinta">
                          {formatearSoles(orden.total)}
                        </span>
                        {orden.estado === "BORRADOR" && (
                          <button
                            type="button"
                            onClick={() => setAccionOrden({ orden, tipo: "aprobar" })}
                            className="btn btn-primario h-8"
                          >
                            Aprobar
                          </button>
                        )}
                        {(orden.estado === "BORRADOR" || orden.estado === "EMITIDA") && (
                          <button
                            type="button"
                            onClick={() => setAccionOrden({ orden, tipo: "anular" })}
                            className="btn btn-peligro h-8"
                          >
                            Anular
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
                            <th>Pedida</th>
                            <th>Recibida</th>
                            <th>Pendiente</th>
                            <th>Costo unit.</th>
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
                              <td className="num">{linea.cantidadRecibida}</td>
                              <td className="num font-semibold text-tinta">{linea.pendiente}</td>
                              <td className="num">{linea.costoUnitario}</td>
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

      {pestania === "recepcion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Registrar recepción</span>
          </div>
          <form onSubmit={manejarRecepcion} className="space-y-4 p-5">
            {avisoRecepcion && (
              <div
                role={avisoRecepcion.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoRecepcion.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoRecepcion.texto}</span>
              </div>
            )}
            <div>
              <label htmlFor="orden-recepcion" className="etiqueta-campo">
                Orden de compra
              </label>
              <SelectorBusqueda
                id="orden-recepcion"
                valor={ordenRecepcion}
                onCambio={(v) => {
                  setOrdenRecepcion(v);
                  limpiarRecepcion();
                  setAvisoRecepcion(null);
                }}
                disabled={cargandoBase}
                placeholder={
                  cargandoBase ? "Cargando…" : "Selecciona una orden pendiente…"
                }
                opciones={ordenesRecepcionables.map((orden) => ({
                  valor: String(orden.id),
                  etiqueta: `${orden.numero} — ${orden.proveedor} (${orden.estado})`,
                }))}
              />
              {!cargandoBase && ordenesRecepcionables.length === 0 && (
                <p className="mt-1.5 text-xs text-texto-ter">
                  No hay órdenes en estado Emitida o Parcial para recibir.
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
                        <th>Recibir ahora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenSeleccionada.lineas.map((linea) => {
                        const cantidad = Number(recibidos[linea.id] ?? "");
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
                                  <span className="insignia insignia-info ml-2">
                                    Serie
                                  </span>
                                )}
                              </td>
                              <td className="num font-semibold text-tinta">
                                {linea.pendiente}
                              </td>
                              <td>
                                <input
                                  value={recibidos[linea.id] ?? ""}
                                  onChange={(e) =>
                                    actualizarRecibido(linea.id, e.target.value)
                                  }
                                  inputMode="decimal"
                                  disabled={Number(linea.pendiente) <= 0}
                                  aria-label={`Cantidad a recibir de ${linea.nombreSku}`}
                                  className="campo w-28 font-mono"
                                />
                              </td>
                            </tr>
                            {mostrarSeries && (
                              <tr>
                                <td colSpan={3} className="bg-panel-alt">
                                  <CapturaSeriesEntrada
                                    cantidad={cantidad}
                                    valor={seriesRecep[linea.id] ?? []}
                                    onCambiar={(s) =>
                                      actualizarSeriesRecep(linea.id, s)
                                    }
                                    idBase={`recep-${linea.id}`}
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

                <fieldset className="space-y-4 rounded-md border border-borde bg-panel-alt p-4">
                  <legend className="px-1 text-sm font-medium text-texto">
                    Comprobante del proveedor (obligatorio)
                  </legend>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="tipo-documento" className="etiqueta-campo">
                        Tipo de comprobante
                      </label>
                      <SelectorBusqueda
                        id="tipo-documento"
                        valor={tipoDocumento}
                        onCambio={(v) => {
                          setTipoDocumento(v);
                          marcarTocado("rc-tipoDocumento");
                        }}
                        requerido
                        placeholder="Selecciona…"
                        opciones={COMPROBANTES_COMPRA.map((opcion) => ({
                          valor: opcion.codigo,
                          etiqueta: `${opcion.codigo} — ${opcion.etiqueta}`,
                        }))}
                      />
                      {(tocado["rc-tipoDocumento"] || intentoRecepcion) &&
                        erroresRecepcion.tipoDocumento && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresRecepcion.tipoDocumento}
                          </p>
                        )}
                    </div>
                    <div>
                      <label htmlFor="serie" className="etiqueta-campo">
                        Serie
                      </label>
                      <input
                        id="serie"
                        value={serie}
                        onChange={(e) => setSerie(e.target.value)}
                        onBlur={() => marcarTocado("rc-serie")}
                        required
                        placeholder="Ej. F001"
                        aria-invalid={
                          (tocado["rc-serie"] || intentoRecepcion) && erroresRecepcion.serie
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado["rc-serie"] || intentoRecepcion) && erroresRecepcion.serie && (
                        <p className="mt-1.5 text-xs text-peligro">{erroresRecepcion.serie}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="numero-comprobante" className="etiqueta-campo">
                        Número
                      </label>
                      <input
                        id="numero-comprobante"
                        value={numeroComprobante}
                        onChange={(e) => setNumeroComprobante(e.target.value)}
                        onBlur={() => marcarTocado("rc-numero")}
                        required
                        placeholder="Ej. 0001234"
                        aria-invalid={
                          (tocado["rc-numero"] || intentoRecepcion) &&
                          erroresRecepcion.numeroComprobante
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado["rc-numero"] || intentoRecepcion) &&
                        erroresRecepcion.numeroComprobante && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresRecepcion.numeroComprobante}
                          </p>
                        )}
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="fecha-emision" className="etiqueta-campo">
                        Fecha de emisión
                      </label>
                      <input
                        id="fecha-emision"
                        type="date"
                        value={fechaEmision}
                        onChange={(e) => setFechaEmision(e.target.value)}
                        onBlur={() => marcarTocado("rc-fecha")}
                        required
                        aria-invalid={
                          (tocado["rc-fecha"] || intentoRecepcion) &&
                          erroresRecepcion.fechaEmision
                            ? "true"
                            : undefined
                        }
                        className="campo"
                      />
                      {(tocado["rc-fecha"] || intentoRecepcion) &&
                        erroresRecepcion.fechaEmision && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresRecepcion.fechaEmision}
                          </p>
                        )}
                    </div>
                    <div>
                      <label htmlFor="guia-remision" className="etiqueta-campo">
                        Guía de remisión <span className="text-texto-ter">(opcional)</span>
                      </label>
                      <input
                        id="guia-remision"
                        value={guiaRemision}
                        onChange={(e) => setGuiaRemision(e.target.value)}
                        className="campo font-mono"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <label htmlFor="subtotal-recep" className="etiqueta-campo">
                        Subtotal
                      </label>
                      <input
                        id="subtotal-recep"
                        value={subtotalRecep}
                        onChange={(e) => setSubtotalRecep(e.target.value)}
                        onBlur={() => marcarTocado("rc-subtotal")}
                        inputMode="decimal"
                        required
                        aria-invalid={
                          (tocado["rc-subtotal"] || intentoRecepcion) &&
                          erroresRecepcion.subtotalRecep
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado["rc-subtotal"] || intentoRecepcion) &&
                        erroresRecepcion.subtotalRecep && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresRecepcion.subtotalRecep}
                          </p>
                        )}
                    </div>
                    <div>
                      <label htmlFor="igv-recep" className="etiqueta-campo">
                        IGV
                      </label>
                      <input
                        id="igv-recep"
                        value={igvRecep}
                        onChange={(e) => setIgvRecep(e.target.value)}
                        onBlur={() => marcarTocado("rc-igv")}
                        inputMode="decimal"
                        required
                        aria-invalid={
                          (tocado["rc-igv"] || intentoRecepcion) && erroresRecepcion.igvRecep
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado["rc-igv"] || intentoRecepcion) && erroresRecepcion.igvRecep && (
                        <p className="mt-1.5 text-xs text-peligro">
                          {erroresRecepcion.igvRecep}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="total-recep" className="etiqueta-campo">
                        Total
                      </label>
                      <input
                        id="total-recep"
                        value={totalRecep}
                        onChange={(e) => setTotalRecep(e.target.value)}
                        onBlur={() => marcarTocado("rc-total")}
                        inputMode="decimal"
                        required
                        aria-invalid={
                          (tocado["rc-total"] || intentoRecepcion) &&
                          erroresRecepcion.totalRecep
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado["rc-total"] || intentoRecepcion) &&
                        erroresRecepcion.totalRecep && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresRecepcion.totalRecep}
                          </p>
                        )}
                    </div>
                  </div>
                  <p className="text-xs text-texto-ter">
                    El subtotal debe coincidir con la suma de cantidades recibidas por su costo
                    en la orden (tolerancia de S/ 0.50).
                  </p>
                </fieldset>

                <button
                  type="submit"
                  disabled={guardandoRecepcion}
                  className="btn btn-primario"
                >
                  {guardandoRecepcion ? "Registrando…" : "Registrar recepción"}
                </button>
              </>
            )}
          </form>
        </section>
      )}

      {pestania === "recepcion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Recepciones registradas</span>
          </div>
          <div className="p-5">
            {cargandoRecepciones ? (
              <p className="py-8 text-center text-sm text-texto-ter">Cargando…</p>
            ) : recepciones.length === 0 ? (
              <p className="py-8 text-center text-sm text-texto-ter">
                Aún no hay recepciones registradas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="tabla-datos">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>OC</th>
                      <th>Proveedor</th>
                      <th>Comprobante</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recepciones.map((rec) => (
                      <tr
                        key={rec.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => void abrirDetalleRecepcion(rec.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void abrirDetalleRecepcion(rec.id);
                          }
                        }}
                        className="cursor-pointer hover:bg-panel-alt"
                      >
                        <td className="text-texto">{formatearFecha(rec.fecha)}</td>
                        <td className="font-mono text-texto-sec">
                          {rec.ordenCompraNumero}
                        </td>
                        <td className="text-tinta">{rec.proveedor}</td>
                        <td className="font-mono text-texto-sec">{rec.comprobante}</td>
                        <td className="text-right font-mono text-tinta">
                          {formatearPrecio(rec.total, rec.moneda)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      <PanelLateral
        abierto={detalleRecepcionId !== null}
        titulo={
          detalleRecepcion
            ? `${detalleRecepcion.tipoDocumentoSunat} ${detalleRecepcion.serieComprobante}-${detalleRecepcion.numeroComprobante}`
            : "Detalle de recepción"
        }
        descripcion={
          detalleRecepcion ? `OC ${detalleRecepcion.ordenCompraNumero}` : undefined
        }
        onCerrar={cerrarDetalleRecepcion}
      >
        {cargandoDetalleRecep ? (
          <p className="px-1 py-10 text-center text-sm text-texto-ter">Cargando…</p>
        ) : errorDetalleRecep ? (
          <div role="alert" className="aviso aviso-peligro">
            <span>{errorDetalleRecep}</span>
          </div>
        ) : detalleRecepcion ? (
          <DetalleRecepcionContenido detalle={detalleRecepcion} />
        ) : null}
      </PanelLateral>

      {pestania === "cotizaciones" && (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Cotizaciones por artículo</span>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-texto-sec">
                Selecciona un artículo para ver qué proveedores lo venden y a qué
                precio (último cotizado). Útil para elegir proveedor al crear una
                orden de compra.
              </p>
              <div className="max-w-xl">
                <label className="etiqueta-campo">Artículo (SKU)</label>
                <SelectorSku
                  valor={skuCotizacion}
                  onSeleccionar={(sku) => void cargarCotizaciones(sku)}
                  placeholder="Busca por código o nombre…"
                />
              </div>

              {avisoCotizacion && (
                <div
                  role={avisoCotizacion.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoCotizacion.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoCotizacion.texto}</span>
                </div>
              )}

              {skuCotizacion && (
                <div className="overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>Proveedor</th>
                        <th>RUC</th>
                        <th>Precio</th>
                        <th>Fecha</th>
                        <th>N° cotización</th>
                        <th>Ref. OC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cargandoCotizaciones ? (
                        <tr>
                          <td colSpan={6} className="text-texto-ter">
                            Cargando…
                          </td>
                        </tr>
                      ) : cotizaciones.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-texto-ter">
                            Este artículo aún no tiene cotizaciones registradas.
                          </td>
                        </tr>
                      ) : (
                        cotizaciones.map((cot, indice) => (
                          <tr key={cot.cotizacionId}>
                            <td className="text-tinta">
                              {cot.proveedorRazonSocial}
                              {indice === 0 && (
                                <span className="insignia insignia-exito ml-2">
                                  Mejor precio
                                </span>
                              )}
                            </td>
                            <td className="num">{cot.proveedorRuc}</td>
                            <td className="num font-semibold text-tinta">
                              {formatearPrecio(cot.precioUnitario, cot.moneda)}
                            </td>
                            <td className="text-texto-sec">
                              {new Date(cot.fechaCotizacion).toLocaleDateString("es-PE")}
                            </td>
                            <td className="text-texto-sec">
                              {cot.numeroCotizacion || "—"}
                            </td>
                            <td className="text-texto-sec">
                              {cot.ordenCompraRef || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {skuCotizacion && (
            <section className="panel">
              <div className="panel-cabecera">
                <span className="panel-titulo">
                  Registrar cotización para {skuCotizacion.codigoParlante}
                </span>
              </div>
              <form onSubmit={manejarCotizacion} className="space-y-4 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="proveedor-cot" className="etiqueta-campo">
                      Proveedor
                    </label>
                    <SelectorBusqueda
                      id="proveedor-cot"
                      valor={proveedorCot}
                      onCambio={(v) => {
                        setProveedorCot(v);
                        marcarTocado("cot-proveedor");
                      }}
                      disabled={cargandoBase}
                      requerido
                      placeholder={cargandoBase ? "Cargando…" : "Selecciona…"}
                      opciones={proveedores
                        .filter((p) => p.activo)
                        .map((proveedor) => ({
                          valor: String(proveedor.id),
                          etiqueta: `${proveedor.ruc} — ${proveedor.razonSocial}`,
                        }))}
                    />
                    {(tocado["cot-proveedor"] || intentoCotizacion) &&
                      erroresCotizacion.proveedorCot && (
                        <p className="mt-1.5 text-xs text-peligro">
                          {erroresCotizacion.proveedorCot}
                        </p>
                      )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="moneda-cot" className="etiqueta-campo">
                        Moneda
                      </label>
                      <select
                        id="moneda-cot"
                        value={monedaCot}
                        onChange={(e) => setMonedaCot(e.target.value as Moneda)}
                        className="campo"
                      >
                        <option value="PEN">PEN — Soles</option>
                        <option value="USD">USD — Dólares</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="precio-cot" className="etiqueta-campo">
                        Precio unitario
                      </label>
                      <input
                        id="precio-cot"
                        value={precioCot}
                        onChange={(e) => setPrecioCot(e.target.value)}
                        onBlur={() => marcarTocado("cot-precio")}
                        inputMode="decimal"
                        required
                        aria-invalid={
                          (tocado["cot-precio"] || intentoCotizacion) &&
                          erroresCotizacion.precioCot
                            ? "true"
                            : undefined
                        }
                        className="campo font-mono"
                      />
                      {(tocado["cot-precio"] || intentoCotizacion) &&
                        erroresCotizacion.precioCot && (
                          <p className="mt-1.5 text-xs text-peligro">
                            {erroresCotizacion.precioCot}
                          </p>
                        )}
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="fecha-cot" className="etiqueta-campo">
                      Fecha de cotización
                    </label>
                    <input
                      id="fecha-cot"
                      type="date"
                      value={fechaCot}
                      onChange={(e) => setFechaCot(e.target.value)}
                      onBlur={() => marcarTocado("cot-fecha")}
                      required
                      aria-invalid={
                        (tocado["cot-fecha"] || intentoCotizacion) &&
                        erroresCotizacion.fechaCot
                          ? "true"
                          : undefined
                      }
                      className="campo"
                    />
                    {(tocado["cot-fecha"] || intentoCotizacion) &&
                      erroresCotizacion.fechaCot && (
                        <p className="mt-1.5 text-xs text-peligro">
                          {erroresCotizacion.fechaCot}
                        </p>
                      )}
                  </div>
                  <div>
                    <label htmlFor="numero-cot" className="etiqueta-campo">
                      N° cotización <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="numero-cot"
                      value={numeroCot}
                      onChange={(e) => setNumeroCot(e.target.value)}
                      className="campo font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="ref-oc-cot" className="etiqueta-campo">
                      Ref. OC <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="ref-oc-cot"
                      value={refOcCot}
                      onChange={(e) => setRefOcCot(e.target.value)}
                      className="campo font-mono"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={guardandoCotizacion}
                  className="btn btn-primario"
                >
                  {guardandoCotizacion ? "Registrando…" : "Registrar cotización"}
                </button>
              </form>
            </section>
          )}
        </div>
      )}

      <ModalConfirmacion
        abierto={accionOrden !== null}
        titulo={accionOrden?.tipo === "aprobar" ? "Aprobar orden de compra" : "Anular orden de compra"}
        mensaje={
          accionOrden?.tipo === "aprobar"
            ? `¿Aprobar la orden ${accionOrden?.orden.numero}? Pasará a estado Emitida y podrá recibirse.`
            : `¿Anular la orden ${accionOrden?.orden.numero ?? ""}? Esta acción no se puede revertir.`
        }
        textoConfirmar={accionOrden?.tipo === "aprobar" ? "Aprobar" : "Anular"}
        tono={accionOrden?.tipo === "aprobar" ? "primario" : "peligro"}
        procesando={procesandoOrden}
        onConfirmar={() => void confirmarAccionOrden()}
        onCancelar={() => !procesandoOrden && setAccionOrden(null)}
      />
    </div>
  );
}

/** Sustituye nulos/vacíos por un guion largo para lectura consistente. */
function valorRecep(texto: string | null | undefined): string {
  return texto && texto.trim() !== "" ? texto : "—";
}

function FilaDatoRecep({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-texto-sec">{etiqueta}</dt>
      <dd className="text-right text-sm text-tinta">{children}</dd>
    </div>
  );
}

/** Contenido del panel de detalle de una recepción: cabecera + líneas. */
function DetalleRecepcionContenido({
  detalle,
}: {
  detalle: DetalleRecepcion;
}): React.JSX.Element {
  const moneda = detalle.moneda;
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-ter">
          Comprobante
        </h3>
        <dl className="divide-y divide-borde">
          <FilaDatoRecep etiqueta="Orden de compra">
            <span className="font-mono">{detalle.ordenCompraNumero}</span>
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Proveedor">{detalle.proveedor}</FilaDatoRecep>
          <FilaDatoRecep etiqueta="Tipo de documento">
            {detalle.tipoDocumentoSunat}
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Serie - número">
            <span className="font-mono">
              {detalle.serieComprobante}-{detalle.numeroComprobante}
            </span>
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Fecha de emisión">
            {formatearFecha(detalle.fechaEmisionDocumento)}
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Registrada">
            {formatearFecha(detalle.fecha)}
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Moneda">{moneda}</FilaDatoRecep>
          <FilaDatoRecep etiqueta="Tipo de cambio">
            {valorRecep(detalle.tipoCambio)}
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Guía de remisión">
            {valorRecep(detalle.guiaRemisionProveedor)}
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Registrada por">
            {detalle.usuario}
          </FilaDatoRecep>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-ter">
          Montos
        </h3>
        <dl className="divide-y divide-borde">
          <FilaDatoRecep etiqueta="Subtotal">
            <span className="font-mono">
              {formatearPrecio(detalle.subtotal, moneda)}
            </span>
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="IGV">
            <span className="font-mono">{formatearPrecio(detalle.igv, moneda)}</span>
          </FilaDatoRecep>
          <FilaDatoRecep etiqueta="Total">
            <span className="font-mono font-semibold">
              {formatearPrecio(detalle.total, moneda)}
            </span>
          </FilaDatoRecep>
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-ter">
          Líneas recibidas
        </h3>
        {detalle.lineas.length === 0 ? (
          <p className="text-sm text-texto-ter">Sin líneas registradas.</p>
        ) : (
          <div className="space-y-3">
            {detalle.lineas.map((linea) => (
              <div
                key={linea.skuId}
                className="rounded-md border border-borde p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-tinta">
                    {linea.skuNombre}
                  </span>
                  <span className="font-mono text-xs text-texto-ter">
                    {linea.skuCodigo}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-texto-sec">Cantidad</span>
                    <span className="font-mono text-texto">{linea.cantidad}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-texto-sec">Costo unit.</span>
                    <span className="font-mono text-texto">
                      {linea.costoUnitario
                        ? formatearPrecio(linea.costoUnitario, moneda)
                        : "—"}
                    </span>
                  </div>
                </div>
                {linea.series.length > 0 && (
                  <div className="mt-2">
                    <span className="text-xs text-texto-sec">Series</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {linea.series.map((serie) => (
                        <span
                          key={serie}
                          className="insignia insignia-neutra font-mono text-xs"
                        >
                          {serie}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
