import { Controller, Get, Query, UseGuards } from "@nestjs/common";
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
