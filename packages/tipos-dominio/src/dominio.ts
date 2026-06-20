/**
 * Enums de dominio del inventario. Se mapean 1:1 con los enums de Prisma.
 */

/** Tipo de movimiento del ledger (kardex). */
export const TIPO_MOVIMIENTO = {
  ENTRADA_COMPRA: "ENTRADA_COMPRA",
  ENTRADA_AJUSTE: "ENTRADA_AJUSTE",
  ENTRADA_TRANSFERENCIA: "ENTRADA_TRANSFERENCIA",
  ENTRADA_DEVOLUCION: "ENTRADA_DEVOLUCION",
  ENTRADA_INICIAL: "ENTRADA_INICIAL",
  SALIDA_VENTA: "SALIDA_VENTA",
  SALIDA_AJUSTE: "SALIDA_AJUSTE",
  SALIDA_TRANSFERENCIA: "SALIDA_TRANSFERENCIA",
  SALIDA_MERMA: "SALIDA_MERMA",
  SALIDA_CONSUMO: "SALIDA_CONSUMO",
  // Cambio de condicion: la existencia fisica no entra ni sale del sistema,
  // solo pasa de "buen uso" (disponible) a "deteriorado" o viceversa.
  DETERIORO: "DETERIORO",
  RECUPERACION: "RECUPERACION",
  // Baja real: la existencia deteriorada se retira del sistema (desmedro).
  BAJA_DETERIORO: "BAJA_DETERIORO",
} as const;
export type TipoMovimiento =
  (typeof TIPO_MOVIMIENTO)[keyof typeof TIPO_MOVIMIENTO];

/** Sentido del movimiento. */
export const SIGNO_MOVIMIENTO = {
  ENTRADA: "ENTRADA",
  SALIDA: "SALIDA",
} as const;
export type SignoMovimiento =
  (typeof SIGNO_MOVIMIENTO)[keyof typeof SIGNO_MOVIMIENTO];

/** Documento de origen del movimiento (polimorfico ligero). */
export const TIPO_DOCUMENTO_ORIGEN = {
  ORDEN_COMPRA: "ORDEN_COMPRA",
  RECEPCION: "RECEPCION",
  VENTA: "VENTA",
  AJUSTE: "AJUSTE",
  TRANSFERENCIA: "TRANSFERENCIA",
  CONTEO_FISICO: "CONTEO_FISICO",
  INICIAL: "INICIAL",
  VALE_SALIDA: "VALE_SALIDA",
} as const;
export type TipoDocumentoOrigen =
  (typeof TIPO_DOCUMENTO_ORIGEN)[keyof typeof TIPO_DOCUMENTO_ORIGEN];

/** Estado de un lote. */
export const ESTADO_LOTE = {
  ACTIVO: "ACTIVO",
  AGOTADO: "AGOTADO",
  BLOQUEADO: "BLOQUEADO",
  VENCIDO: "VENCIDO",
} as const;
export type EstadoLote = (typeof ESTADO_LOTE)[keyof typeof ESTADO_LOTE];

/** Mapa de TipoMovimiento -> su sentido (entrada/salida). */
export const SIGNO_POR_TIPO: Record<TipoMovimiento, SignoMovimiento> = {
  ENTRADA_COMPRA: SIGNO_MOVIMIENTO.ENTRADA,
  ENTRADA_AJUSTE: SIGNO_MOVIMIENTO.ENTRADA,
  ENTRADA_TRANSFERENCIA: SIGNO_MOVIMIENTO.ENTRADA,
  ENTRADA_DEVOLUCION: SIGNO_MOVIMIENTO.ENTRADA,
  ENTRADA_INICIAL: SIGNO_MOVIMIENTO.ENTRADA,
  SALIDA_VENTA: SIGNO_MOVIMIENTO.SALIDA,
  SALIDA_AJUSTE: SIGNO_MOVIMIENTO.SALIDA,
  SALIDA_TRANSFERENCIA: SIGNO_MOVIMIENTO.SALIDA,
  SALIDA_MERMA: SIGNO_MOVIMIENTO.SALIDA,
  SALIDA_CONSUMO: SIGNO_MOVIMIENTO.SALIDA,
  // DETERIORO retira stock de la condicion "disponible" (signo SALIDA);
  // RECUPERACION lo reintegra a "disponible" (signo ENTRADA). En ambos casos
  // el stock fisico total no cambia: es la misma existencia cambiando de condicion.
  DETERIORO: SIGNO_MOVIMIENTO.SALIDA,
  RECUPERACION: SIGNO_MOVIMIENTO.ENTRADA,
  // BAJA_DETERIORO es una salida fisica real desde el stock deteriorado.
  BAJA_DETERIORO: SIGNO_MOVIMIENTO.SALIDA,
};
