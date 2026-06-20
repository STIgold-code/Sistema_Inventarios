import type { Response } from "express";

/** Content-Type oficial de un libro .xlsx (OpenXML spreadsheet). */
const TIPO_XLSX =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Fecha local en formato AAAA-MM-DD para nombrar archivos exportados. */
export function fechaArchivo(fecha: Date = new Date()): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, "0");
  const dia = String(fecha.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

/**
 * Envia un Buffer de Excel como descarga adjunta, seteando el Content-Type
 * de xlsx y el Content-Disposition con el nombre de archivo indicado.
 */
export function enviarXlsx(
  res: Response,
  buffer: Buffer,
  nombreArchivo: string,
): void {
  res.setHeader("Content-Type", TIPO_XLSX);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${nombreArchivo}"`,
  );
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}
