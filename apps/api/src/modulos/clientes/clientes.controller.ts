import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import { ClientesService } from "./clientes.service.js";
import { ActualizarClienteDto, CrearClienteDto } from "./dto/clientes.dto.js";

@Controller("clientes")
@UseGuards(JwtGuard, PermisosGuard)
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @Permisos("venta.gestionar")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("incluirInactivos") incluirInactivos?: string,
  ) {
    return this.clientes.listar(usuario.empresaId, incluirInactivos === "true");
  }

  @Post()
  @Permisos("venta.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearClienteDto) {
    return this.clientes.crear(usuario.empresaId, dto);
  }

  @Patch(":id")
  @Permisos("venta.gestionar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.clientes.actualizar(usuario.empresaId, id, dto);
  }

  @Post(":id/desactivar")
  @Permisos("venta.gestionar")
  desactivar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.clientes.desactivar(usuario.empresaId, id);
  }

  @Post(":id/reactivar")
  @Permisos("venta.gestionar")
  reactivar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.clientes.reactivar(usuario.empresaId, id);
  }
}
