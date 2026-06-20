import type {
  LoginInput,
  RespuestaLogin,
  RespuestaPaginada,
} from "@bm/contratos";
import { leerToken } from "./sesion";

const URL_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4021";

/** Error de API que conserva el mensaje del backend y el codigo HTTP. */
export class ErrorApi extends Error {
  readonly estado: number;

  constructor(mensaje: string, estado: number) {
    super(mensaje);
    this.name = "ErrorApi";
    this.estado = estado;
  }
}

interface CuerpoError {
  message?: string | string[];
}

function extraerMensaje(cuerpo: CuerpoError | null, estado: number): string {
  if (cuerpo?.message) {
    return Array.isArray(cuerpo.message)
      ? cuerpo.message.join(", ")
      : cuerpo.message;
  }
  return `Error de servidor (${estado})`;
}

/**
 * Wrapper de fetch que inyecta el Bearer token desde localStorage, parsea
 * JSON y lanza `ErrorApi` con el mensaje del backend ante respuestas no OK.
 */
export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const token = leerToken();
  const cabeceras = new Headers(opts.headers);
  cabeceras.set("Content-Type", "application/json");
  if (token) cabeceras.set("Authorization", `Bearer ${token}`);

  const respuesta = await fetch(`${URL_BASE}${path}`, {
    ...opts,
    headers: cabeceras,
  });

  if (!respuesta.ok) {
    let cuerpo: CuerpoError | null = null;
    try {
      cuerpo = (await respuesta.json()) as CuerpoError;
    } catch {
      cuerpo = null;
    }
    throw new ErrorApi(extraerMensaje(cuerpo, respuesta.status), respuesta.status);
  }

  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

/** Autentica contra POST /auth/login. No usa apiFetch porque no requiere token. */
export async function login(datos: LoginInput): Promise<RespuestaLogin> {
  const respuesta = await fetch(`${URL_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  });

  if (!respuesta.ok) {
    let cuerpo: CuerpoError | null = null;
    try {
      cuerpo = (await respuesta.json()) as CuerpoError;
    } catch {
      cuerpo = null;
    }
    throw new ErrorApi(
      extraerMensaje(cuerpo, respuesta.status),
      respuesta.status,
    );
  }

  return (await respuesta.json()) as RespuestaLogin;
}

// ── Tipos de respuesta de la API ───────────────────────────────────────────

export interface Familia {
  id: number;
  codigo: string;
  nombre: string;
}

export interface Unidad {
  id: number;
  codigo: string;
  nombre: string;
}

export interface Sku {
  id: number;
  codigoParlante: string;
  nombre: string | null;
  producto: { id: string; nombre: string; activo: boolean };
  familia: { id: string; codigo: string; nombre: string };
  unidad: { id: string; codigo: string; nombre: string };
  /** Unidad de referencia para multi-unidad (null si el SKU no la tiene). */
  unidadReferencia: { id: string; codigo: string; nombre: string } | null;
  /** Cuantas unidades de control equivalen a UNA de referencia (null si no aplica). */
  factorConversion: string | null;
  /** Si true, el SKU exige captura de numeros de serie en entradas y salidas. */
  controlaSerie: boolean;
  /** Precio de venta nivel 1 (publico). Null si no esta configurado. */
  precioPublico: string | null;
  /** Precio de venta nivel 2 (distribuidor). Null si no esta configurado. */
  precioDistribuidor: string | null;
  /** Moneda de los precios de venta (ISO-4217: PEN, USD). Null si no aplica. */
  monedaVenta: string | null;
}

export interface CrearProductoInput {
  familiaId: number;
  nombre: string;
  codigoParlante: string;
  unidadId: number;
  codigoUnspsc?: string;
  nombreSku?: string;
  tipoExistencia?: string;
  metodoValuacion?: string;
  stockMinimo?: string;
  stockMaximo?: string;
  puntoReposicion?: string;
  semanasReposicion?: number;
  /** Unidad de referencia para multi-unidad (va junto con factorConversion). */
  unidadReferenciaId?: number;
  /** Cuantas unidades de control equivalen a UNA de referencia (decimal > 0). */
  factorConversion?: string;
  /** Precio de venta nivel 1 (publico). Decimal positivo en texto. */
  precioPublico?: string;
  /** Precio de venta nivel 2 (distribuidor). Decimal positivo en texto. */
  precioDistribuidor?: string;
  /** Moneda de los precios de venta (ISO-4217: PEN, USD). */
  monedaVenta?: string;
}

export interface CrearProductoRespuesta {
  productoId: number;
  skuId: number;
}

export interface AjusteInput {
  skuId: number;
  almacenId: number;
  incremento: boolean;
  cantidad: string;
  observaciones?: string;
}

export interface MermaInput {
  skuId: number;
  almacenId: number;
  cantidad: string;
  observaciones?: string;
}

export interface MovimientoRespuesta {
  movimientoId: number;
}

export interface StockSku {
  skuId: number;
  almacenId: number;
  cantidadDisponible: string;
  cantidadComprometida: string;
  costoPromedio: string;
}

export interface FilaKardex {
  fecha: string;
  almacen: string;
  tipo: string;
  tipoOperacionSunat: string;
  cantidad: string;
  costoUnitario: string;
  costoTotal: string;
  saldoCantidad: string;
  saldoCostoUnitario: string;
  saldoCostoTotal: string;
  /** Costo unitario en USD del movimiento (null si no habia TC ese dia). */
  costoUnitarioUsd: string | null;
  /** Costo total en USD del movimiento (null si no habia TC ese dia). */
  costoTotalUsd: string | null;
  documento: string;
}

// ── Funciones de dominio ────────────────────────────────────────────────────

export function obtenerFamilias(): Promise<Familia[]> {
  return apiFetch<Familia[]>("/productos/familias");
}

export function obtenerUnidades(): Promise<Unidad[]> {
  return apiFetch<Unidad[]>("/productos/unidades");
}

export function obtenerSkus(
  pagina: number,
  porPagina: number,
  busqueda: string,
): Promise<RespuestaPaginada<Sku>> {
  const params = new URLSearchParams({
    pagina: String(pagina),
    porPagina: String(porPagina),
    busqueda,
  });
  return apiFetch<RespuestaPaginada<Sku>>(`/productos/skus?${params.toString()}`);
}

export function crearProducto(
  datos: CrearProductoInput,
): Promise<CrearProductoRespuesta> {
  return apiFetch<CrearProductoRespuesta>("/productos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function registrarAjuste(datos: AjusteInput): Promise<MovimientoRespuesta> {
  return apiFetch<MovimientoRespuesta>("/inventario/ajustes", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function registrarMerma(datos: MermaInput): Promise<MovimientoRespuesta> {
  return apiFetch<MovimientoRespuesta>("/inventario/mermas", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Traslados entre almacenes ───────────────────────────────────────────────

export type EstadoTraslado = "PENDIENTE" | "EN_TRANSITO" | "RECIBIDO" | "ANULADO";

export interface LineaTraslado {
  id: number;
  skuId: number;
  codigoSku: string;
  nombreSku: string;
  cantidad: string;
  cantidadDespachada: string;
  cantidadRecibida: string;
}

export interface Traslado {
  id: number;
  numero: string;
  estado: EstadoTraslado;
  origen: string;
  destino: string;
  lineas: LineaTraslado[];
}

export interface CrearTrasladoInput {
  almacenOrigenId: number;
  almacenDestinoId: number;
  numero: string;
  observaciones?: string;
  lineas: Array<{ skuId: number; cantidad: string }>;
}

export function obtenerTraslados(): Promise<Traslado[]> {
  return apiFetch<Traslado[]>("/traslados");
}

export function crearTraslado(datos: CrearTrasladoInput): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/traslados", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function despacharTraslado(id: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/traslados/${id}/despachar`, { method: "POST" });
}

export function recibirTraslado(
  id: number,
  lineas: Array<{ trasladoLineaId: number; cantidadRecibida: string }>,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/traslados/${id}/recibir`, {
    method: "POST",
    body: JSON.stringify({ lineas }),
  });
}

export function anularTraslado(id: number): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/traslados/${id}/anular`, { method: "POST" });
}

export function obtenerStock(skuId: number): Promise<StockSku[]> {
  return apiFetch<StockSku[]>(`/inventario/stock?skuId=${skuId}`);
}

export interface Almacen {
  id: string;
  codigo: string;
  nombre: string;
}

export function obtenerAlmacenes(): Promise<Almacen[]> {
  return apiFetch<Almacen[]>("/inventario/almacenes");
}

// ── Existencias (stock de todos los SKUs por almacén) ────────────────────────

export interface StockEnAlmacen {
  almacenId: string;
  disponible: string;
  comprometido: string;
}

export interface ExistenciaSku {
  skuId: string;
  codigoParlante: string;
  nombre: string;
  unidad: string;
  stockMinimo: string | null;
  stocks: StockEnAlmacen[];
  totalDisponible: string;
  totalComprometido: string;
}

export interface ExistenciasRespuesta {
  datos: ExistenciaSku[];
  total: number;
  pagina: number;
  porPagina: number;
  almacenes: Almacen[];
}

export function obtenerExistencias(parametros: {
  pagina?: number;
  porPagina?: number;
  busqueda?: string;
  almacenId?: number;
}): Promise<ExistenciasRespuesta> {
  const query = new URLSearchParams();
  if (parametros.pagina) query.set("pagina", String(parametros.pagina));
  if (parametros.porPagina) query.set("porPagina", String(parametros.porPagina));
  if (parametros.busqueda) query.set("busqueda", parametros.busqueda);
  if (parametros.almacenId) query.set("almacenId", String(parametros.almacenId));
  const cadena = query.toString();
  return apiFetch<ExistenciasRespuesta>(
    `/inventario/existencias${cadena ? `?${cadena}` : ""}`,
  );
}

// ── Gestión de almacenes y sucursales ───────────────────────────────────────

export interface Sucursal {
  id: string;
  codigo: string;
  nombre: string;
}

export interface AlmacenDetalle {
  id: string;
  codigo: string;
  nombre: string;
  sucursal: string;
  sucursalId: string;
}

export function obtenerSucursales(): Promise<Sucursal[]> {
  return apiFetch<Sucursal[]>("/almacenes/sucursales");
}

export function crearSucursal(datos: { codigo: string; nombre: string }): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/almacenes/sucursales", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function obtenerAlmacenesDetalle(): Promise<AlmacenDetalle[]> {
  return apiFetch<AlmacenDetalle[]>("/almacenes");
}

export function crearAlmacen(datos: {
  sucursalId: number;
  codigo: string;
  nombre: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/almacenes", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/** Kardex de un SKU. Si almacenId es null, trae todos los almacenes (consolidado). */
export function obtenerKardex(
  skuId: number,
  almacenId: number | null,
): Promise<FilaKardex[]> {
  const params = new URLSearchParams({ skuId: String(skuId) });
  if (almacenId !== null) params.set("almacenId", String(almacenId));
  return apiFetch<FilaKardex[]>(`/inventario/kardex?${params.toString()}`);
}

// ── Centros de costo ──────────────────────────────────────────────────────

export interface CentroCosto {
  id: number;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export function obtenerCentrosCosto(): Promise<CentroCosto[]> {
  return apiFetch<CentroCosto[]>("/centros-costo");
}

// ── Requerimientos: tipos ───────────────────────────────────────────────────

export type EstadoRequerimiento =
  | "BORRADOR"
  | "APROBADO"
  | "RECHAZADO"
  | "CONVERTIDO";

export interface LineaRequerimiento {
  id: number;
  skuId: number;
  cantidad: string;
  justificacion: string | null;
}

export interface Requerimiento {
  id: number;
  numero: string;
  fecha: string;
  estado: EstadoRequerimiento;
  centroCostoId: number;
  centroCosto: string;
  solicitanteId: number;
  solicitante: string;
  aprobadoPorId: number | null;
  observaciones: string | null;
  lineas: LineaRequerimiento[];
}

export interface CrearRequerimientoLineaInput {
  skuId: number;
  cantidad: string;
  justificacion?: string;
}

export interface CrearRequerimientoInput {
  centroCostoId: number;
  observaciones?: string;
  lineas: CrearRequerimientoLineaInput[];
}

// ── Requerimientos: funciones de dominio ────────────────────────────────────

export function obtenerRequerimientos(): Promise<Requerimiento[]> {
  return apiFetch<Requerimiento[]>("/requerimientos");
}

export function crearRequerimiento(
  datos: CrearRequerimientoInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/requerimientos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function aprobarRequerimiento(
  id: number,
): Promise<{ id: number; estado: EstadoRequerimiento }> {
  return apiFetch<{ id: number; estado: EstadoRequerimiento }>(
    `/requerimientos/${id}/aprobar`,
    { method: "POST" },
  );
}

export function rechazarRequerimiento(
  id: number,
): Promise<{ id: number; estado: EstadoRequerimiento }> {
  return apiFetch<{ id: number; estado: EstadoRequerimiento }>(
    `/requerimientos/${id}/rechazar`,
    { method: "POST" },
  );
}

// ── Vales de salida (hoja de cargo): tipos ──────────────────────────────────

export type EstadoValeSalida =
  | "BORRADOR"
  | "AUTORIZADO"
  | "DESPACHADO"
  | "ANULADO";

export interface LineaValeSalida {
  id: number;
  skuId: number;
  codigoSku: string;
  nombreSku: string;
  /** Si true, el SKU exige seleccionar numeros de serie al despachar. */
  controlaSerie: boolean;
  cantidad: string;
  cantidadDespachada: string;
  observacion: string | null;
  movimientoStockId: number | null;
}

export interface ValeSalida {
  id: number;
  numero: string;
  fecha: string;
  estado: EstadoValeSalida;
  almacenId: number;
  almacen: string;
  centroCostoId: number;
  centroCosto: string;
  destino: string;
  solicitanteId: number;
  solicitante: string;
  autorizadoPorId: number | null;
  autorizadoPor: string | null;
  ordenTrabajoId: string | null;
  ordenTrabajo: string | null;
  observaciones: string | null;
  lineas: LineaValeSalida[];
}

export interface CrearValeLineaInput {
  skuId: number;
  cantidad: string;
  observacion?: string;
  /** Si true, la cantidad esta en unidad de referencia y se convertira a control. */
  enUnidadReferencia?: boolean;
}

export interface CrearValeInput {
  almacenId: number;
  centroCostoId: number;
  destino: string;
  ordenTrabajoId?: number;
  observaciones?: string;
  lineas: CrearValeLineaInput[];
}

// ── Vales de salida: funciones de dominio ───────────────────────────────────

export function obtenerVales(): Promise<ValeSalida[]> {
  return apiFetch<ValeSalida[]>("/vales");
}

export function crearVale(datos: CrearValeInput): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/vales", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function autorizarVale(
  id: number,
): Promise<{ id: number; estado: EstadoValeSalida }> {
  return apiFetch<{ id: number; estado: EstadoValeSalida }>(
    `/vales/${id}/autorizar`,
    { method: "POST" },
  );
}

/** Series por SKU a despachar (solo para SKUs que controlan serie). */
export interface SeriesPorSku {
  skuId: number;
  numerosSerie: string[];
}

export function despacharVale(
  id: number,
  series?: SeriesPorSku[],
): Promise<{ id: number; estado: EstadoValeSalida }> {
  const body =
    series && series.length > 0 ? JSON.stringify({ series }) : undefined;
  return apiFetch<{ id: number; estado: EstadoValeSalida }>(
    `/vales/${id}/despachar`,
    { method: "POST", body },
  );
}

export function anularVale(
  id: number,
): Promise<{ id: number; estado: EstadoValeSalida }> {
  return apiFetch<{ id: number; estado: EstadoValeSalida }>(
    `/vales/${id}/anular`,
    { method: "POST" },
  );
}

// ── Órdenes de trabajo: tipos ───────────────────────────────────────────────

export type EstadoOrdenTrabajo = "ABIERTA" | "CERRADA";

export interface OrdenTrabajo {
  id: number;
  numero: string;
  descripcion: string;
  estado: EstadoOrdenTrabajo;
  centroCostoId: number;
  centroCosto: string | null;
  fechaApertura: string;
  fechaCierre: string | null;
}

export interface CrearOrdenTrabajoInput {
  descripcion: string;
  centroCostoId: number;
}

export interface ActualizarOrdenTrabajoInput {
  descripcion?: string;
  centroCostoId?: number;
}

// ── Órdenes de trabajo: funciones de dominio ────────────────────────────────

export function obtenerOrdenesTrabajo(): Promise<OrdenTrabajo[]> {
  return apiFetch<OrdenTrabajo[]>("/ordenes-trabajo");
}

export function crearOrdenTrabajo(
  datos: CrearOrdenTrabajoInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/ordenes-trabajo", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarOrdenTrabajo(
  id: number,
  datos: ActualizarOrdenTrabajoInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/ordenes-trabajo/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function cerrarOrdenTrabajo(
  id: number,
): Promise<{ id: number; estado: EstadoOrdenTrabajo }> {
  return apiFetch<{ id: number; estado: EstadoOrdenTrabajo }>(
    `/ordenes-trabajo/${id}/cerrar`,
    { method: "POST" },
  );
}

// ── Clientes: tipos ─────────────────────────────────────────────────────────

export interface Cliente {
  id: number;
  tipoDocIdentidad: string;
  numeroDoc: string;
  razonSocial: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  /** Nivel de precio de venta aplicado al cliente (1=publico, 2=distribuidor, 3, 4). */
  tipoPrecio?: number | null;
}

export interface CrearClienteInput {
  tipoDocIdentidad?: string;
  numeroDoc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  /** Nivel de precio de venta (1=publico, 2=distribuidor, 3, 4). */
  tipoPrecio?: number;
}

/** Mismos campos que CrearClienteInput, todos opcionales para edicion parcial. */
export type ActualizarClienteInput = Partial<CrearClienteInput>;

export interface CrearClienteRespuesta {
  id: number;
}

// ── Clientes: funciones de dominio ──────────────────────────────────────────

export function obtenerClientes(): Promise<Cliente[]> {
  return apiFetch<Cliente[]>("/clientes");
}

export function crearCliente(
  datos: CrearClienteInput,
): Promise<CrearClienteRespuesta> {
  return apiFetch<CrearClienteRespuesta>("/clientes", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarCliente(
  id: number,
  datos: ActualizarClienteInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/clientes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function desactivarCliente(
  id: number,
): Promise<{ id: number; activo: false }> {
  return apiFetch<{ id: number; activo: false }>(
    `/clientes/${id}/desactivar`,
    { method: "POST" },
  );
}

// ── Compras: tipos ──────────────────────────────────────────────────────────

export interface Proveedor {
  id: number;
  ruc: string;
  razonSocial: string;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
  condicionPago?: string | null;
  monedaHabitual?: string | null;
  cci?: string | null;
  contactoNombre?: string | null;
  tipoDocIdentidad?: string | null;
  activo: boolean;
}

export interface CrearProveedorInput {
  ruc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  condicionPago?: string;
  monedaHabitual?: string;
  cci?: string;
  contactoNombre?: string;
  tipoDocIdentidad?: string;
}

/** Mismos campos que CrearProveedorInput pero sin RUC (no editable). */
export type ActualizarProveedorInput = Omit<CrearProveedorInput, "ruc">;

export interface CrearProveedorRespuesta {
  id: number;
}

export type EstadoOrdenCompra =
  | "BORRADOR"
  | "EMITIDA"
  | "PARCIAL"
  | "COMPLETA"
  | "ANULADA";

export interface LineaOrdenCompra {
  id: number;
  skuId: number;
  codigoSku: string;
  nombreSku: string;
  /** Si true, el SKU exige captura de numeros de serie al recibir. */
  controlaSerie: boolean;
  cantidad: string;
  costoUnitario: string;
  cantidadRecibida: string;
  pendiente: string;
}

export interface OrdenCompra {
  id: number;
  numero: string;
  estado: EstadoOrdenCompra;
  proveedor: string;
  proveedorId: number;
  almacenId: number;
  requerimientoId?: number | null;
  moneda: string;
  tipoCambio?: string | null;
  subtotal: string;
  igv: string;
  total: string;
  fechaEmision: string;
  observaciones?: string | null;
  lineas: LineaOrdenCompra[];
}

export interface CrearOrdenCompraLineaInput {
  skuId: number;
  cantidad: string;
  costoUnitario: string;
  /** Si true, cantidad y costo estan en unidad de referencia y se convertiran a control. */
  enUnidadReferencia?: boolean;
}

export interface CrearOrdenCompraInput {
  proveedorId: number;
  almacenId: number;
  requerimientoId?: number;
  moneda?: string;
  tipoCambio?: string;
  observaciones?: string;
  lineas: CrearOrdenCompraLineaInput[];
}

export interface CrearOrdenCompraRespuesta {
  id: number;
  numero: string;
  estado: EstadoOrdenCompra;
  subtotal: string;
  igv: string;
  total: string;
}

export interface CrearRecepcionLineaInput {
  ordenCompraLineaId: number;
  cantidad: string;
  /** Numeros de serie a registrar. Obligatorio si el SKU controla serie. */
  numerosSerie?: string[];
}

export interface CrearRecepcionInput {
  ordenCompraId: number;
  tipoDocumentoSunat: string;
  serieComprobante: string;
  numeroComprobante: string;
  fechaEmisionDocumento: string;
  moneda?: string;
  tipoCambio?: string;
  subtotal: string;
  igv: string;
  total: string;
  guiaRemisionProveedor?: string;
  lineas: CrearRecepcionLineaInput[];
}

export interface CrearRecepcionRespuesta {
  recepcionId: number;
}

// ── Compras: funciones de dominio ───────────────────────────────────────────

export function obtenerProveedores(): Promise<Proveedor[]> {
  return apiFetch<Proveedor[]>("/compras/proveedores");
}

export function crearProveedor(
  datos: CrearProveedorInput,
): Promise<CrearProveedorRespuesta> {
  return apiFetch<CrearProveedorRespuesta>("/compras/proveedores", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarProveedor(
  id: number,
  datos: ActualizarProveedorInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/compras/proveedores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function desactivarProveedor(
  id: number,
): Promise<{ id: number; activo: false }> {
  return apiFetch<{ id: number; activo: false }>(
    `/compras/proveedores/${id}/desactivar`,
    { method: "POST" },
  );
}

export function obtenerOrdenesCompra(): Promise<OrdenCompra[]> {
  return apiFetch<OrdenCompra[]>("/compras/ordenes");
}

export function crearOrdenCompra(
  datos: CrearOrdenCompraInput,
): Promise<CrearOrdenCompraRespuesta> {
  return apiFetch<CrearOrdenCompraRespuesta>("/compras/ordenes", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function aprobarOrdenCompra(
  id: number,
): Promise<{ id: number; estado: EstadoOrdenCompra }> {
  return apiFetch<{ id: number; estado: EstadoOrdenCompra }>(
    `/compras/ordenes/${id}/aprobar`,
    { method: "POST" },
  );
}

export function anularOrdenCompra(
  id: number,
): Promise<{ id: number; estado: EstadoOrdenCompra }> {
  return apiFetch<{ id: number; estado: EstadoOrdenCompra }>(
    `/compras/ordenes/${id}/anular`,
    { method: "POST" },
  );
}

export function crearRecepcion(
  datos: CrearRecepcionInput,
): Promise<CrearRecepcionRespuesta> {
  return apiFetch<CrearRecepcionRespuesta>("/compras/recepciones", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Ventas: tipos ─────────────────────────────────────────────────────────────

export type EstadoOrdenVenta = "PENDIENTE" | "PARCIAL" | "DESPACHADA" | "ANULADA";

export interface LineaOrdenVenta {
  id: number;
  skuId: number;
  codigoSku: string;
  nombreSku: string;
  /** Si true, el SKU exige seleccionar numeros de serie al despachar. */
  controlaSerie: boolean;
  cantidad: string;
  cantidadDespachada: string;
  pendiente: string;
}

export interface OrdenVenta {
  id: number;
  numero: string;
  /** Razon social del cliente del maestro o texto libre legacy. */
  cliente: string | null;
  clienteId?: string | null;
  estado: EstadoOrdenVenta;
  moneda: string;
  tipoCambio?: string | null;
  subtotal: string;
  igv: string;
  total: string;
  lineas: LineaOrdenVenta[];
}

export interface CrearOrdenVentaLineaInput {
  skuId: number;
  cantidad: string;
  precioUnitario?: string;
  /** Si true, cantidad y precio estan en unidad de referencia y se convertiran a control. */
  enUnidadReferencia?: boolean;
}

export interface CrearOrdenVentaInput {
  almacenId: number;
  numero: string;
  /** Cliente del maestro (preferido). */
  clienteId?: number;
  moneda?: string;
  tipoCambio?: string;
  observaciones?: string;
  lineas: CrearOrdenVentaLineaInput[];
}

export interface CrearOrdenVentaRespuesta {
  id: number;
  numero: string;
  subtotal: string;
  igv: string;
  total: string;
}

export interface CrearDespachoLineaInput {
  ordenVentaLineaId: number;
  cantidad: string;
  /** Numeros de serie a despachar. Obligatorio si el SKU controla serie. */
  numerosSerie?: string[];
}

/** Comprobante de venta. OBLIGATORIO al despachar (sustento SUNAT). */
export interface ComprobanteVentaInput {
  tipoDocumentoSunat: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  moneda?: string;
  tipoCambio?: string;
  subtotal: string;
  igv: string;
  total: string;
}

export interface CrearDespachoInput {
  ordenVentaId: number;
  comprobante: ComprobanteVentaInput;
  lineas: CrearDespachoLineaInput[];
}

export interface CrearDespachoRespuesta {
  ok: true;
  comprobanteId: string;
}

export interface AnularOrdenVentaRespuesta {
  ok: true;
}

// ── Ventas: funciones de dominio ────────────────────────────────────────────

export function obtenerOrdenesVenta(): Promise<OrdenVenta[]> {
  return apiFetch<OrdenVenta[]>("/ventas/ordenes");
}

export interface PrecioSugerido {
  skuId: string;
  /** Nivel de precio resuelto (1=publico, 2=distribuidor, 3, 4). */
  nivel: number;
  /** Precio sugerido en texto decimal; null si ningun nivel tiene valor. */
  precio: string | null;
  /** Moneda de los precios de venta del SKU (null si no aplica). */
  monedaVenta: string | null;
}

/**
 * Precio de venta sugerido para un SKU segun el nivel de precio del cliente.
 * Si no se pasa cliente, el backend asume el nivel publico (1).
 */
export function obtenerPrecioSugerido(
  skuId: number,
  clienteId?: number,
): Promise<PrecioSugerido> {
  const params = new URLSearchParams({ skuId: String(skuId) });
  if (clienteId !== undefined) params.set("clienteId", String(clienteId));
  return apiFetch<PrecioSugerido>(`/ventas/precio-sugerido?${params.toString()}`);
}

export function crearOrdenVenta(
  datos: CrearOrdenVentaInput,
): Promise<CrearOrdenVentaRespuesta> {
  return apiFetch<CrearOrdenVentaRespuesta>("/ventas/ordenes", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function crearDespacho(
  datos: CrearDespachoInput,
): Promise<CrearDespachoRespuesta> {
  return apiFetch<CrearDespachoRespuesta>("/ventas/despachos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function anularOrdenVenta(
  id: number,
): Promise<AnularOrdenVentaRespuesta> {
  return apiFetch<AnularOrdenVentaRespuesta>(`/ventas/ordenes/${id}/anular`, {
    method: "POST",
  });
}

// ── Devoluciones de venta (reverso de despacho): tipos ──────────────────────

export type EstadoDevolucionVenta = "REGISTRADA" | "ANULADA";

export interface LineaDevolucionVenta {
  id: string;
  skuId: string;
  cantidad: string;
  motivo: string | null;
  costoUnitario: string;
  movimientoEntradaId: string;
}

export interface DevolucionVenta {
  id: string;
  numero: string;
  estado: EstadoDevolucionVenta;
  fecha: string;
  motivo: string | null;
  ordenVentaId: string;
  ordenVentaNumero: string;
  comprobanteVentaId: string | null;
  guiaRemisionId: string | null;
  lineas: LineaDevolucionVenta[];
}

export interface CrearDevolucionLineaInput {
  /** Linea de la orden de venta (opcional; si viene valida pertenencia + SKU). */
  ordenVentaLineaId?: number;
  skuId: number;
  cantidad: string;
  motivo?: string;
  /** Series a reingresar. Obligatorio si el SKU controla serie. */
  numerosSerie?: string[];
}

export interface CrearDevolucionInput {
  /** Orden de venta DESPACHADA o PARCIAL a la que pertenece la devolucion. */
  ordenVentaId: number;
  comprobanteVentaId?: number;
  guiaRemisionId?: number;
  motivo?: string;
  /** Fecha de la devolucion en formato ISO 8601 (opcional; default ahora). */
  fecha?: string;
  lineas: CrearDevolucionLineaInput[];
}

export interface CrearDevolucionRespuesta {
  id: string;
  numero: string;
}

// ── Devoluciones de venta: funciones de dominio ─────────────────────────────

export function obtenerDevoluciones(): Promise<DevolucionVenta[]> {
  return apiFetch<DevolucionVenta[]>("/devoluciones");
}

export function crearDevolucion(
  datos: CrearDevolucionInput,
): Promise<CrearDevolucionRespuesta> {
  return apiFetch<CrearDevolucionRespuesta>("/devoluciones", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Conteos: tipos ────────────────────────────────────────────────────────────

export type EstadoConteo = "ABIERTO" | "APLICADO" | "ANULADO";

export interface LineaConteo {
  skuId: number;
  cantidadSistema: string;
  cantidadContada: string;
  diferencia: string;
}

export interface Conteo {
  id: number;
  almacenId: number;
  estado: EstadoConteo;
  lineas: LineaConteo[];
}

export interface AbrirConteoInput {
  almacenId: number;
  observaciones?: string;
}

export interface AbrirConteoRespuesta {
  id: number;
}

export interface RegistrarLineaConteoInput {
  conteoId: number;
  skuId: number;
  cantidadContada: string;
}

export interface RegistrarLineaConteoRespuesta {
  diferencia: string;
}

export interface AplicarConteoRespuesta {
  ajustes: number;
}

// ── Conteos: funciones de dominio ──────────────────────────────────────────────

export function abrirConteo(
  datos: AbrirConteoInput,
): Promise<AbrirConteoRespuesta> {
  return apiFetch<AbrirConteoRespuesta>("/conteos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function registrarLineaConteo(
  datos: RegistrarLineaConteoInput,
): Promise<RegistrarLineaConteoRespuesta> {
  return apiFetch<RegistrarLineaConteoRespuesta>("/conteos/lineas", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function aplicarConteo(id: number): Promise<AplicarConteoRespuesta> {
  return apiFetch<AplicarConteoRespuesta>(`/conteos/${id}/aplicar`, {
    method: "POST",
  });
}

export function obtenerConteo(id: number): Promise<Conteo> {
  return apiFetch<Conteo>(`/conteos/${id}`);
}

// ── Reportes: tipos ────────────────────────────────────────────────────────────

export interface FilaValorizacion {
  skuId: number;
  codigoParlante: string;
  producto: string;
  familia: string;
  cantidad: string;
  costoPromedio: string;
  valor: string;
}

export interface ReporteValorizacion {
  filas: FilaValorizacion[];
  total: number;
  totalGeneral: string;
  pagina: number;
  porPagina: number;
}

export interface AlertaStock {
  skuId: number;
  producto: string;
  disponible: string;
  stockMinimo: string;
}

export interface ArchivoPle {
  nombre: string;
  contenido: string;
}

export type FormatoPle = "121" | "131";

export type EjeConsumo = "centroCosto" | "solicitante" | "ordenTrabajo";

export interface GrupoConsumo {
  claveId: string | null;
  etiqueta: string;
  cantidad: string;
  costoTotalSoles: string;
  costoTotalUsd: string | null;
}

export interface ReporteConsumo {
  desde: string;
  hasta: string;
  agrupar: EjeConsumo;
  totalSoles: string;
  grupos: GrupoConsumo[];
}

// ── Reportes: funciones de dominio ─────────────────────────────────────────────

export function obtenerValorizacion(
  pagina = 1,
  porPagina = 50,
): Promise<ReporteValorizacion> {
  const params = new URLSearchParams({
    pagina: String(pagina),
    porPagina: String(porPagina),
  });
  return apiFetch<ReporteValorizacion>(`/reportes/valorizacion?${params.toString()}`);
}

export function obtenerAlertasStock(): Promise<AlertaStock[]> {
  return apiFetch<AlertaStock[]>("/reportes/alertas-stock");
}

export function obtenerConsumo(
  desde: string,
  hasta: string,
  agrupar: EjeConsumo,
): Promise<ReporteConsumo> {
  const params = new URLSearchParams({ desde, hasta, agrupar });
  return apiFetch<ReporteConsumo>(`/reportes/consumo?${params.toString()}`);
}

export function obtenerPle(
  formato: FormatoPle,
  periodo: string,
): Promise<ArchivoPle> {
  const params = new URLSearchParams({ periodo });
  return apiFetch<ArchivoPle>(
    `/reportes/ple/${formato}?${params.toString()}`,
  );
}

// ── Rentabilidad: tipos ─────────────────────────────────────────────────────

export type EjeRentabilidad = "articulo" | "cliente";

export interface FilaRentabilidad {
  claveId: string | null;
  etiqueta: string;
  cantidad: string;
  venta: string;
  costo: string;
  margen: string;
  /** Porcentaje de margen sobre la venta del grupo; null si la venta es 0. */
  margenPorcentaje: string | null;
}

export interface ReporteRentabilidad {
  desde: string;
  hasta: string;
  agrupar: EjeRentabilidad;
  ventaTotal: string;
  costoTotal: string;
  margenTotal: string;
  /** Porcentaje de margen total; null si la venta total es 0. */
  margenPorcentajeTotal: string | null;
  /** Movimientos de venta que no se pudieron emparejar con su linea de orden. */
  sinPrecio: number;
  filas: FilaRentabilidad[];
}

// ── Rentabilidad: funciones de dominio ──────────────────────────────────────

export function obtenerRentabilidad(
  desde: string,
  hasta: string,
  agrupar: EjeRentabilidad,
): Promise<ReporteRentabilidad> {
  const params = new URLSearchParams({ desde, hasta, agrupar });
  return apiFetch<ReporteRentabilidad>(`/reportes/rentabilidad?${params.toString()}`);
}

// ── Reposicion y clasificacion ABC: tipos ──────────────────────────────────────

export interface FilaReposicion {
  skuId: string;
  codigoParlante: string;
  producto: string;
  unidad: string;
  disponible: string;
  stockMinimo: string | null;
  stockMaximo: string | null;
  puntoReposicion: string | null;
  semanasReposicion: number | null;
  /** Cantidad sugerida a pedir; null si el SKU no tiene stock maximo definido. */
  sugeridoPedir: string | null;
}

export interface ReporteReposicion {
  filas: FilaReposicion[];
  total: number;
}

export type ClasificacionAbc = "A" | "B" | "C";

export interface FilaAbc {
  skuId: string;
  codigoParlante: string;
  producto: string;
  cantidadConsumo: string;
  valorConsumo: string;
  participacion: string;
  participacionAcumulada: string;
  clasificacion: ClasificacionAbc;
}

export interface ReporteAbc {
  desde: string;
  hasta: string;
  valorTotal: string;
  filas: FilaAbc[];
}

export interface ClasificarAbcRespuesta extends ReporteAbc {
  persistir: boolean;
  persistidos: number;
}

// ── Reposicion y clasificacion ABC: funciones de dominio ───────────────────────

export function obtenerReposicion(): Promise<ReporteReposicion> {
  return apiFetch<ReporteReposicion>("/reportes/reposicion");
}

export function obtenerAbc(desde: string, hasta: string): Promise<ReporteAbc> {
  const params = new URLSearchParams({ desde, hasta });
  return apiFetch<ReporteAbc>(`/reportes/abc?${params.toString()}`);
}

export function clasificarAbc(datos: {
  desde: string;
  hasta: string;
  persistir?: boolean;
}): Promise<ClasificarAbcRespuesta> {
  return apiFetch<ClasificarAbcRespuesta>("/productos/clasificar-abc", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Activos: tipos ──────────────────────────────────────────────────────────

export interface CategoriaActivo {
  id: number;
  nombre: string;
  vidaUtilMeses: number;
  tasaAnual: string;
}

export interface CrearCategoriaActivoInput {
  nombre: string;
  vidaUtilMeses: number;
  tasaAnual: string;
}

export interface CrearCategoriaActivoRespuesta {
  id: number;
}

export interface Activo {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  marca: string | null;
  estado: string;
  valorAdquisicion: string;
  depreciacionAcumulada: string;
  valorActual: string;
}

export interface CrearActivoInput {
  sucursalId: number;
  categoriaId: number;
  codigo: string;
  nombre: string;
  marca?: string;
  modelo?: string;
  numeroSerie?: string;
  departamento?: string;
  fechaCompra: string;
  valorAdquisicion: string;
  valorResidual?: string;
  vidaUtilMeses: number;
}

export interface CrearActivoRespuesta {
  id: number;
}

export interface DepreciarInput {
  periodo: string;
}

export interface DepreciarRespuesta {
  procesados: number;
}

// ── Activos: funciones de dominio ───────────────────────────────────────────

export function obtenerCategoriasActivo(): Promise<CategoriaActivo[]> {
  return apiFetch<CategoriaActivo[]>("/activos/categorias");
}

export function crearCategoriaActivo(
  datos: CrearCategoriaActivoInput,
): Promise<CrearCategoriaActivoRespuesta> {
  return apiFetch<CrearCategoriaActivoRespuesta>("/activos/categorias", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function obtenerActivos(): Promise<Activo[]> {
  return apiFetch<Activo[]>("/activos");
}

export function crearActivo(
  datos: CrearActivoInput,
): Promise<CrearActivoRespuesta> {
  return apiFetch<CrearActivoRespuesta>("/activos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function depreciar(datos: DepreciarInput): Promise<DepreciarRespuesta> {
  return apiFetch<DepreciarRespuesta>("/activos/depreciar", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Importador: tipos ───────────────────────────────────────────────────────

export interface FilaImportador {
  codigoParlante: string;
  descripcion: string;
  unidadCodigo: string;
  stockFisico: string;
  costoUnitario?: string;
}

export interface ImportarProductosInput {
  almacenId: number;
  dryRun?: boolean;
  filas: FilaImportador[];
}

export interface ErrorImportacion {
  codigo: string;
  motivo: string;
}

export interface ImportarProductosRespuesta {
  dryRun: boolean;
  creados: number;
  actualizados: number;
  conStock: number;
  errores: ErrorImportacion[];
}

// ── Importador: funciones de dominio ────────────────────────────────────────

export function importarProductos(
  datos: ImportarProductosInput,
): Promise<ImportarProductosRespuesta> {
  return apiFetch<ImportarProductosRespuesta>("/importador/productos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Guias de remision (registro de referencia): tipos ───────────────────────

export interface GuiaRemision {
  id: string;
  serie: string;
  numero: string;
  serieNumero: string;
  fechaTraslado: string;
  /** Codigo SUNAT del motivo (Catalogo 20). Ej. "04". */
  motivoTraslado: string;
  /** Clave del enum MOTIVO_TRASLADO devuelta por la API. */
  motivoLabel: string;
  transportistaDoc: string | null;
  transportistaNombre: string | null;
  puntoPartida: string;
  puntoLlegada: string;
  pesoBruto: string | null;
  observaciones: string | null;
  trasladoId: string | null;
  trasladoNumero: string | null;
  ordenVentaId: string | null;
  ordenVentaNumero: string | null;
}

export interface CrearGuiaInput {
  serie: string;
  numero: string;
  /** Fecha de traslado en formato ISO 8601. */
  fechaTraslado: string;
  /** Codigo SUNAT del motivo (Catalogo 20). */
  motivoTraslado: string;
  transportistaDoc?: string;
  transportistaNombre?: string;
  puntoPartida: string;
  puntoLlegada: string;
  pesoBruto?: string;
  observaciones?: string;
  /** Vinculo: exactamente uno de trasladoId u ordenVentaId. */
  trasladoId?: number;
  ordenVentaId?: number;
}

export interface FiltroGuias {
  trasladoId?: number;
  ordenVentaId?: number;
}

// ── Guias de remision: funciones de dominio ─────────────────────────────────

export function crearGuia(datos: CrearGuiaInput): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/guias", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function obtenerGuias(filtro?: FiltroGuias): Promise<GuiaRemision[]> {
  const params = new URLSearchParams();
  if (filtro?.trasladoId) params.set("trasladoId", String(filtro.trasladoId));
  if (filtro?.ordenVentaId) params.set("ordenVentaId", String(filtro.ordenVentaId));
  const cadena = params.toString();
  return apiFetch<GuiaRemision[]>(`/guias${cadena ? `?${cadena}` : ""}`);
}

// ── Cierre mensual de periodo valorizado: tipos ─────────────────────────────

export type EstadoCierrePeriodo = "ABIERTO" | "CERRADO";

export interface CierrePeriodo {
  id: string;
  /** Periodo en formato AAAAMM. */
  periodo: string;
  estado: EstadoCierrePeriodo;
  cerradoPor: { id: string; nombre: string } | null;
  fechaCierre: string | null;
  totalValorizadoSoles: string;
  /** Null si algun item del periodo no tiene tipo de cambio. */
  totalValorizadoUsd: string | null;
}

export interface CerrarPeriodoRespuesta {
  id: string;
  periodo: string;
  estado: EstadoCierrePeriodo;
  totalValorizadoSoles: string;
  totalValorizadoUsd: string | null;
  skusCongelados: number;
}

export interface ReabrirPeriodoRespuesta {
  id: string;
  periodo: string;
  estado: EstadoCierrePeriodo;
}

// ── Cierre mensual: funciones de dominio ────────────────────────────────────

export function obtenerCierres(): Promise<CierrePeriodo[]> {
  return apiFetch<CierrePeriodo[]>("/cierres");
}

export function cerrarPeriodo(periodo: string): Promise<CerrarPeriodoRespuesta> {
  return apiFetch<CerrarPeriodoRespuesta>(`/cierres/${periodo}/cerrar`, {
    method: "POST",
  });
}

export function reabrirPeriodo(
  periodo: string,
): Promise<ReabrirPeriodoRespuesta> {
  return apiFetch<ReabrirPeriodoRespuesta>(`/cierres/${periodo}/reabrir`, {
    method: "POST",
  });
}

// ── Tipo de cambio diario (bimoneda): tipos ─────────────────────────────────

export interface TipoCambioDiario {
  id: string;
  /** Fecha del TC en formato ISO "YYYY-MM-DD". */
  fecha: string;
  /** Cotizacion de compra (string decimal). */
  compra: string;
  /** Cotizacion de venta (string decimal). */
  venta: string;
}

export interface GuardarTipoCambioInput {
  /** Fecha en formato "YYYY-MM-DD". */
  fecha: string;
  compra: string;
  venta: string;
}

// ── Tipo de cambio diario: funciones de dominio ─────────────────────────────

/** Lista los tipos de cambio de un mes (anio + mes 1-12), ordenados por fecha. */
export function obtenerTiposCambio(
  anio: number,
  mes: number,
): Promise<TipoCambioDiario[]> {
  const params = new URLSearchParams({
    anio: String(anio),
    mes: String(mes),
  });
  return apiFetch<TipoCambioDiario[]>(`/tipos-cambio?${params.toString()}`);
}

/** Upsert del TC de una fecha. Re-enviar la misma fecha actualiza el registro. */
export function guardarTipoCambio(
  datos: GuardarTipoCambioInput,
): Promise<TipoCambioDiario> {
  return apiFetch<TipoCambioDiario>("/tipos-cambio", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Series por articulo (trazabilidad por numero de serie): tipos ───────────

export type EstadoSerieArticulo = "DISPONIBLE" | "DESPACHADO";

export interface SerieArticulo {
  id: string;
  skuId: string;
  codigoParlante: string;
  skuNombre: string | null;
  numeroSerie: string;
  estado: EstadoSerieArticulo;
  almacenId: string | null;
  almacen: string | null;
  movimientoEntradaId: string | null;
  movimientoSalidaId: string | null;
  creadoEn: string;
}

export interface FiltroSeries {
  skuId?: number;
  estado?: EstadoSerieArticulo;
}

// ── Series por articulo: funciones de dominio ───────────────────────────────

/**
 * Lista las series de la empresa. Filtra opcionalmente por SKU y/o estado
 * (DISPONIBLE / DESPACHADO). Util para la consulta de series y para ofrecer
 * los numeros disponibles al despachar un articulo serializado.
 */
export function obtenerSeries(filtro?: FiltroSeries): Promise<SerieArticulo[]> {
  const params = new URLSearchParams();
  if (filtro?.skuId) params.set("skuId", String(filtro.skuId));
  if (filtro?.estado) params.set("estado", filtro.estado);
  const cadena = params.toString();
  return apiFetch<SerieArticulo[]>(`/series${cadena ? `?${cadena}` : ""}`);
}

// ── Cotizaciones proveedor-articulo: tipos ──────────────────────────────────

/** Ultimo precio cotizado por un proveedor para un SKU dado. */
export interface CotizacionProveedorArticulo {
  cotizacionId: number;
  proveedorId: number;
  proveedorRazonSocial: string;
  proveedorRuc: string;
  moneda: string;
  precioUnitario: string;
  /** Fecha de la cotizacion en formato ISO 8601. */
  fechaCotizacion: string;
  numeroCotizacion: string | null;
  ordenCompraRef: string | null;
}

export interface CrearCotizacionInput {
  proveedorId: number;
  skuId: number;
  moneda?: string;
  precioUnitario: string;
  /** Fecha de la cotizacion en formato ISO 8601. */
  fechaCotizacion: string;
  numeroCotizacion?: string;
  ordenCompraRef?: string;
}

// ── Cotizaciones proveedor-articulo: funciones de dominio ───────────────────

/**
 * Lista, para un SKU, el ultimo precio cotizado por cada proveedor que lo
 * vende, ordenado por precio ascendente (mejor oferta primero).
 */
export function obtenerCotizacionesPorSku(
  skuId: number,
): Promise<CotizacionProveedorArticulo[]> {
  return apiFetch<CotizacionProveedorArticulo[]>(
    `/cotizaciones?skuId=${skuId}`,
  );
}

export function crearCotizacion(
  datos: CrearCotizacionInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>("/cotizaciones", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Contabilidad: asientos configurables (estilo CONCAR): tipos ─────────────

/** Conceptos contables soportados para configurar cuentas debe/haber. */
export type ConceptoContable =
  | "COSTO_VENTA"
  | "CONSUMO"
  | "COMPRA"
  | "DEVOLUCION";

/** Tipos de asiento que se pueden generar (conceptos con movimientos valorizados). */
export type TipoAsiento = "COSTO_VENTA" | "CONSUMO";

export interface CuentaContable {
  concepto: ConceptoContable;
  cuentaDebe: string;
  cuentaHaber: string;
}

export interface ActualizarCuentasInput {
  cuentas: CuentaContable[];
}

export interface LineaAsiento {
  /** Fecha del movimiento en formato AAAA-MM-DD. */
  fecha: string;
  cuentaDebe: string;
  cuentaHaber: string;
  /** Importe del movimiento (string decimal, 2 decimales). */
  importe: string;
  glosa: string;
  /** Centro de costo (solo CONSUMO); null en COSTO_VENTA. */
  centroCosto: string | null;
}

export interface Asiento {
  periodo: string;
  tipo: TipoAsiento;
  concepto: ConceptoContable;
  cuentaDebe: string;
  cuentaHaber: string;
  /** Total del asiento (string decimal, 2 decimales). */
  totalImporte: string;
  lineas: LineaAsiento[];
}

export interface ArchivoAsiento {
  nombre: string;
  contenido: string;
}

/** Separador de columnas para el archivo de texto del asiento. */
export type SeparadorAsiento = "pipe" | "coma";

// ── Contabilidad: funciones de dominio ──────────────────────────────────────

export function obtenerCuentasContables(): Promise<CuentaContable[]> {
  return apiFetch<CuentaContable[]>("/contabilidad/cuentas");
}

export function guardarCuentasContables(
  datos: ActualizarCuentasInput,
): Promise<CuentaContable[]> {
  return apiFetch<CuentaContable[]>("/contabilidad/cuentas", {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

/** Genera el asiento del periodo (AAAAMM) y tipo, en formato JSON para previsualizar. */
export function obtenerAsiento(
  periodo: string,
  tipo: TipoAsiento,
): Promise<Asiento> {
  const params = new URLSearchParams({ periodo, tipo });
  return apiFetch<Asiento>(`/contabilidad/asientos?${params.toString()}`);
}

/** Genera el asiento como archivo de texto descargable (TXT/CSV). */
export function obtenerAsientoArchivo(
  periodo: string,
  tipo: TipoAsiento,
  separador: SeparadorAsiento,
): Promise<ArchivoAsiento> {
  const params = new URLSearchParams({
    periodo,
    tipo,
    formato: "texto",
    separador,
  });
  return apiFetch<ArchivoAsiento>(`/contabilidad/asientos?${params.toString()}`);
}
