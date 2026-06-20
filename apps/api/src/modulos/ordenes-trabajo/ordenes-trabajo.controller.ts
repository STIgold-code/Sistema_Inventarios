import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { OrdenesTrabajoService } from "./ordenes-trabajo.service.js";
import {
  ActualizarOrdenTrabajoDto,
  CrearOrdenTrabajoDto,
} from "./dto/ordenes-trabajo.dto.js";

@Controller("ordenes-trabajo")
@UseGuards(JwtGuard, PermisosGuard)
export class OrdenesTrabajoController {
  constructor(private readonly ordenes: OrdenesTrabajoService) {}

  @Get()
  @Permisos("ot.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.ordenes.listar(usuario.empresaId);
  }

  @Get(":id")
  @Permisos("ot.gestionar")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.ordenes.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("ot.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearOrdenTrabajoDto) {
    return this.ordenes.crear(usuario.empresaId, {
      descripcion: dto.descripcion,
      centroCostoId: BigInt(dto.centroCostoId),
    });
  }

  @Patch(":id")
  @Permisos("ot.gestionar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: ActualizarOrdenTrabajoDto,
  ) {
    return this.ordenes.actualizar(usuario.empresaId, BigInt(id), {
      descripcion: dto.descripcion,
      centroCostoId: dto.centroCostoId !== undefined ? BigInt(dto.centroCostoId) : undefined,
    });
  }

  @Post(":id/cerrar")
  @Permisos("ot.gestionar")
  cerrar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.ordenes.cerrar(usuario.empresaId, BigInt(id));
  }
}
