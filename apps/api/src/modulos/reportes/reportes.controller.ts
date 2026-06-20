import { BadRequestException, Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ReportesService } from "./reportes.service.js";

@Controller("reportes")
@UseGuards(JwtGuard, PermisosGuard)
export class ReportesController {
  constructor(private readonly reportes: ReportesService) {}

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
    const ejes = ["articulo", "cliente"] as const;
    const eje = agrupar ?? "articulo";
    if (!ejes.includes(eje as (typeof ejes)[number])) {
      throw new BadRequestException("agrupar debe ser articulo o cliente");
    }
    return this.reportes.rentabilidad(
      usuario.empresaId,
      desde,
      hasta,
      eje as (typeof ejes)[number],
    );
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
