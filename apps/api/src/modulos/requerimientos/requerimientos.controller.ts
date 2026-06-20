import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { RequerimientosService } from "./requerimientos.service.js";
import { CrearRequerimientoDto } from "./dto/requerimientos.dto.js";

@Controller("requerimientos")
@UseGuards(JwtGuard, PermisosGuard)
export class RequerimientosController {
  constructor(private readonly requerimientos: RequerimientosService) {}

  @Get()
  @Permisos("requerimiento.crear")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.requerimientos.listar(usuario.empresaId);
  }

  @Get(":id")
  @Permisos("requerimiento.crear")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.requerimientos.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("requerimiento.crear")
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearRequerimientoDto,
  ) {
    return this.requerimientos.crear(usuario, {
      centroCostoId: BigInt(dto.centroCostoId),
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        justificacion: l.justificacion,
      })),
    });
  }

  @Post(":id/aprobar")
  @Permisos("requerimiento.aprobar")
  aprobar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.requerimientos.aprobar(usuario, BigInt(id));
  }

  @Post(":id/rechazar")
  @Permisos("requerimiento.aprobar")
  rechazar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.requerimientos.rechazar(usuario, BigInt(id));
  }
}
