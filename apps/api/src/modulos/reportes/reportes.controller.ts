import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import {
  ExcelExportService,
  type ColumnaExport,
} from "../comun/export/excel-export.service.js";
import { enviarXlsx, fechaArchivo } from "../comun/export/enviar-xlsx.js";
import { ReportesService } from "./reportes.service.js";

@Controller("reportes")
@UseGuards(JwtGuard, PermisosGuard)
export class ReportesController {
  constructor(
    private readonly reportes: ReportesService,
    private readonly excel: ExcelExportService,
  ) {}

  @Get("valorizacion")
  @Permisos("reporte.ver")
  valorizacion(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("pagina") pagina?: string,
    @Query("porPagina") porPagina?: string,
  ) {
    const p = Math.max(1, Number(pagina) || 1);
    const pp = Math.min(100, Math.max(1, Number(porPagina) || 50));
    return this.reportes.valorizacion(usuario.empresaId, p, pp);
  }

  @Get("alertas-stock")
  @Permisos("reporte.ver")
  alertas(@UsuarioActual() usuario: UsuarioRequest) {
    return this.reportes.alertasStockMinimo(usuario.empresaId);
  }

  @Get("consumo")
  @Permisos("reporte.ver")
  consumo(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("desde") desde: string,
    @Query("hasta") hasta: string,
    @Query("agrupar") agrupar?: string,
  ) {
    const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
    if (!desde || !REGEX_FECHA.test(desde)) {
      throw new BadRequestException("desde debe tener formato AAAA-MM-DD");
    }
    if (!hasta || !REGEX_FECHA.test(hasta)) {
      throw new BadRequestException("hasta debe tener formato AAAA-MM-DD");
    }
    if (hasta < desde) {
      throw new BadRequestException("hasta no puede ser anterior a desde");
    }
    const ejes = ["centroCosto", "solicitante", "ordenTrabajo"] as const;
    const eje = agrupar ?? "centroCosto";
    if (!ejes.includes(eje as (typeof ejes)[number])) {
      throw new BadRequestException(
        "agrupar debe ser centroCosto, solicitante u ordenTrabajo",
      );
    }
    return this.reportes.consumoValorizado(
      usuario.empresaId,
      desde,
      hasta,
      eje as (typeof ejes)[number],
    );
  }

  @Get("reposicion")
  @Permisos("reporte.ver")
  reposicion(@UsuarioActual() usuario: UsuarioRequest) {
    return this.reportes.reposicion(usuario.empresaId);
  }

  @Get("abc")
  @Permisos("reporte.ver")
  abc(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("desde") desde: string,
    @Query("hasta") hasta: string,
  ) {
    const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
    if (!desde || !REGEX_FECHA.test(desde)) {
      throw new BadRequestException("desde debe tener formato AAAA-MM-DD");
    }
    if (!hasta || !REGEX_FECHA.test(hasta)) {
      throw new BadRequestException("hasta debe tener formato AAAA-MM-DD");
    }
    if (hasta < desde) {
      throw new BadRequestException("hasta no puede ser anterior a desde");
    }
    return this.reportes.clasificacionAbc(usuario.empresaId, desde, hasta);
  }

  @Get("rentabilidad")
  @Permisos("venta.gestionar")
  rentabilidad(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("desde") desde: string,
    @Query("hasta") hasta: string,
    @Query("agrupar") agrupar?: string,
  ) {
    const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
    if (!desde || !REGEX_FECHA.test(desde)) {
      throw new BadRequestException("desde debe tener formato AAAA-MM-DD");
    }
    if (!hasta || !REGEX_FECHA.test(hasta)) {
      throw new BadRequestException("hasta debe tener formato AAAA-MM-DD");
    }
    if (hasta < desde) {
      throw new BadRequestException("hasta no puede ser anterior a desde");
    }
    const ejes = ["articulo", "cliente", "vendedor", "linea"] as const;
    const eje = agrupar ?? "articulo";
    if (!ejes.includes(eje as (typeof ejes)[number])) {
      throw new BadRequestException("agrupar debe ser articulo, cliente, vendedor o linea");
    }
    return this.reportes.rentabilidad(
      usuario.empresaId,
      desde,
      hasta,
      eje as (typeof ejes)[number],
    );
  }

  @Get("antiguedad-stock")
  @Permisos("reporte.ver")
  antiguedadStock(@UsuarioActual() usuario: UsuarioRequest) {
    return this.reportes.antiguedadStock(usuario.empresaId);
  }

  @Get("proyeccion-compra")
  @Permisos("reporte.ver")
  proyeccionCompra(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("dias") dias?: string,
    @Query("diasCobertura") diasCobertura?: string,
  ) {
    const d = Math.min(365, Math.max(1, Number(dias) || 90));
    const dc = Math.min(365, Math.max(1, Number(diasCobertura) || 30));
    return this.reportes.proyeccionCompra(usuario.empresaId, d, dc);
  }

  @Get("kardex-anual")
  @Permisos("reporte.ver")
  kardexAnual(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("skuId") skuId?: string,
    @Query("anio") anio?: string,
  ) {
    if (!skuId || !/^\d+$/.test(skuId)) {
      throw new BadRequestException("skuId es obligatorio y debe ser numérico");
    }
    if (!anio || !/^\d{4}$/.test(anio)) {
      throw new BadRequestException("anio debe tener formato AAAA");
    }
    return this.reportes.kardexAnual(usuario.empresaId, BigInt(skuId), Number(anio));
  }

  @Get("reposicion/export.xlsx")
  @Permisos("reporte.ver")
  async reposicionExport(
    @UsuarioActual() usuario: UsuarioRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { filas } = await this.reportes.reposicion(usuario.empresaId);

    const columnas: ColumnaExport[] = [
      { header: "Codigo", key: "codigo", width: 16 },
      { header: "Producto", key: "producto", width: 40 },
      { header: "Stock actual", key: "stockActual", width: 14, align: "right" },
      { header: "Minimo", key: "minimo", width: 14, align: "right" },
      { header: "Maximo", key: "maximo", width: 14, align: "right" },
      { header: "Punto reposicion", key: "puntoReposicion", width: 16, align: "right" },
      { header: "Sugerido a pedir", key: "sugerido", width: 16, align: "right" },
    ];

    const datos = filas.map((f) => ({
      codigo: f.codigoParlante,
      producto: f.producto,
      stockActual: Number(f.disponible),
      minimo: f.stockMinimo !== null ? Number(f.stockMinimo) : "",
      maximo: f.stockMaximo !== null ? Number(f.stockMaximo) : "",
      puntoReposicion:
        f.puntoReposicion !== null ? Number(f.puntoReposicion) : "",
      sugerido: f.sugeridoPedir !== null ? Number(f.sugeridoPedir) : "",
    }));

    const buffer = await this.excel.construir({
      titulo: "Reporte de reposicion",
      columnas,
      filas: datos,
    });
    enviarXlsx(res, buffer, `reposicion_${fechaArchivo()}.xlsx`);
  }

  @Get("abc/export.xlsx")
  @Permisos("reporte.ver")
  async abcExport(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("desde") desde: string,
    @Query("hasta") hasta: string,
    @Res() res: Response,
  ): Promise<void> {
    this.validarRango(desde, hasta);
    const reporte = await this.reportes.clasificacionAbc(
      usuario.empresaId,
      desde,
      hasta,
    );

    const columnas: ColumnaExport[] = [
      { header: "Codigo", key: "codigo", width: 16 },
      { header: "Producto", key: "producto", width: 40 },
      { header: "Cantidad consumo", key: "cantidad", width: 16, align: "right" },
      { header: "Valor consumo S/", key: "valor", width: 16, align: "right", total: true },
      { header: "% participacion", key: "participacion", width: 14, align: "right" },
      { header: "% acumulado", key: "acumulada", width: 14, align: "right" },
      { header: "Clase", key: "clase", width: 10, align: "center" },
    ];

    const filas = reporte.filas.map((f) => ({
      codigo: f.codigoParlante,
      producto: f.producto,
      cantidad: Number(f.cantidadConsumo),
      valor: Number(f.valorConsumo),
      participacion: Number(f.participacion),
      acumulada: Number(f.participacionAcumulada),
      clase: f.clasificacion,
    }));

    const buffer = await this.excel.construir({
      titulo: "Clasificacion ABC",
      periodo: `${desde} a ${hasta}`,
      columnas,
      filas,
    });
    enviarXlsx(res, buffer, `clasificacion_abc_${fechaArchivo()}.xlsx`);
  }

  @Get("rentabilidad/export.xlsx")
  @Permisos("venta.gestionar")
  async rentabilidadExport(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("desde") desde: string,
    @Query("hasta") hasta: string,
    @Res() res: Response,
    @Query("agrupar") agrupar?: string,
  ): Promise<void> {
    this.validarRango(desde, hasta);
    const ejes = ["articulo", "cliente"] as const;
    const eje = agrupar ?? "articulo";
    if (!ejes.includes(eje as (typeof ejes)[number])) {
      throw new BadRequestException("agrupar debe ser articulo o cliente");
    }
    const reporte = await this.reportes.rentabilidad(
      usuario.empresaId,
      desde,
      hasta,
      eje as (typeof ejes)[number],
    );

    const columnas: ColumnaExport[] = [
      { header: "Etiqueta", key: "etiqueta", width: 44 },
      { header: "Cantidad", key: "cantidad", width: 14, align: "right" },
      { header: "Venta S/", key: "venta", width: 16, align: "right", total: true },
      { header: "Costo S/", key: "costo", width: 16, align: "right", total: true },
      { header: "Margen S/", key: "margen", width: 16, align: "right", total: true },
      { header: "% margen", key: "margenPorcentaje", width: 14, align: "right" },
    ];

    const filas = reporte.filas.map((f) => ({
      etiqueta: f.etiqueta,
      cantidad: Number(f.cantidad),
      venta: Number(f.venta),
      costo: Number(f.costo),
      margen: Number(f.margen),
      margenPorcentaje:
        f.margenPorcentaje !== null ? Number(f.margenPorcentaje) : "",
    }));

    const buffer = await this.excel.construir({
      titulo: "Rentabilidad",
      periodo: `${desde} a ${hasta}`,
      columnas,
      filas,
    });
    enviarXlsx(res, buffer, `rentabilidad_${fechaArchivo()}.xlsx`);
  }

  @Get("consumo/export.xlsx")
  @Permisos("reporte.ver")
  async consumoExport(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("desde") desde: string,
    @Query("hasta") hasta: string,
    @Res() res: Response,
    @Query("agrupar") agrupar?: string,
  ): Promise<void> {
    this.validarRango(desde, hasta);
    const ejes = ["centroCosto", "solicitante", "ordenTrabajo"] as const;
    const eje = agrupar ?? "centroCosto";
    if (!ejes.includes(eje as (typeof ejes)[number])) {
      throw new BadRequestException(
        "agrupar debe ser centroCosto, solicitante u ordenTrabajo",
      );
    }
    const reporte = await this.reportes.consumoValorizado(
      usuario.empresaId,
      desde,
      hasta,
      eje as (typeof ejes)[number],
    );

    const hayUsd = reporte.grupos.some((g) => g.costoTotalUsd !== null);
    const columnas: ColumnaExport[] = [
      { header: "Etiqueta", key: "etiqueta", width: 44 },
      { header: "Cantidad", key: "cantidad", width: 14, align: "right" },
      { header: "Costo total S/", key: "costoSoles", width: 16, align: "right", total: true },
      ...(hayUsd
        ? [
            {
              header: "Costo total USD",
              key: "costoUsd",
              width: 16,
              align: "right" as const,
              total: true,
            },
          ]
        : []),
    ];

    const filas = reporte.grupos.map((g) => ({
      etiqueta: g.etiqueta,
      cantidad: Number(g.cantidad),
      costoSoles: Number(g.costoTotalSoles),
      ...(hayUsd
        ? { costoUsd: g.costoTotalUsd !== null ? Number(g.costoTotalUsd) : 0 }
        : {}),
    }));

    const buffer = await this.excel.construir({
      titulo: "Consumo valorizado",
      periodo: `${desde} a ${hasta}`,
      columnas,
      filas,
    });
    enviarXlsx(res, buffer, `consumo_valorizado_${fechaArchivo()}.xlsx`);
  }

  /** Valida que desde/hasta tengan formato AAAA-MM-DD y que el rango sea coherente. */
  private validarRango(desde: string, hasta: string): void {
    const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;
    if (!desde || !REGEX_FECHA.test(desde)) {
      throw new BadRequestException("desde debe tener formato AAAA-MM-DD");
    }
    if (!hasta || !REGEX_FECHA.test(hasta)) {
      throw new BadRequestException("hasta debe tener formato AAAA-MM-DD");
    }
    if (hasta < desde) {
      throw new BadRequestException("hasta no puede ser anterior a desde");
    }
  }

  @Get("ple/121")
  @Permisos("reporte.ver")
  async ple121(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("periodo") periodo: string,
  ): Promise<{ nombre: string; contenido: string }> {
    const [contenido, nombre] = await Promise.all([
      this.reportes.generarPle121(usuario.empresaId, periodo),
      this.reportes.nombreArchivoPle(usuario.empresaId, periodo, "121"),
    ]);
    return { nombre, contenido };
  }

  @Get("ple/131")
  @Permisos("reporte.ver")
  async ple131(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("periodo") periodo: string,
  ): Promise<{ nombre: string; contenido: string }> {
    const [contenido, nombre] = await Promise.all([
      this.reportes.generarPle131(usuario.empresaId, periodo),
      this.reportes.nombreArchivoPle(usuario.empresaId, periodo, "131"),
    ]);
    return { nombre, contenido };
  }
}
