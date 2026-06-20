import { Injectable } from "@nestjs/common";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";

/**
 * Definicion de una columna del reporte exportable.
 */
export interface ColumnaExport {
  /** Texto del encabezado de la columna. */
  header: string;
  /** Clave que mapea al campo correspondiente en cada fila. */
  key: string;
  /** Ancho de la columna en caracteres. Por defecto 18. */
  width?: number;
  /** Alineacion horizontal del contenido. Por defecto 'left'. */
  align?: "left" | "right" | "center";
  /**
   * Si es true, la columna es numerica: se aplica formato de numero/moneda
   * y se suma en la fila de totales.
   */
  total?: boolean;
}

/**
 * Opciones para construir un libro de Excel de marca BM.
 */
export interface OpcionesExport {
  /** Titulo principal del reporte. */
  titulo: string;
  /** Periodo o rango de fechas del reporte (opcional). */
  periodo?: string;
  /** Nombre de la empresa para el encabezado (opcional). */
  empresa?: string;
  /** Definicion de columnas de la tabla. */
  columnas: ColumnaExport[];
  /** Filas de datos. Cada fila mapea key de columna a su valor. */
  filas: Record<string, string | number>[];
}

const COLOR_GRAFITO = "FF1F2328";
const COLOR_DORADO = "FFF6B60B";
const COLOR_BLANCO = "FFFFFFFF";
const COLOR_GRAFITO_SUAVE = "FF3A3F45";

const RUTA_LOGO = join(__dirname, "..", "..", "..", "..", "assets", "logo-bm.png");

/**
 * Servicio reutilizable que genera libros de Excel con la identidad visual
 * ejecutiva de BM (logo, colores grafito/dorado, encabezado de marca,
 * formato de moneda y fila de totales). Cualquier modulo puede inyectarlo
 * para exportar sus reportes a .xlsx.
 */
@Injectable()
export class ExcelExportService {
  /**
   * Construye un libro de Excel de marca y devuelve su contenido como Buffer
   * listo para enviarse como adjunto al cliente.
   */
  async construir(opts: OpcionesExport): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "BM Inventarios";
    workbook.created = new Date();

    const hoja = workbook.addWorksheet("Reporte", {
      views: [{ state: "frozen", ySplit: 0 }],
    });

    const totalColumnas = opts.columnas.length;
    const ultimaColumnaLetra = this.letraColumna(totalColumnas);

    const filaTabla = this.escribirEncabezadoMarca(
      workbook,
      hoja,
      opts,
      ultimaColumnaLetra,
    );

    this.configurarColumnas(hoja, opts.columnas);
    this.escribirEncabezadoTabla(hoja, opts.columnas, filaTabla);
    const primeraFilaDatos = filaTabla + 1;
    const ultimaFilaDatos = this.escribirFilas(
      hoja,
      opts.columnas,
      opts.filas,
      primeraFilaDatos,
    );
    this.escribirTotales(
      hoja,
      opts.columnas,
      opts.filas,
      ultimaFilaDatos + 1,
    );

    // Congelar el encabezado de tabla (todo lo de marca + cabecera).
    hoja.views = [{ state: "frozen", ySplit: filaTabla }];

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Escribe el bloque de marca (logo + empresa + titulo + periodo) y devuelve
   * el numero de fila donde debe ir el encabezado de la tabla.
   */
  private escribirEncabezadoMarca(
    workbook: ExcelJS.Workbook,
    hoja: ExcelJS.Worksheet,
    opts: OpcionesExport,
    ultimaColumnaLetra: string,
  ): number {
    // Logo arriba a la izquierda, si existe.
    if (existsSync(RUTA_LOGO)) {
      const imagenId = workbook.addImage({
        buffer: readFileSync(RUTA_LOGO),
        extension: "png",
      });
      hoja.addImage(imagenId, {
        tl: { col: 0, row: 0 },
        ext: { width: 120, height: 60 },
      });
    }

    // Empresa.
    if (opts.empresa) {
      const filaEmpresa = hoja.getCell("C1");
      filaEmpresa.value = opts.empresa;
      filaEmpresa.font = { bold: true, size: 14, color: { argb: COLOR_GRAFITO } };
      hoja.mergeCells(`C1:${ultimaColumnaLetra}1`);
    }

    // Titulo.
    const celdaTitulo = hoja.getCell("C2");
    celdaTitulo.value = opts.titulo;
    celdaTitulo.font = { bold: true, size: 12, color: { argb: COLOR_GRAFITO } };
    hoja.mergeCells(`C2:${ultimaColumnaLetra}2`);

    // Periodo / fecha de generacion.
    const celdaPeriodo = hoja.getCell("C3");
    celdaPeriodo.value = opts.periodo
      ? `Periodo: ${opts.periodo}`
      : `Generado: ${this.formatearFecha(new Date())}`;
    celdaPeriodo.font = { italic: true, size: 10, color: { argb: COLOR_GRAFITO_SUAVE } };
    hoja.mergeCells(`C3:${ultimaColumnaLetra}3`);

    // El logo ocupa filas 1-3; la tabla arranca en la fila 5 (deja una de aire).
    return 5;
  }

  /** Aplica ancho y alineacion a cada columna. */
  private configurarColumnas(
    hoja: ExcelJS.Worksheet,
    columnas: ColumnaExport[],
  ): void {
    hoja.columns = columnas.map((columna) => ({
      key: columna.key,
      width: columna.width ?? 18,
    }));
  }

  /** Escribe la fila de encabezado de la tabla con fondo grafito y texto dorado. */
  private escribirEncabezadoTabla(
    hoja: ExcelJS.Worksheet,
    columnas: ColumnaExport[],
    fila: number,
  ): void {
    const filaEncabezado = hoja.getRow(fila);
    columnas.forEach((columna, indice) => {
      const celda = filaEncabezado.getCell(indice + 1);
      celda.value = columna.header;
      celda.font = { bold: true, color: { argb: COLOR_DORADO } };
      celda.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_GRAFITO },
      };
      celda.alignment = {
        horizontal: columna.align ?? "left",
        vertical: "middle",
      };
      celda.border = this.bordeFino();
    });
    filaEncabezado.height = 20;
    filaEncabezado.commit();
  }

  /** Escribe las filas de datos. Devuelve el numero de la ultima fila escrita. */
  private escribirFilas(
    hoja: ExcelJS.Worksheet,
    columnas: ColumnaExport[],
    filas: Record<string, string | number>[],
    primeraFila: number,
  ): number {
    let filaActual = primeraFila;
    for (const fila of filas) {
      const filaHoja = hoja.getRow(filaActual);
      columnas.forEach((columna, indice) => {
        const celda = filaHoja.getCell(indice + 1);
        celda.value = fila[columna.key] ?? "";
        celda.alignment = {
          horizontal: columna.align ?? (columna.total ? "right" : "left"),
        };
        celda.border = this.bordeFino();
        if (columna.total) {
          celda.numFmt = '#,##0.00';
        }
      });
      filaHoja.commit();
      filaActual += 1;
    }
    return filaActual - 1;
  }

  /** Escribe la fila de totales (suma de columnas marcadas como total). */
  private escribirTotales(
    hoja: ExcelJS.Worksheet,
    columnas: ColumnaExport[],
    filas: Record<string, string | number>[],
    fila: number,
  ): void {
    const hayTotales = columnas.some((columna) => columna.total);
    if (!hayTotales || filas.length === 0) {
      return;
    }

    const filaTotales = hoja.getRow(fila);
    let etiquetaPuesta = false;

    columnas.forEach((columna, indice) => {
      const celda = filaTotales.getCell(indice + 1);
      celda.font = { bold: true, color: { argb: COLOR_BLANCO } };
      celda.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_GRAFITO_SUAVE },
      };
      celda.border = this.bordeFino();

      if (columna.total) {
        const suma = filas.reduce((acumulado, item) => {
          const valor = item[columna.key];
          return acumulado + (typeof valor === "number" ? valor : 0);
        }, 0);
        celda.value = suma;
        celda.numFmt = '#,##0.00';
        celda.alignment = { horizontal: "right" };
      } else if (!etiquetaPuesta) {
        celda.value = "TOTAL";
        celda.alignment = { horizontal: columna.align ?? "left" };
        etiquetaPuesta = true;
      }
    });
    filaTotales.height = 18;
    filaTotales.commit();
  }

  /** Borde fino estandar para celdas de la tabla. */
  private bordeFino(): Partial<ExcelJS.Borders> {
    const estilo: ExcelJS.Border = {
      style: "thin",
      color: { argb: "FFD0D0D0" },
    };
    return { top: estilo, left: estilo, bottom: estilo, right: estilo };
  }

  /** Convierte un indice de columna (1-based) a su letra de Excel (A, B, ... AA). */
  private letraColumna(indice: number): string {
    let resultado = "";
    let n = indice;
    while (n > 0) {
      const resto = (n - 1) % 26;
      resultado = String.fromCharCode(65 + resto) + resultado;
      n = Math.floor((n - 1) / 26);
    }
    return resultado;
  }

  /** Formatea una fecha como dd/mm/aaaa para el encabezado. */
  private formatearFecha(fecha: Date): string {
    const dia = String(fecha.getDate()).padStart(2, "0");
    const mes = String(fecha.getMonth() + 1).padStart(2, "0");
    const anio = fecha.getFullYear();
    return `${dia}/${mes}/${anio}`;
  }
}
