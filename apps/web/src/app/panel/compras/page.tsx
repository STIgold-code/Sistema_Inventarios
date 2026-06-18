"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  actualizarProveedor,
  anularOrdenCompra,
  aprobarOrdenCompra,
  crearOrdenCompra,
  crearProveedor,
  crearRecepcion,
  desactivarProveedor,
  obtenerOrdenesCompra,
  obtenerProveedores,
  obtenerRequerimientos,
  type EstadoOrdenCompra,
  type OrdenCompra,
  type Proveedor,
  type Requerimiento,
  type Sku,
} from "@/lib/api";
import { COMPROBANTES_COMPRA } from "@/lib/comprobantes";
import { formatearSoles } from "@/lib/formato";

const ALMACEN_PRINCIPAL = 1;
const IGV_TASA = 0.18;

type Pestania = "proveedores" | "ordenes" | "recepcion";
type Moneda = "PEN" | "USD";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  costoUnitario: string;
}

interface RecepcionBorrador {
  [ordenCompraLineaId: number]: string;
}

interface FormProveedor {
  ruc: string;
  razonSocial: string;
  direccion: string;
  telefono: string;
  email: string;
  condicionPago: string;
  monedaHabitual: string;
  cci: string;
  contactoNombre: string;
  tipoDocIdentidad: string;
}

const PROVEEDOR_VACIO: FormProveedor = {
  ruc: "",
  razonSocial: "",
  direccion: "",
  telefono: "",
  email: "",
  condicionPago: "",
  monedaHabitual: "",
  cci: "",
  contactoNombre: "",
  tipoDocIdentidad: "",
};

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "proveedores", etiqueta: "Proveedores" },
  { id: "ordenes", etiqueta: "Órdenes de compra" },
  { id: "recepcion", etiqueta: "Recepción" },
];

const INSIGNIA_ESTADO: Record<EstadoOrdenCompra, string> = {
  BORRADOR: "insignia insignia-neutra",
  EMITIDA: "insignia insignia-info",
  PARCIAL: "insignia insignia-oro",
  COMPLETA: "insignia insignia-exito",
  ANULADA: "insignia insignia-peligro",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "", costoUnitario: "" };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function proveedorAForm(p: Proveedor): FormProveedor {
  return {
    ruc: p.ruc,
    razonSocial: p.razonSocial,
    direccion: p.direccion ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    condicionPago: p.condicionPago ?? "",
    monedaHabitual: p.monedaHabitual ?? "",
    cci: p.cci ?? "",
    contactoNombre: p.contactoNombre ?? "",
    tipoDocIdentidad: p.tipoDocIdentidad ?? "",
  };
}

export default function PaginaCompras(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("proveedores");

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Proveedores
  const [form, setForm] = useState<FormProveedor>(PROVEEDOR_VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardandoProveedor, setGuardandoProveedor] = useState<boolean>(false);
  const [avisoProveedor, setAvisoProveedor] = useState<Aviso | null>(null);
  const [proveedorADesactivar, setProveedorADesactivar] = useState<Proveedor | null>(null);
  const [desactivando, setDesactivando] = useState<boolean>(false);

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
  const [guardandoRecepcion, setGuardandoRecepcion] = useState<boolean>(false);
  const [avisoRecepcion, setAvisoRecepcion] = useState<Aviso | null>(null);

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

  async function refrescarProveedores(): Promise<void> {
    try {
      setProveedores(await obtenerProveedores());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
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

  // ── Proveedores ────────────────────────────────────────────────────────────

  function actualizarForm(campo: keyof FormProveedor, valor: string): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  function iniciarEdicion(proveedor: Proveedor): void {
    setEditandoId(proveedor.id);
    setForm(proveedorAForm(proveedor));
    setAvisoProveedor(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function cancelarEdicion(): void {
    setEditandoId(null);
    setForm(PROVEEDOR_VACIO);
    setAvisoProveedor(null);
  }

  async function manejarProveedor(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoProveedor(null);
    if (editandoId === null && !/^\d{11}$/.test(form.ruc)) {
      setAvisoProveedor({ texto: "El RUC debe tener 11 dígitos.", tono: "error" });
      return;
    }
    setGuardandoProveedor(true);
    try {
      const camposOpcionales = {
        razonSocial: form.razonSocial,
        direccion: form.direccion || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        condicionPago: form.condicionPago || undefined,
        monedaHabitual: form.monedaHabitual || undefined,
        cci: form.cci || undefined,
        contactoNombre: form.contactoNombre || undefined,
        tipoDocIdentidad: form.tipoDocIdentidad || undefined,
      };
      if (editandoId !== null) {
        await actualizarProveedor(editandoId, camposOpcionales);
        setAvisoProveedor({ texto: "Proveedor actualizado.", tono: "exito" });
      } else {
        const respuesta = await crearProveedor({ ruc: form.ruc, ...camposOpcionales });
        setAvisoProveedor({
          texto: `Proveedor registrado (#${respuesta.id}).`,
          tono: "exito",
        });
      }
      setEditandoId(null);
      setForm(PROVEEDOR_VACIO);
      await refrescarProveedores();
    } catch (error) {
      setAvisoProveedor({
        texto: mensajeError(error, "No se pudo guardar el proveedor."),
        tono: "error",
      });
    } finally {
      setGuardandoProveedor(false);
    }
  }

  async function confirmarDesactivacion(): Promise<void> {
    if (!proveedorADesactivar) return;
    setDesactivando(true);
    setAvisoProveedor(null);
    try {
      await desactivarProveedor(proveedorADesactivar.id);
      setAvisoProveedor({
        texto: `Proveedor ${proveedorADesactivar.razonSocial} desactivado.`,
        tono: "exito",
      });
      if (editandoId === proveedorADesactivar.id) cancelarEdicion();
      setProveedorADesactivar(null);
      await refrescarProveedores();
    } catch (error) {
      setAvisoProveedor({
        texto: mensajeError(error, "No se pudo desactivar el proveedor."),
        tono: "error",
      });
    } finally {
      setDesactivando(false);
    }
  }

  // ── Órdenes de compra ────────────────────────────────────────────────────────

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
    if (!proveedorOrden) {
      setAvisoOrden({ texto: "Selecciona un proveedor.", tono: "error" });
      return;
    }
    if (moneda === "USD" && (!tipoCambio.trim() || Number(tipoCambio) <= 0)) {
      setAvisoOrden({ texto: "Ingresa un tipo de cambio válido para dólares.", tono: "error" });
      return;
    }
    const lineasConDatos = lineas.filter((l) => l.cantidad && l.costoUnitario);
    if (lineasConDatos.length === 0) {
      setAvisoOrden({
        texto: "Agrega al menos una línea con SKU, cantidad y costo.",
        tono: "error",
      });
      return;
    }
    const lineasValidas = lineasConDatos.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null,
    );
    if (lineasValidas.length !== lineasConDatos.length) {
      setAvisoOrden({ texto: "Selecciona un producto en cada línea.", tono: "error" });
      return;
    }
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
  }

  async function manejarRecepcion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoRecepcion(null);
    if (!ordenSeleccionada) {
      setAvisoRecepcion({ texto: "Selecciona una orden de compra.", tono: "error" });
      return;
    }
    if (!tipoDocumento) {
      setAvisoRecepcion({ texto: "Selecciona el tipo de comprobante.", tono: "error" });
      return;
    }
    if (!serie.trim() || !numeroComprobante.trim() || !fechaEmision) {
      setAvisoRecepcion({
        texto: "Completa serie, número y fecha de emisión del comprobante.",
        tono: "error",
      });
      return;
    }
    if (!subtotalRecep.trim() || !igvRecep.trim() || !totalRecep.trim()) {
      setAvisoRecepcion({
        texto: "Completa subtotal, IGV y total del comprobante.",
        tono: "error",
      });
      return;
    }
    const lineasRecepcion = ordenSeleccionada.lineas
      .map((linea) => ({
        ordenCompraLineaId: linea.id,
        cantidad: recibidos[linea.id]?.trim() ?? "",
      }))
      .filter((l) => l.cantidad !== "" && Number(l.cantidad) > 0);
    if (lineasRecepcion.length === 0) {
      setAvisoRecepcion({
        texto: "Ingresa la cantidad recibida en al menos una línea.",
        tono: "error",
      });
      return;
    }
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
    } catch (error) {
      setAvisoRecepcion({
        texto: mensajeError(error, "No se pudo registrar la recepción."),
        tono: "error",
      });
    } finally {
      setGuardandoRecepcion(false);
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

      {pestania === "proveedores" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">
                {editandoId !== null ? "Editar proveedor" : "Nuevo proveedor"}
              </span>
            </div>
            <form onSubmit={manejarProveedor} className="space-y-4 p-5">
              {avisoProveedor && (
                <div
                  role={avisoProveedor.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoProveedor.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoProveedor.texto}</span>
                </div>
              )}
              <div>
                <label htmlFor="ruc" className="etiqueta-campo">
                  RUC
                </label>
                <input
                  id="ruc"
                  value={form.ruc}
                  onChange={(e) => actualizarForm("ruc", e.target.value)}
                  inputMode="numeric"
                  maxLength={11}
                  required
                  disabled={editandoId !== null}
                  className="campo font-mono disabled:opacity-60"
                />
                {editandoId !== null && (
                  <p className="mt-1.5 text-xs text-texto-ter">
                    El RUC no se puede modificar.
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="razon-social" className="etiqueta-campo">
                  Razón social
                </label>
                <input
                  id="razon-social"
                  value={form.razonSocial}
                  onChange={(e) => actualizarForm("razonSocial", e.target.value)}
                  required
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="direccion" className="etiqueta-campo">
                  Dirección <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="direccion"
                  value={form.direccion}
                  onChange={(e) => actualizarForm("direccion", e.target.value)}
                  className="campo"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="telefono" className="etiqueta-campo">
                    Teléfono <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="telefono"
                    value={form.telefono}
                    onChange={(e) => actualizarForm("telefono", e.target.value)}
                    inputMode="tel"
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="email-proveedor" className="etiqueta-campo">
                    Email <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="email-proveedor"
                    type="email"
                    value={form.email}
                    onChange={(e) => actualizarForm("email", e.target.value)}
                    className="campo"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="condicion-pago" className="etiqueta-campo">
                    Condición de pago <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="condicion-pago"
                    value={form.condicionPago}
                    onChange={(e) => actualizarForm("condicionPago", e.target.value)}
                    placeholder="Ej. Crédito 30 días"
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="moneda-habitual" className="etiqueta-campo">
                    Moneda habitual <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <select
                    id="moneda-habitual"
                    value={form.monedaHabitual}
                    onChange={(e) => actualizarForm("monedaHabitual", e.target.value)}
                    className="campo"
                  >
                    <option value="">Sin definir</option>
                    <option value="PEN">PEN — Soles</option>
                    <option value="USD">USD — Dólares</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="cci" className="etiqueta-campo">
                    CCI <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="cci"
                    value={form.cci}
                    onChange={(e) => actualizarForm("cci", e.target.value)}
                    inputMode="numeric"
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="tipo-doc-identidad" className="etiqueta-campo">
                    Tipo doc. identidad <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <select
                    id="tipo-doc-identidad"
                    value={form.tipoDocIdentidad}
                    onChange={(e) => actualizarForm("tipoDocIdentidad", e.target.value)}
                    className="campo"
                  >
                    <option value="">Sin definir</option>
                    <option value="6">RUC</option>
                    <option value="1">DNI</option>
                    <option value="4">Carnet de extranjería</option>
                    <option value="7">Pasaporte</option>
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="contacto-nombre" className="etiqueta-campo">
                  Nombre de contacto <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="contacto-nombre"
                  value={form.contactoNombre}
                  onChange={(e) => actualizarForm("contactoNombre", e.target.value)}
                  className="campo"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={guardandoProveedor}
                  className="btn btn-primario"
                >
                  {guardandoProveedor
                    ? "Guardando…"
                    : editandoId !== null
                      ? "Guardar cambios"
                      : "Registrar proveedor"}
                </button>
                {editandoId !== null && (
                  <button type="button" onClick={cancelarEdicion} className="btn btn-contorno">
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Proveedores registrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>RUC</th>
                    <th>Razón social</th>
                    <th>Contacto</th>
                    <th>Condición</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoBase ? (
                    <tr>
                      <td colSpan={6} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : proveedores.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-texto-ter">
                        Sin proveedores registrados.
                      </td>
                    </tr>
                  ) : (
                    proveedores.map((proveedor) => (
                      <tr key={proveedor.id}>
                        <td className="num">{proveedor.ruc}</td>
                        <td className="text-tinta">{proveedor.razonSocial}</td>
                        <td className="text-texto-sec">
                          {proveedor.contactoNombre || proveedor.telefono || "—"}
                        </td>
                        <td className="text-texto-sec">{proveedor.condicionPago || "—"}</td>
                        <td>
                          <span
                            className={`insignia ${
                              proveedor.activo ? "insignia-exito" : "insignia-neutra"
                            }`}
                          >
                            {proveedor.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => iniciarEdicion(proveedor)}
                              className="btn btn-contorno h-8"
                            >
                              Editar
                            </button>
                            {proveedor.activo && (
                              <button
                                type="button"
                                onClick={() => setProveedorADesactivar(proveedor)}
                                className="btn btn-peligro h-8"
                              >
                                Desactivar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

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
                <select
                  id="requerimiento-origen"
                  value={requerimientoOrigen}
                  onChange={(e) => aplicarRequerimiento(e.target.value)}
                  disabled={cargandoBase}
                  className="campo"
                >
                  <option value="">Sin requerimiento de origen</option>
                  {requerimientosAprobados.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.numero} — {req.centroCosto}
                    </option>
                  ))}
                </select>
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
                  <select
                    id="proveedor-orden"
                    value={proveedorOrden}
                    onChange={(e) => setProveedorOrden(e.target.value)}
                    disabled={cargandoBase}
                    required
                    className="campo"
                  >
                    <option value="">{cargandoBase ? "Cargando…" : "Selecciona…"}</option>
                    {proveedores
                      .filter((p) => p.activo)
                      .map((proveedor) => (
                        <option key={proveedor.id} value={proveedor.id}>
                          {proveedor.ruc} — {proveedor.razonSocial}
                        </option>
                      ))}
                  </select>
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
                        inputMode="decimal"
                        className="campo font-mono"
                      />
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

                {lineas.map((linea, indice) => (
                  <div
                    key={indice}
                    className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <div>
                      <label htmlFor={`linea-sku-${indice}`} className="etiqueta-campo">
                        SKU
                      </label>
                      <SelectorSku
                        valor={linea.sku}
                        onSeleccionar={(sku) => actualizarLinea(indice, { sku })}
                        placeholder="Busca por código o nombre…"
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
                      <label htmlFor={`linea-costo-${indice}`} className="etiqueta-campo">
                        Costo unitario
                      </label>
                      <input
                        id={`linea-costo-${indice}`}
                        value={linea.costoUnitario}
                        onChange={(e) =>
                          actualizarLinea(indice, { costoUnitario: e.target.value })
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
              <select
                id="orden-recepcion"
                value={ordenRecepcion}
                onChange={(e) => {
                  setOrdenRecepcion(e.target.value);
                  limpiarRecepcion();
                  setAvisoRecepcion(null);
                }}
                disabled={cargandoBase}
                className="campo"
              >
                <option value="">
                  {cargandoBase ? "Cargando…" : "Selecciona una orden pendiente…"}
                </option>
                {ordenesRecepcionables.map((orden) => (
                  <option key={orden.id} value={orden.id}>
                    {orden.numero} — {orden.proveedor} ({orden.estado})
                  </option>
                ))}
              </select>
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
                              value={recibidos[linea.id] ?? ""}
                              onChange={(e) => actualizarRecibido(linea.id, e.target.value)}
                              inputMode="decimal"
                              disabled={Number(linea.pendiente) <= 0}
                              aria-label={`Cantidad a recibir de ${linea.nombreSku}`}
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
                    Comprobante del proveedor (obligatorio)
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
                        {COMPROBANTES_COMPRA.map((opcion) => (
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
                        required
                        className="campo"
                      />
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
                        inputMode="decimal"
                        required
                        className="campo font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="igv-recep" className="etiqueta-campo">
                        IGV
                      </label>
                      <input
                        id="igv-recep"
                        value={igvRecep}
                        onChange={(e) => setIgvRecep(e.target.value)}
                        inputMode="decimal"
                        required
                        className="campo font-mono"
                      />
                    </div>
                    <div>
                      <label htmlFor="total-recep" className="etiqueta-campo">
                        Total
                      </label>
                      <input
                        id="total-recep"
                        value={totalRecep}
                        onChange={(e) => setTotalRecep(e.target.value)}
                        inputMode="decimal"
                        required
                        className="campo font-mono"
                      />
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

      <ModalConfirmacion
        abierto={proveedorADesactivar !== null}
        titulo="Desactivar proveedor"
        mensaje={`¿Desactivar a ${proveedorADesactivar?.razonSocial ?? ""}? No podrás usarlo en nuevas órdenes de compra.`}
        textoConfirmar="Desactivar"
        tono="peligro"
        procesando={desactivando}
        onConfirmar={() => void confirmarDesactivacion()}
        onCancelar={() => !desactivando && setProveedorADesactivar(null)}
      />

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
