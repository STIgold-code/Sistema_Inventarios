import { TIPO_DOCUMENTO } from "@bm/tipos";

/**
 * Opciones legibles para el selector de tipo de comprobante (Tabla 10 SUNAT,
 * Catalogo 01). Los codigos provienen de @bm/tipos para no duplicar el catalogo
 * oficial; aqui solo se les asigna una etiqueta amigable para la UI.
 *
 * En recepcion de compras lo habitual es Factura o Liquidacion de compra, pero
 * se exponen los comprobantes de compra mas frecuentes para cubrir los casos
 * reales del negocio.
 */
export interface OpcionComprobante {
  codigo: string;
  etiqueta: string;
}

export const COMPROBANTES_COMPRA: readonly OpcionComprobante[] = [
  { codigo: TIPO_DOCUMENTO.FACTURA, etiqueta: "Factura" },
  { codigo: TIPO_DOCUMENTO.BOLETA_VENTA, etiqueta: "Boleta de venta" },
  { codigo: TIPO_DOCUMENTO.LIQUIDACION_COMPRA, etiqueta: "Liquidación de compra" },
  { codigo: TIPO_DOCUMENTO.NOTA_CREDITO, etiqueta: "Nota de crédito" },
  { codigo: TIPO_DOCUMENTO.NOTA_DEBITO, etiqueta: "Nota de débito" },
  { codigo: TIPO_DOCUMENTO.TICKET, etiqueta: "Ticket o cinta de máquina registradora" },
  { codigo: TIPO_DOCUMENTO.DUA_IMPORTACION, etiqueta: "Declaración Única de Aduanas (importación)" },
  { codigo: TIPO_DOCUMENTO.OTROS, etiqueta: "Otros" },
] as const;

/**
 * Opciones para el comprobante de venta al despachar. A diferencia de compras,
 * en una emision de venta solo aplican los comprobantes que el negocio emite:
 * factura, boleta y sus notas de credito/debito (Tabla 10 SUNAT, Catalogo 01).
 */
export const COMPROBANTES_VENTA: readonly OpcionComprobante[] = [
  { codigo: TIPO_DOCUMENTO.FACTURA, etiqueta: "Factura" },
  { codigo: TIPO_DOCUMENTO.BOLETA_VENTA, etiqueta: "Boleta de venta" },
  { codigo: TIPO_DOCUMENTO.NOTA_CREDITO, etiqueta: "Nota de crédito" },
  { codigo: TIPO_DOCUMENTO.NOTA_DEBITO, etiqueta: "Nota de débito" },
] as const;
