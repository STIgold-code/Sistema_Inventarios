import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { SeriesService } from "./series.service.js";

@Controller("series")
@UseGuards(JwtGuard, PermisosGuard)
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  @Get()
  @Permisos("inventario.ver")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("skuId") skuId?: string,
    @Query("estado") estado?: string,
  ) {
    return this.series.listar(usuario.empresaId, {
      skuId: skuId !== undefined && skuId !== "" ? BigInt(skuId) : undefined,
      estado: estado !== undefined && estado !== "" ? estado : undefined,
    });
  }
}
