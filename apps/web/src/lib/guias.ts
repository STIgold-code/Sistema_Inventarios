import { MOTIVO_TRASLADO } from "@bm/tipos";

/**
 * Catalogo legible de "Motivo de traslado" (Catalogo 20 SUNAT) para la guia de
 * remision. Los codigos provienen de @bm/tipos para no duplicar el catalogo
 * oficial; aqui solo se les asigna una etiqueta amigable para la UI.
 */
export interface OpcionMotivo {
  codigo: string;
  etiqueta: string;
}

/** Etiquetas legibles por clave del catalogo MOTIVO_TRASLADO. */
const ETIQUETAS_POR_CLAVE: Record<keyof typeof MOTIVO_TRASLADO, string> = {
  VENTA: "Venta",
  COMPRA: "Compra",
  VENTA_CON_ENTREGA_A_TERCEROS: "Venta con entrega a terceros",
  TRASLADO_ENTRE_ESTABLECIMIENTOS_MISMA_EMPRESA:
    "Traslado entre establecimientos de la misma empresa",
  CONSIGNACION: "Consignación",
  DEVOLUCION: "Devolución",
  RECOJO_BIENES_TRANSFORMADOS: "Recojo de bienes transformados",
  IMPORTACION: "Importación",
  EXPORTACION: "Exportación",
  TRASLADO_DE_BIENES_PARA_TRANSFORMACION: "Traslado de bienes para transformación",
  AUTOCONSUMO: "Autoconsumo",
  VENTA_SUJETA_CONFIRMACION: "Venta sujeta a confirmación del comprador",
  OTROS: "Otros",
  TRASLADO_EMISOR_ITINERANTE_CP: "Traslado por emisor itinerante de comprobantes de pago",
  TRASLADO_ZONA_PRIMARIA: "Traslado a zona primaria",
};

/** Opciones para el selector de motivo, ordenadas por codigo. */
export const MOTIVOS_GUIA: readonly OpcionMotivo[] = (
  Object.entries(MOTIVO_TRASLADO) as Array<[keyof typeof MOTIVO_TRASLADO, string]>
)
  .map(([clave, codigo]) => ({ codigo, etiqueta: ETIQUETAS_POR_CLAVE[clave] }))
  .sort((a, b) => a.codigo.localeCompare(b.codigo));

const MOTIVO_POR_CODIGO = new Map(MOTIVOS_GUIA.map((m) => [m.codigo, m.etiqueta]));

/** Texto humano de un codigo de motivo. Devuelve el codigo si no se reconoce. */
export function etiquetaMotivo(codigo: string): string {
  return MOTIVO_POR_CODIGO.get(codigo) ?? codigo;
}
