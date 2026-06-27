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

/**
 * Descarga un archivo binario (ej. .xlsx) desde la API inyectando el Bearer
 * token. A diferencia de `apiFetch`, no parsea JSON: recibe el blob, crea un
 * object URL temporal y dispara la descarga con un <a download>, liberando el
 * URL despues. `nombreSugerido` es el fallback del atributo download; el
 * nombre real lo define el backend via Content-Disposition.
 */
export async function descargarArchivo(
  path: string,
  nombreSugerido: string,
): Promise<void> {
  const token = leerToken();
  const cabeceras = new Headers();
  if (token) cabeceras.set("Authorization", `Bearer ${token}`);

  const respuesta = await fetch(`${URL_BASE}${path}`, { headers: cabeceras });

  if (!respuesta.ok) {
    let cuerpo: CuerpoError | null = null;
    try {
      cuerpo = (await respuesta.json()) as CuerpoError;
    } catch {
      cuerpo = null;
    }
    throw new ErrorApi(extraerMensaje(cuerpo, respuesta.status), respuesta.status);
  }

  const blob = await respuesta.blob();
  const url = URL.createObjectURL(blob);
  try {
    const ancla = document.createElement("a");
    ancla.href = url;
    ancla.download = nombreSugerido;
    document.body.appendChild(ancla);
    ancla.click();
    ancla.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Descarga la respuesta JSON de un endpoint de datos como archivo .json. A
 * diferencia de `descargarArchivo` (que recibe un blob binario del backend),
 * este helper consume el JSON del endpoint, lo serializa con indentacion y
 * dispara la descarga de un Blob "application/json". `nombreArchivo` es el
 * nombre final del archivo descargado.
 */
export async function descargarJson(
  path: string,
  nombreArchivo: string,
): Promise<void> {
  const token = leerToken();
  const cabeceras = new Headers();
  if (token) cabeceras.set("Authorization", `Bearer ${token}`);

  const respuesta = await fetch(`${URL_BASE}${path}`, { headers: cabeceras });

  if (!respuesta.ok) {
    let cuerpo: CuerpoError | null = null;
    try {
      cuerpo = (await respuesta.json()) as CuerpoError;
    } catch {
      cuerpo = null;
    }
    throw new ErrorApi(extraerMensaje(cuerpo, respuesta.status), respuesta.status);
  }

  const datos = await respuesta.json();
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  try {
    const ancla = document.createElement("a");
    ancla.href = url;
    ancla.download = nombreArchivo;
    document.body.appendChild(ancla);
    ancla.click();
    ancla.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
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
  /** Renovabilidad: true = se repone/consume; false = no; null = sin clasificar. */
  esRenovable: boolean | null;
  /** Baja logica: false = SKU dado de baja (no usable en nuevas operaciones). */
  activo: boolean;
  /** Precio de venta nivel 1 (publico). Null si no esta configurado. */
  precioPublico: string | null;
  /** Precio de venta nivel 2 (distribuidor). Null si no esta configurado. */
  precioDistribuidor: string | null;
  /** Moneda de los precios de venta (ISO-4217: PEN, USD). Null si no aplica. */
  monedaVenta: string | null;
}

export interface DetalleSkuStockAlmacen {
  almacenId: string;
  almacen: string;
  disponible: string;
  comprometida: string;
  deteriorada: string;
  costoPromedio: string;
  valor: string;
}

export interface DetalleSkuMovimiento {
  fecha: string;
  tipo: string;
  signo: string;
  cantidad: string;
  almacen: string;
  documento: string | null;
}

/** Detalle completo de un SKU (espejo del shape de GET /productos/skus/:id). */
export interface DetalleSku {
  id: string;
  codigoParlante: string;
  codigoBarras: string | null;
  codigoUnspsc: string | null;
  nombre: string | null;
  producto: { id: string; nombre: string; activo: boolean };
  familia: { id: string; codigo: string; nombre: string };
  unidad: { id: string; codigo: string; nombre: string };
  unidadReferencia: { id: string; codigo: string; nombre: string } | null;
  factorConversion: string | null;
  tipoExistencia: string;
  metodoValuacion: string;
  activo: boolean;
  creadoEn: string;
  esRenovable: boolean | null;
  clasificacionAbc: string | null;
  controlaSerie: boolean;
  controlaLote: boolean;
  controlaVencimiento: boolean;
  precios: {
    publico: string | null;
    distribuidor: string | null;
    venta3: string | null;
    venta4: string | null;
    moneda: string | null;
  };
  reposicion: {
    stockMinimo: string | null;
    stockMaximo: string | null;
    puntoReposicion: string | null;
    semanasReposicion: number | null;
  };
  stock: {
    totales: {
      disponible: string;
      comprometida: string;
      deteriorada: string;
      valorTotal: string;
    };
    porAlmacen: DetalleSkuStockAlmacen[];
  };
  movimientos: DetalleSkuMovimiento[];
}

export interface CrearProductoInput {
  familiaId: number;
  nombre: string;
  codigoParlante: string;
  unidadId: number;
  codigoUnspsc?: string;
  codigoBarras?: string;
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
  /** Precio de venta nivel 3. Decimal positivo en texto. */
  precioVenta3?: string;
  /** Precio de venta nivel 4. Decimal positivo en texto. */
  precioVenta4?: string;
  /** Moneda de los precios de venta (ISO-4217: PEN, USD). */
  monedaVenta?: string;
  /** Renovabilidad de la existencia (true/false). Omitido = sin clasificar. */
  esRenovable?: boolean;
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

export interface ProduccionInput {
  skuId: number;
  almacenId: number;
  cantidad: string;
  costoUnitario: string;
  ordenTrabajoId?: number;
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
  /** Existencia en mal estado, separada del disponible (no vendible). */
  cantidadDeteriorada: string;
  costoPromedio: string;
}

export interface FilaKardex {
  fecha: string;
  almacen: string;
  tipo: string;
  tipoOperacionSunat: string;
  cantidad: string;
  /** Cantidad del movimiento si fue entrada; "0" si fue salida. */
  cantidadEntrada: string;
  /** Cantidad del movimiento si fue salida; "0" si fue entrada. */
  cantidadSalida: string;
  /** Documento de origen legible (ej. "Compra F001-123", "Vale de salida N° 5"). */
  referencia: string;
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

// ── Familias (CRUD independiente bajo /familias): tipos ──────────────────────

export interface FamiliaGestion {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
}

export interface CrearFamiliaInput {
  /** Codigo de exactamente 3 digitos numericos; es la llave de negocio. */
  codigo: string;
  nombre: string;
}

/** El codigo no es editable por ser llave de negocio; solo nombre y estado. */
export interface ActualizarFamiliaInput {
  nombre?: string;
  activo?: boolean;
}

// ── Familias: funciones de dominio ──────────────────────────────────────────

export function obtenerFamiliasGestion(
  incluirInactivas = false,
): Promise<FamiliaGestion[]> {
  const cadena = incluirInactivas ? "?incluirInactivas=true" : "";
  return apiFetch<FamiliaGestion[]>(`/familias${cadena}`);
}

export function crearFamilia(
  datos: CrearFamiliaInput,
): Promise<FamiliaGestion> {
  return apiFetch<FamiliaGestion>("/familias", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarFamilia(
  id: string,
  datos: ActualizarFamiliaInput,
): Promise<FamiliaGestion> {
  return apiFetch<FamiliaGestion>(`/familias/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function darDeBajaFamilia(id: string): Promise<FamiliaGestion> {
  return apiFetch<FamiliaGestion>(`/familias/${id}`, { method: "DELETE" });
}

export function obtenerSkus(
  pagina: number,
  porPagina: number,
  busqueda: string,
  esRenovable?: boolean,
): Promise<RespuestaPaginada<Sku>> {
  const params = new URLSearchParams({
    pagina: String(pagina),
    porPagina: String(porPagina),
    busqueda,
  });
  if (esRenovable !== undefined) params.set("esRenovable", String(esRenovable));
  return apiFetch<RespuestaPaginada<Sku>>(`/productos/skus?${params.toString()}`);
}

export function obtenerDetalleSku(id: number | string): Promise<DetalleSku> {
  return apiFetch<DetalleSku>(`/productos/skus/${id}`);
}

export function crearProducto(
  datos: CrearProductoInput,
): Promise<CrearProductoRespuesta> {
  return apiFetch<CrearProductoRespuesta>("/productos", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/**
 * Campos editables de un SKU. Todos opcionales: solo se envian los que cambian.
 * NO incluye unidad, familia ni multi-unidad (son estructurales, no editables).
 * En codigoBarras/codigoUnspsc, una cadena vacia limpia el campo.
 */
export interface ActualizarSkuInput {
  nombreSku?: string;
  codigoParlante?: string;
  codigoBarras?: string;
  codigoUnspsc?: string;
  stockMinimo?: string;
  stockMaximo?: string;
  puntoReposicion?: string;
  semanasReposicion?: number;
  esRenovable?: boolean;
  precioPublico?: string;
  precioDistribuidor?: string;
  precioVenta3?: string;
  precioVenta4?: string;
  monedaVenta?: string;
}

export function actualizarSku(
  id: number | string,
  datos: ActualizarSkuInput,
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/productos/skus/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function darDeBajaSku(
  id: number | string,
): Promise<{ id: string; activo: boolean }> {
  return apiFetch<{ id: string; activo: boolean }>(`/productos/skus/${id}/baja`, {
    method: "POST",
  });
}

export function reactivarSku(
  id: number | string,
): Promise<{ id: string; activo: boolean }> {
  return apiFetch<{ id: string; activo: boolean }>(
    `/productos/skus/${id}/reactivar`,
    { method: "POST" },
  );
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

export function registrarProduccion(
  datos: ProduccionInput,
): Promise<{ movimientoId: string }> {
  return apiFetch<{ movimientoId: string }>("/inventario/produccion", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

// ── Condición de existencias (buen uso vs deteriorado) ───────────────────────

export interface CondicionInput {
  skuId: number;
  almacenId: number;
  cantidad: string;
  motivo: string;
}

/** El backend devuelve el id del movimiento del ledger como cadena. */
export interface CondicionRespuesta {
  movimientoId: string;
}

/** Reclasifica existencia de buen uso a deteriorado (no es salida física). */
export function marcarDeteriorado(datos: CondicionInput): Promise<CondicionRespuesta> {
  return apiFetch<CondicionRespuesta>("/inventario/deteriorar", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/** Reclasifica existencia de deteriorado de vuelta a buen uso. */
export function recuperarDeteriorado(datos: CondicionInput): Promise<CondicionRespuesta> {
  return apiFetch<CondicionRespuesta>("/inventario/recuperar", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

/** Salida física real desde el deteriorado (consume capas FIFO, baja definitiva). */
export function darDeBajaDeteriorado(datos: CondicionInput): Promise<CondicionRespuesta> {
  return apiFetch<CondicionRespuesta>("/inventario/baja-deteriorado", {
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

// ── Ledger de movimientos de stock (listado + detalle) ───────────────────────

/** Fila del listado paginado del ledger de movimientos. */
export interface Movimiento {
  id: string;
  fecha: string;
  tipo: string;
  signo: string;
  cantidad: string;
  skuId: string;
  skuCodigo: string;
  skuNombre: string;
  almacen: string;
  costoUnitario: string;
  costoTotal: string;
  documento: string;
}

/** Capa FIFO consumida por un movimiento de salida. */
export interface CapaConsumida {
  cantidad: string;
  costoUnitario: string;
}

/** Detalle completo de un movimiento del ledger. */
export interface DetalleMovimiento {
  id: string;
  fecha: string;
  tipo: string;
  signo: string;
  sku: { id: string; codigo: string; nombre: string };
  almacen: string;
  usuario: string;
  documento: { tipo: string; referencia: string };
  sunat: {
    periodo: string;
    cuo: string;
    numeroCorrelativo: string;
    tipoOperacionSunat: string;
    tipoDocumentoSunat: string;
    serieComprobante: string | null;
    numeroComprobante: string | null;
  };
  cantidad: string;
  costos: {
    unitario: string;
    total: string;
    unitarioUsd: string | null;
    totalUsd: string | null;
  };
  saldos: {
    cantidad: string;
    costoUnitario: string;
    costoTotal: string;
  };
  capas: CapaConsumida[];
  series: string[];
}

export interface FiltrosMovimientos {
  pagina: number;
  porPagina: number;
  skuId?: number;
  almacenId?: number;
  tipo?: string;
  desde?: string;
  hasta?: string;
}

export function obtenerMovimientos(
  filtros: FiltrosMovimientos,
): Promise<RespuestaPaginada<Movimiento>> {
  const params = new URLSearchParams({
    pagina: String(filtros.pagina),
    porPagina: String(filtros.porPagina),
  });
  if (filtros.skuId !== undefined) params.set("skuId", String(filtros.skuId));
  if (filtros.almacenId !== undefined)
    params.set("almacenId", String(filtros.almacenId));
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  return apiFetch<RespuestaPaginada<Movimiento>>(
    `/inventario/movimientos?${params.toString()}`,
  );
}

export function obtenerDetalleMovimiento(
  id: string | number,
): Promise<DetalleMovimiento> {
  return apiFetch<DetalleMovimiento>(`/inventario/movimientos/${id}`);
}

// ── Existencias (stock de todos los SKUs por almacén) ────────────────────────

export interface StockEnAlmacen {
  almacenId: string;
  disponible: string;
  comprometido: string;
  /** Existencia en mal estado en este almacén, separada del disponible. */
  deteriorado: string;
  /** Costo promedio ponderado del SKU en este almacén. */
  costoPromedio: string;
  /** Valorización (disponible × costoPromedio) agregada por almacén. */
  valorTotal: string;
}

export interface ExistenciaSku {
  skuId: string;
  codigoParlante: string;
  nombre: string;
  unidad: string;
  stockMinimo: string | null;
  /** Renovabilidad: true = se repone/consume; false = no; null = sin clasificar. */
  esRenovable: boolean | null;
  stocks: StockEnAlmacen[];
  totalDisponible: string;
  totalComprometido: string;
  /** Existencia en mal estado del SKU sobre todos sus almacenes. */
  totalDeteriorado: string;
  /** Costo promedio ponderado del SKU sobre todos sus almacenes. */
  costoPromedio: string;
  /** Valorización total del SKU (suma de valorTotal de sus almacenes). */
  valorTotal: string;
}

export interface ExistenciasRespuesta {
  datos: ExistenciaSku[];
  total: number;
  pagina: number;
  porPagina: number;
  almacenes: Almacen[];
  /** Suma de valorTotal de todos los SKUs de la página actual. */
  valorizadoTotal: string;
}

export function obtenerExistencias(parametros: {
  pagina?: number;
  porPagina?: number;
  busqueda?: string;
  almacenId?: number;
  esRenovable?: boolean;
}): Promise<ExistenciasRespuesta> {
  const query = new URLSearchParams();
  if (parametros.pagina) query.set("pagina", String(parametros.pagina));
  if (parametros.porPagina) query.set("porPagina", String(parametros.porPagina));
  if (parametros.busqueda) query.set("busqueda", parametros.busqueda);
  if (parametros.almacenId) query.set("almacenId", String(parametros.almacenId));
  if (parametros.esRenovable !== undefined) {
    query.set("esRenovable", String(parametros.esRenovable));
  }
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
  activo: boolean;
}

export interface AlmacenDetalle {
  id: string;
  codigo: string;
  nombre: string;
  sucursal: string;
  sucursalId: string;
  activo: boolean;
}

export function obtenerSucursales(
  incluirInactivos = false,
): Promise<Sucursal[]> {
  const cadena = incluirInactivos ? "?incluirInactivos=true" : "";
  return apiFetch<Sucursal[]>(`/almacenes/sucursales${cadena}`);
}

export function darBajaSucursal(
  sucursalId: number,
): Promise<{ id: string; activo: false }> {
  return apiFetch<{ id: string; activo: false }>(
    `/almacenes/sucursales/${sucursalId}/baja`,
    { method: "POST" },
  );
}

export function reactivarSucursal(
  sucursalId: number,
): Promise<{ id: string; activo: true }> {
  return apiFetch<{ id: string; activo: true }>(
    `/almacenes/sucursales/${sucursalId}/reactivar`,
    { method: "POST" },
  );
}

export function crearSucursal(datos: { codigo: string; nombre: string }): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/almacenes/sucursales", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarSucursal(
  sucursalId: number,
  datos: { codigo?: string; nombre?: string },
): Promise<Sucursal> {
  return apiFetch<Sucursal>(`/almacenes/sucursales/${sucursalId}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function obtenerAlmacenesDetalle(
  incluirInactivos = false,
): Promise<AlmacenDetalle[]> {
  const cadena = incluirInactivos ? "?incluirInactivos=true" : "";
  return apiFetch<AlmacenDetalle[]>(`/almacenes${cadena}`);
}

export function darBajaAlmacen(
  almacenId: number,
): Promise<{ id: string; activo: false }> {
  return apiFetch<{ id: string; activo: false }>(
    `/almacenes/${almacenId}/baja`,
    { method: "POST" },
  );
}

export function reactivarAlmacen(
  almacenId: number,
): Promise<{ id: string; activo: true }> {
  return apiFetch<{ id: string; activo: true }>(
    `/almacenes/${almacenId}/reactivar`,
    { method: "POST" },
  );
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

export function actualizarAlmacen(
  almacenId: number,
  datos: { codigo?: string; nombre?: string },
): Promise<AlmacenDetalle> {
  return apiFetch<AlmacenDetalle>(`/almacenes/${almacenId}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

// ── Zonas de almacén ────────────────────────────────────────────────────────

export interface Zona {
  id: string;
  almacenId: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export function obtenerZonas(almacenId: number): Promise<Zona[]> {
  return apiFetch<Zona[]>(`/almacenes/${almacenId}/zonas`);
}

export function crearZona(
  almacenId: number,
  datos: { codigo: string; nombre: string; descripcion?: string },
): Promise<Zona> {
  return apiFetch<Zona>(`/almacenes/${almacenId}/zonas`, {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarZona(
  almacenId: number,
  zonaId: number,
  datos: { codigo?: string; nombre?: string; descripcion?: string; activo?: boolean },
): Promise<Zona> {
  return apiFetch<Zona>(`/almacenes/${almacenId}/zonas/${zonaId}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function darBajaZona(almacenId: number, zonaId: number): Promise<Zona> {
  return apiFetch<Zona>(`/almacenes/${almacenId}/zonas/${zonaId}/baja`, {
    method: "PATCH",
  });
}

/** Kardex de un SKU. Si almacenId es null, trae todos los almacenes (consolidado). */
export function obtenerKardex(
  skuId: number,
  almacenId: number | null,
  desde?: string,
  hasta?: string,
): Promise<FilaKardex[]> {
  const params = new URLSearchParams({ skuId: String(skuId) });
  if (almacenId !== null) params.set("almacenId", String(almacenId));
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
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

// ── Vendedores ──────────────────────────────────────────────────────────────

export interface Vendedor {
  id: string;
  codigo: string;
  nombre: string;
  documento: string | null;
  activo: boolean;
}

export function obtenerVendedores(): Promise<Vendedor[]> {
  return apiFetch<Vendedor[]>("/vendedores");
}

// ── Transferencia de codigo (transformacion de SKU) ───────────────────────────

export interface LineaTransferenciaCodigo {
  id: string;
  origen: string;
  destino: string;
  cantidadOrigen: string;
  factorConversion: string;
  cantidadDestino: string;
  costoTotal: string;
}

export interface TransferenciaCodigo {
  id: string;
  numero: string;
  estado: "CONFIRMADA" | "ANULADA";
  fecha: string;
  observaciones: string | null;
  lineas: LineaTransferenciaCodigo[];
}

export interface CrearTransferenciaCodigoInput {
  almacenId: number;
  numero: string;
  observaciones?: string;
  lineas: Array<{
    skuOrigenId: number;
    skuDestinoId: number;
    cantidadOrigen: string;
    factorConversion: string;
  }>;
}

export function obtenerTransferenciasCodigo(): Promise<TransferenciaCodigo[]> {
  return apiFetch<TransferenciaCodigo[]>("/transferencias-codigo");
}

export function crearTransferenciaCodigo(
  datos: CrearTransferenciaCodigoInput,
): Promise<{ id: string; numero: string }> {
  return apiFetch<{ id: string; numero: string }>("/transferencias-codigo", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function crearVendedor(datos: {
  codigo: string;
  nombre: string;
  documento?: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/vendedores", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarVendedor(
  id: string,
  datos: { nombre?: string; documento?: string; activo?: boolean },
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/vendedores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

// ── Transportistas ──────────────────────────────────────────────────────────

export interface Transportista {
  id: string;
  codigo: string;
  ruc: string | null;
  nombre: string;
  activo: boolean;
}

export function obtenerTransportistas(): Promise<Transportista[]> {
  return apiFetch<Transportista[]>("/transportistas");
}

export function crearTransportista(datos: {
  codigo: string;
  nombre: string;
  ruc?: string;
}): Promise<{ id: string }> {
  return apiFetch<{ id: string }>("/transportistas", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarTransportista(
  id: string,
  datos: { nombre?: string; ruc?: string; activo?: boolean },
): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/transportistas/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
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
  skuCodigo: string | null;
  skuNombre: string | null;
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

export interface LineaRequerimientoDetalle {
  id: string;
  skuId: string;
  /** codigoParlante del SKU (14 digitos); null si el SKU ya no existe. */
  skuCodigo: string | null;
  skuNombre: string | null;
  cantidad: string;
  justificacion: string | null;
}

/** Detalle completo de un requerimiento (GET /requerimientos/:id) para impresion. */
export interface RequerimientoDetalle {
  id: string;
  numero: string;
  fecha: string;
  estado: EstadoRequerimiento;
  centroCostoId: string;
  centroCosto: string;
  solicitanteId: string;
  solicitante: string;
  aprobadoPorId: string | null;
  aprobadoPor: string | null;
  observaciones: string | null;
  lineas: LineaRequerimientoDetalle[];
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

export function obtenerRequerimiento(
  id: number,
): Promise<RequerimientoDetalle> {
  return apiFetch<RequerimientoDetalle>(`/requerimientos/${id}`);
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

export function obtenerVale(id: number): Promise<ValeSalida> {
  return apiFetch<ValeSalida>(`/vales/${id}`);
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
  consumoValorizado: string;
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
  /** Vendedor por defecto del cliente (id como string, o null). */
  vendedorId?: string | null;
  activo: boolean;
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

export function obtenerClientes(
  incluirInactivos = false,
): Promise<Cliente[]> {
  const cadena = incluirInactivos ? "?incluirInactivos=true" : "";
  return apiFetch<Cliente[]>(`/clientes${cadena}`);
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

export function reactivarCliente(
  id: number,
): Promise<{ id: number; activo: true }> {
  return apiFetch<{ id: number; activo: true }>(
    `/clientes/${id}/reactivar`,
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

export function obtenerProveedores(
  incluirInactivos = false,
): Promise<Proveedor[]> {
  const cadena = incluirInactivos ? "?incluirInactivos=true" : "";
  return apiFetch<Proveedor[]>(`/proveedores${cadena}`);
}

export function crearProveedor(
  datos: CrearProveedorInput,
): Promise<CrearProveedorRespuesta> {
  return apiFetch<CrearProveedorRespuesta>("/proveedores", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export function actualizarProveedor(
  id: number,
  datos: ActualizarProveedorInput,
): Promise<{ id: number }> {
  return apiFetch<{ id: number }>(`/proveedores/${id}`, {
    method: "PATCH",
    body: JSON.stringify(datos),
  });
}

export function desactivarProveedor(
  id: number,
): Promise<{ id: number; activo: false }> {
  return apiFetch<{ id: number; activo: false }>(
    `/proveedores/${id}/desactivar`,
    { method: "POST" },
  );
}

export function reactivarProveedor(
  id: number,
): Promise<{ id: number; activo: true }> {
  return apiFetch<{ id: number; activo: true }>(
    `/proveedores/${id}/reactivar`,
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

/** Item del listado de recepciones (espejo de GET /compras/recepciones). */
export interface Recepcion {
  id: string;
  fecha: string;
  ordenCompraId: string;
  ordenCompraNumero: string;
  proveedor: string;
  comprobante: string;
  moneda: string;
  total: string;
}

/** Linea del detalle de una recepcion con SKU y series recibidas. */
export interface DetalleRecepcionLinea {
  skuId: string;
  skuCodigo: string;
  skuNombre: string;
  cantidad: string;
  costoUnitario: string | null;
  series: string[];
}

/** Detalle completo (espejo de GET /compras/recepciones/:id). */
export interface DetalleRecepcion {
  id: string;
  fecha: string;
  ordenCompraId: string;
  ordenCompraNumero: string;
  proveedor: string;
  tipoDocumentoSunat: string;
  serieComprobante: string;
  numeroComprobante: string;
  fechaEmisionDocumento: string;
  moneda: string;
  tipoCambio: string | null;
  subtotal: string;
  igv: string;
  total: string;
  guiaRemisionProveedor: string | null;
  usuario: string;
  lineas: DetalleRecepcionLinea[];
}

export function obtenerRecepciones(): Promise<Recepcion[]> {
  return apiFetch<Recepcion[]>("/compras/recepciones");
}

export function obtenerDetalleRecepcion(
  id: number | string,
): Promise<DetalleRecepcion> {
  return apiFetch<DetalleRecepcion>(`/compras/recepciones/${id}`);
}

// ── Devoluciones al proveedor ─────────────────────────────────────────────────

export interface LineaDevolucionProveedor {
  id: string;
  skuId: string;
  codigoSku: string | null;
  nombreSku: string | null;
  cantidad: string;
  costoUnitario: string;
  motivo: string | null;
}

export interface DevolucionProveedor {
  id: string;
  numero: string;
  estado: "REGISTRADA" | "ANULADA";
  fecha: string;
  motivo: string | null;
  ordenCompraNumero: string;
  proveedor: string;
  lineas: LineaDevolucionProveedor[];
}

export interface CrearDevolucionProveedorInput {
  recepcionId: number;
  motivo?: string;
  fecha?: string;
  lineas: Array<{ skuId: number; cantidad: string; motivo?: string }>;
}

export function obtenerDevolucionesProveedor(): Promise<DevolucionProveedor[]> {
  return apiFetch<DevolucionProveedor[]>("/devoluciones-proveedor");
}

export function crearDevolucionProveedor(
  datos: CrearDevolucionProveedorInput,
): Promise<{ id: string; numero: string }> {
  return apiFetch<{ id: string; numero: string }>("/devoluciones-proveedor", {
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

/** Item del listado de comprobantes (espejo de GET /ventas/comprobantes). */
export interface Comprobante {
  id: string;
  fechaEmision: string;
  comprobante: string;
  ordenVentaId: string;
  ordenVentaNumero: string;
  cliente: string;
  moneda: string;
  total: string;
}

/** Linea del detalle de un comprobante (lo despachado en este comprobante). */
export interface DetalleComprobanteLinea {
  skuId: string;
  skuCodigo: string;
  skuNombre: string;
  cantidad: string;
  precioUnitario: string | null;
  importe: string;
}

/** Detalle completo (espejo de GET /ventas/comprobantes/:id). */
export interface DetalleComprobante {
  id: string;
  tipoDocumentoSunat: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  cliente: string;
  ordenVentaId: string;
  ordenVentaNumero: string;
  moneda: string;
  tipoCambio: string | null;
  subtotal: string;
  igv: string;
  total: string;
  lineas: DetalleComprobanteLinea[];
}

export function obtenerComprobantes(): Promise<Comprobante[]> {
  return apiFetch<Comprobante[]>("/ventas/comprobantes");
}

export function obtenerDetalleComprobante(
  id: number | string,
): Promise<DetalleComprobante> {
  return apiFetch<DetalleComprobante>(`/ventas/comprobantes/${id}`);
}

// ── Devoluciones de venta (reverso de despacho): tipos ──────────────────────

export type EstadoDevolucionVenta = "REGISTRADA" | "ANULADA";

export interface LineaDevolucionVenta {
  id: string;
  skuId: string;
  codigoSku: string | null;
  nombreSku: string | null;
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
  /** Referencia de la Nota de Credito que sustenta la devolucion. */
  tipoComprobante: string | null;
  serieComprobante: string | null;
  numeroComprobante: string | null;
  fechaComprobante: string | null;
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
  /** Referencia de la Nota de Credito (Tabla 10 SUNAT, por defecto 07). */
  tipoComprobante?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  /** Fecha de emision de la Nota de Credito en ISO 8601. */
  fechaComprobante?: string;
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

export function anularDevolucion(
  id: string,
): Promise<{ id: string; estado: EstadoDevolucionVenta }> {
  return apiFetch<{ id: string; estado: EstadoDevolucionVenta }>(
    `/devoluciones/${id}/anular`,
    { method: "PATCH" },
  );
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

export type EjeRentabilidad = "articulo" | "cliente" | "vendedor" | "linea";

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

// ── Antiguedad de stock ───────────────────────────────────────────────────────

export interface FilaAntiguedad {
  clave: string;
  etiqueta: string;
  cantidad: string;
  valor: string;
  porcentajeValor: string;
}

export interface ReporteAntiguedad {
  generadoEn: string;
  totalCantidad: string;
  totalValor: string;
  rangos: FilaAntiguedad[];
}

export function obtenerAntiguedadStock(): Promise<ReporteAntiguedad> {
  return apiFetch<ReporteAntiguedad>("/reportes/antiguedad-stock");
}

// ── Proyeccion de compra ──────────────────────────────────────────────────────

export interface FilaProyeccion {
  skuId: string;
  codigoParlante: string;
  producto: string;
  unidad: string;
  disponible: string;
  consumoPromedioDiario: string;
  diasStock: string | null;
  sugeridoPedir: string;
}

export interface ReporteProyeccion {
  generadoEn: string;
  dias: number;
  diasCobertura: number;
  filas: FilaProyeccion[];
}

export function obtenerProyeccionCompra(
  dias?: number,
  diasCobertura?: number,
): Promise<ReporteProyeccion> {
  const params = new URLSearchParams();
  if (dias) params.set("dias", String(dias));
  if (diasCobertura) params.set("diasCobertura", String(diasCobertura));
  const cadena = params.toString();
  return apiFetch<ReporteProyeccion>(
    `/reportes/proyeccion-compra${cadena ? `?${cadena}` : ""}`,
  );
}

// ── Kardex anual ──────────────────────────────────────────────────────────────

export interface MesKardexAnual {
  mes: number;
  etiqueta: string;
  entradasCantidad: string;
  entradasValor: string;
  salidasCantidad: string;
  salidasValor: string;
  saldoCantidad: string;
  saldoValor: string;
}

export interface ReporteKardexAnual {
  skuId: string;
  codigoParlante: string;
  producto: string;
  unidad: string;
  anio: number;
  meses: MesKardexAnual[];
  totales: {
    entradasCantidad: string;
    entradasValor: string;
    salidasCantidad: string;
    salidasValor: string;
  };
}

export function obtenerKardexAnual(
  skuId: number,
  anio: number,
): Promise<ReporteKardexAnual> {
  const params = new URLSearchParams({ skuId: String(skuId), anio: String(anio) });
  return apiFetch<ReporteKardexAnual>(`/reportes/kardex-anual?${params.toString()}`);
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
  omitidos: number;
  totalOperativos: number;
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

// ── Auditoría (bitácora de acciones de gobierno): tipos ─────────────────────

export interface RegistroAuditoria {
  id: string;
  accion: string;
  entidad: string;
  /** Id de la entidad afectada; null para acciones sin entidad puntual. */
  entidadId: string | null;
  detalle: string | null;
  /** Fecha y hora del registro en formato ISO 8601. */
  creadoEn: string;
  usuario: { id: string; nombre: string };
}

export interface AuditoriaRespuesta {
  datos: RegistroAuditoria[];
  total: number;
  pagina: number;
  porPagina: number;
}

export interface FiltroAuditoria {
  entidad?: string;
  entidadId?: number;
  usuarioId?: number;
  accion?: string;
  /** Fecha desde en formato ISO 8601 (inicio del rango). */
  desde?: string;
  /** Fecha hasta en formato ISO 8601 (fin del rango). */
  hasta?: string;
  pagina?: number;
  porPagina?: number;
}

// ── Auditoría: funciones de dominio ─────────────────────────────────────────

/** Lista la bitácora de auditoría con filtros y paginación, más reciente primero. */
export function obtenerAuditoria(
  filtro: FiltroAuditoria = {},
): Promise<AuditoriaRespuesta> {
  const params = new URLSearchParams();
  if (filtro.entidad) params.set("entidad", filtro.entidad);
  if (filtro.entidadId !== undefined) {
    params.set("entidadId", String(filtro.entidadId));
  }
  if (filtro.usuarioId !== undefined) {
    params.set("usuarioId", String(filtro.usuarioId));
  }
  if (filtro.accion) params.set("accion", filtro.accion);
  if (filtro.desde) params.set("desde", filtro.desde);
  if (filtro.hasta) params.set("hasta", filtro.hasta);
  if (filtro.pagina) params.set("pagina", String(filtro.pagina));
  if (filtro.porPagina) params.set("porPagina", String(filtro.porPagina));
  const cadena = params.toString();
  return apiFetch<AuditoriaRespuesta>(`/auditoria${cadena ? `?${cadena}` : ""}`);
}

// ── Contabilidad: asientos configurables (estilo CONCAR): tipos ─────────────

/** Conceptos contables soportados para configurar cuentas debe/haber. */
export type ConceptoContable =
  | "COSTO_VENTA"
  | "CONSUMO"
  | "COMPRA"
  | "DEVOLUCION";

/** Tipos de asiento que se pueden generar (conceptos con movimientos valorizados). */
export type TipoAsiento = "COSTO_VENTA" | "CONSUMO" | "COMPRA" | "DEVOLUCION";

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

// ── Dashboard: tipos ────────────────────────────────────────────────────────

export interface DashboardInventario {
  /** Valor total del inventario (Decimal 2 dec en texto). */
  valorTotal: string;
  /** Valor inmovilizado/deteriorado (Decimal 2 dec en texto). */
  valorDeteriorado: string;
  skusActivos: number;
  /** ItemStock con disponible > 0. */
  posicionesConStock: number;
  skusSinStock: number;
}

export interface DashboardReposicionItem {
  /** BigInt serializado como texto. */
  skuId: string;
  codigoParlante: string;
  producto: string;
  /** Disponible total del SKU (Decimal 8 dec en texto). */
  disponible: string;
  /** Stock minimo del SKU (Decimal 8 dec en texto). */
  stockMinimo: string;
  /** Sugerido a pedir = max(stockMinimo - disponible, 0) (Decimal 8 dec). */
  sugerido: string;
}

export interface DashboardReposicion {
  /** Conteo total de SKUs bajo minimo. */
  bajoMinimo: number;
  /** Top 6, mayor faltante primero. */
  items: DashboardReposicionItem[];
}

export interface DashboardPendientes {
  /** RequerimientoCompra en estado BORRADOR. */
  requerimientosPorAprobar: number;
  /** OrdenCompra en estado EMITIDA o PARCIAL. */
  ocPorRecibir: number;
  /** OrdenVenta en estado PENDIENTE o PARCIAL. */
  ventasPorDespachar: number;
}

export interface DashboardPeriodo {
  /** Periodo contable actual en formato AAAAMM (ej. "202606"). */
  actual: string;
  estado: "ABIERTO" | "CERRADO";
  /** Movimientos de entrada del periodo actual. */
  movimientosEntrada: number;
  /** Movimientos de salida del periodo actual. */
  movimientosSalida: number;
}

export interface DashboardActividad {
  accion: string;
  entidad: string;
  detalle: string | null;
  /** Fecha de creacion en ISO 8601. */
  creadoEn: string;
  /** Nombre del usuario que ejecuto la accion. */
  usuario: string;
}

export interface Dashboard {
  inventario: DashboardInventario;
  reposicion: DashboardReposicion;
  pendientes: DashboardPendientes;
  periodo: DashboardPeriodo;
  /** Ultimos 8 registros de auditoria, mas recientes primero. */
  actividad: DashboardActividad[];
}

// ── Dashboard: funciones de dominio ─────────────────────────────────────────

/** Resumen gerencial del panel principal en una sola llamada. */
export function obtenerDashboard(): Promise<Dashboard> {
  return apiFetch<Dashboard>("/dashboard");
}
