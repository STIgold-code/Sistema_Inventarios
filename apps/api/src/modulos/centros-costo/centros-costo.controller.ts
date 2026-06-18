import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { CentrosCostoService } from "./centros-costo.service.js";
import {
  ActualizarCentroCostoDto,
  CrearCentroCostoDto,
} from "./dto/centros-costo.dto.js";

@Controller("centros-costo")
@UseGuards(JwtGuard, PermisosGuard)
export class CentrosCostoController {
  constructor(private readonly centros: CentrosCostoService) {}

  @Get()
  @Permisos("inventario.ver")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.centros.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("centrocosto.administrar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearCentroCostoDto) {
    return this.centros.crear(usuario.empresaId, dto);
  }

  @Patch(":id")
  @Permisos("centrocosto.administrar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: ActualizarCentroCostoDto,
  ) {
    return this.centros.actualizar(usuario.empresaId, BigInt(id), dto);
  }
}
