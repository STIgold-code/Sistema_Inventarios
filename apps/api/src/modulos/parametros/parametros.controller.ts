import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ParametrosService } from "./parametros.service.js";
import { ActualizarParametrosDto } from "./dto/parametros.dto.js";

@Controller("parametros")
@UseGuards(JwtGuard, PermisosGuard)
export class ParametrosController {
  constructor(private readonly parametros: ParametrosService) {}

  @Get()
  @Permisos("inventario.ver")
  obtener(@UsuarioActual() usuario: UsuarioRequest) {
    return this.parametros.obtener(usuario.empresaId);
  }

  @Put()
  @Permisos("centrocosto.administrar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: ActualizarParametrosDto,
  ) {
    return this.parametros.actualizar(usuario.empresaId, dto);
  }
}
