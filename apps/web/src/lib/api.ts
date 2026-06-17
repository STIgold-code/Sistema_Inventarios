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

// ── Compras: tipos ──────────────────────────────────────────────────────────

export interface Proveedor {
  id: number;
  ruc: string;
  razonSocial: string;
}

export interface CrearProveedorInput {
  ruc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
}

export interface CrearProveedorRespuesta {
  id: number;
}

export type EstadoOrdenCompra = "EMITIDA" | "PARCIAL" | "COMPLETA";

export interface LineaOrdenCompra {
  id: number;
  skuId: number;
  codigoSku: string;
  nombreSku: string;
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
  total: string;
  lineas: LineaOrdenCompra[];
}

export interface CrearOrdenCompraLineaInput {
  skuId: number;
  cantidad: string;
  costoUnitario: string;
}

export interface CrearOrdenCompraInput {
  proveedorId: number;
  almacenId: number;
  numero: string;
  observaciones?: string;
  lineas: CrearOrdenCompraLineaInput[];
}

export interface CrearOrdenCompraRespuesta {
  id: number;
  total: string;
}

export interface CrearRecepcionLineaInput {
  ordenCompraLineaId: number;
  cantidad: string;
}

export interface CrearRecepcionInput {
  ordenCompraId: number;
  tipoDocumentoSunat?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
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
  cantidad: string;
  cantidadDespachada: string;
  pendiente: string;
}

export interface OrdenVenta {
  id: number;
  numero: string;
  cliente: string;
  estado: EstadoOrdenVenta;
  total: string;
  lineas: LineaOrdenVenta[];
}

export interface CrearOrdenVentaLineaInput {
  skuId: number;
  cantidad: string;
  precioUnitario?: string;
}

export interface CrearOrdenVentaInput {
  almacenId: number;
  numero: string;
  cliente?: string;
  observaciones?: string;
  lineas: CrearOrdenVentaLineaInput[];
}

export interface CrearOrdenVentaRespuesta {
  id: number;
  total: string;
}

export interface CrearDespachoLineaInput {
  ordenVentaLineaId: number;
  cantidad: string;
}

export interface CrearDespachoInput {
  ordenVentaId: number;
  tipoDocumentoSunat?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  lineas: CrearDespachoLineaInput[];
}

export interface CrearDespachoRespuesta {
  ok: true;
}

export interface AnularOrdenVentaRespuesta {
  ok: true;
}

// ── Ventas: funciones de dominio ────────────────────────────────────────────

export function obtenerOrdenesVenta(): Promise<OrdenVenta[]> {
  return apiFetch<OrdenVenta[]>("/ventas/ordenes");
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

export function obtenerPle(
  formato: FormatoPle,
  periodo: string,
): Promise<ArchivoPle> {
  const params = new URLSearchParams({ periodo });
  return apiFetch<ArchivoPle>(
    `/reportes/ple/${formato}?${params.toString()}`,
  );
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
