/**
 * Catalogos oficiales SUNAT necesarios para los Registros de Inventario
 * Permanente (Formato 12.1 - Unidades Fisicas, Formato 13.1 - Valorizado).
 *
 * Fuentes: Anexo 2 R.S. 042-2018/SUNAT, R.S. 234-2006/SUNAT.
 * Estos codigos NO son texto libre: el PLE rechaza valores fuera de catalogo.
 */

/** Tabla 5 - Tipo de existencia. */
export const TIPO_EXISTENCIA = {
  MERCADERIA: "01",
  PRODUCTO_TERMINADO: "02",
  MATERIA_PRIMA: "03",
  ENVASES_EMBALAJES: "04",
  SUMINISTROS_DIVERSOS: "05",
  EXISTENCIAS_POR_RECIBIR: "06",
  SUBPRODUCTOS_DESECHOS: "07",
  OTROS: "99",
} as const;
export type TipoExistencia = (typeof TIPO_EXISTENCIA)[keyof typeof TIPO_EXISTENCIA];

/** Tabla 6 - Unidad de medida (UN/ECE Rec 20). Subconjunto industrial. */
export const UNIDAD_MEDIDA_SUNAT = {
  UNIDAD: "NIU",
  KILOGRAMO: "KGM",
  TONELADA: "TNE",
  GRAMO: "GRM",
  METRO: "MTR",
  METRO_CUADRADO: "MTK",
  METRO_CUBICO: "MTQ",
  LITRO: "LTR",
  GALON: "GLL",
  CAJA: "BX",
  PAR: "PR",
  JUEGO: "SET",
  BOLSA: "BG",
  CIENTO: "CEN",
  MILLAR: "MLL",
} as const;
export type UnidadMedidaSunat =
  (typeof UNIDAD_MEDIDA_SUNAT)[keyof typeof UNIDAD_MEDIDA_SUNAT];

/** Tabla 2 - Tipo de documento de identidad del adquirente/destinatario. */
export const TIPO_DOCUMENTO_IDENTIDAD = {
  DOC_TRIB_NO_DOMICILIADO: "0",
  DNI: "1",
  CARNET_EXTRANJERIA: "4",
  RUC: "6",
  PASAPORTE: "7",
  CEDULA_DIPLOMATICA: "A",
  NO_DOMICILIADO_SIN_RUC: "B",
  TIN_DOC_TRIB_PP_NN: "C",
  IN_DOC_TRIB_PP_JJ: "D",
  TAM_TARJETA_ANDINA: "E",
} as const;
export type TipoDocumentoIdentidad =
  (typeof TIPO_DOCUMENTO_IDENTIDAD)[keyof typeof TIPO_DOCUMENTO_IDENTIDAD];

/**
 * Catalogo 20 - Motivo de traslado (guia de remision remitente).
 * Fuente: Anexo III R.S. 188-2010/SUNAT y modificatorias (guia electronica).
 */
export const MOTIVO_TRASLADO = {
  VENTA: "01",
  COMPRA: "02",
  VENTA_CON_ENTREGA_A_TERCEROS: "03",
  TRASLADO_ENTRE_ESTABLECIMIENTOS_MISMA_EMPRESA: "04",
  CONSIGNACION: "05",
  DEVOLUCION: "06",
  RECOJO_BIENES_TRANSFORMADOS: "07",
  IMPORTACION: "08",
  EXPORTACION: "09",
  TRASLADO_DE_BIENES_PARA_TRANSFORMACION: "10",
  AUTOCONSUMO: "11",
  VENTA_SUJETA_CONFIRMACION: "12",
  OTROS: "13",
  TRASLADO_EMISOR_ITINERANTE_CP: "14",
  TRASLADO_ZONA_PRIMARIA: "18",
} as const;
export type MotivoTraslado =
  (typeof MOTIVO_TRASLADO)[keyof typeof MOTIVO_TRASLADO];

/** Tabla 10 - Tipo de documento (Catalogo 01 de comprobantes). */
export const TIPO_DOCUMENTO = {
  OTROS_NO_DOMICILIADOS: "00",
  FACTURA: "01",
  BOLETA_VENTA: "03",
  LIQUIDACION_COMPRA: "04",
  NOTA_CREDITO: "07",
  NOTA_DEBITO: "08",
  GUIA_REMISION_REMITENTE: "09",
  TICKET: "12",
  GUIA_REMISION_TRANSPORTISTA: "31",
  DUA_IMPORTACION: "50",
  COMPROBANTE_NO_DOMICILIADO: "91",
  HOJA_LIQUIDACION_IMPORTACION: "96",
  OTROS: "99",
} as const;
export type TipoDocumento = (typeof TIPO_DOCUMENTO)[keyof typeof TIPO_DOCUMENTO];

/** Tabla 12 - Tipo de operacion (entradas/salidas de inventario). */
export const TIPO_OPERACION = {
  VENTA: "01",
  COMPRA: "02",
  CONSIGNACION_RECIBIDA: "03",
  CONSIGNACION_ENTREGADA: "04",
  DEVOLUCION_RECIBIDA: "05",
  DEVOLUCION_ENTREGADA: "06",
  PROMOCION: "07",
  PREMIO: "08",
  DONACION: "09",
  SALIDA_PRODUCCION: "10",
  TRANSFERENCIA: "11",
  RETIRO: "12",
  MERMAS: "13",
  DESMEDROS: "14",
  DESTRUCCION: "15",
  SALDO_INICIAL: "16",
  OTROS: "99",
} as const;
export type TipoOperacion = (typeof TIPO_OPERACION)[keyof typeof TIPO_OPERACION];

/** Tabla 14 - Metodo de valuacion de existencias. */
export const METODO_VALUACION = {
  PEPS: "1", // Primeras entradas primeras salidas (FIFO)
  PROMEDIO: "2", // Promedio diario/mensual/anual (ponderado o movil)
  IDENTIFICACION_ESPECIFICA: "3",
  INVENTARIO_AL_DETALLE: "4",
  EXISTENCIAS_BASICAS: "5",
} as const;
export type MetodoValuacion =
  (typeof METODO_VALUACION)[keyof typeof METODO_VALUACION];

/** Indicador de estado de la operacion en el detalle PLE. */
export const INDICADOR_ESTADO = {
  PERIODO_ACTUAL: "1",
  PERIODO_ANTERIOR_NO_ANOTADA: "8",
  PERIODO_ANTERIOR_YA_ANOTADA: "9",
} as const;
export type IndicadorEstado =
  (typeof INDICADOR_ESTADO)[keyof typeof INDICADOR_ESTADO];

/** Codigos de libro PLE para inventario. */
export const CODIGO_LIBRO_PLE = {
  INVENTARIO_UNIDADES_FISICAS: "120100", // Formato 12.1
  INVENTARIO_VALORIZADO: "130100", // Formato 13.1
} as const;

/**
 * Umbral de obligatoriedad expresado en UIT (NO en soles: la UIT cambia
 * cada anio por D.S.). Multiplicar por la UIT vigente para obtener el monto.
 */
export const UMBRAL_OBLIGATORIEDAD_UIT = {
  /** > 1500 UIT: obligado a 13.1 valorizado + Registro de Costos. */
  VALORIZADO: 1500,
  /** 500 a 1500 UIT: obligado solo a 12.1 unidades fisicas. */
  UNIDADES_FISICAS: 500,
} as const;
