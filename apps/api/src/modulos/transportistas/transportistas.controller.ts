import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { TransportistasService } from "./transportistas.service.js";
import {
  ActualizarTransportistaDto,
  CrearTransportistaDto,
} from "./dto/transportistas.dto.js";

@Controller("transportistas")
@UseGuards(JwtGuard, PermisosGuard)
export class TransportistasController {
  constructor(private readonly transportistas: TransportistasService) {}

  @Get()
  @Permisos("inventario.ver")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.transportistas.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("guia.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearTransportistaDto) {
    return this.transportistas.crear(usuario.empresaId, dto);
  }

  @Patch(":id")
  @Permisos("guia.gestionar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarTransportistaDto,
  ) {
    return this.transportistas.actualizar(usuario.empresaId, id, dto);
  }
}
