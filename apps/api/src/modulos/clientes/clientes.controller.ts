import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ClientesService } from "./clientes.service.js";
import { ActualizarClienteDto, CrearClienteDto } from "./dto/clientes.dto.js";

@Controller("clientes")
@UseGuards(JwtGuard, PermisosGuard)
export class ClientesController {
  constructor(private readonly clientes: ClientesService) {}

  @Get()
  @Permisos("venta.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.clientes.listar(usuario.empresaId);
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
    @Param("id") id: string,
    @Body() dto: ActualizarClienteDto,
  ) {
    return this.clientes.actualizar(usuario.empresaId, BigInt(id), dto);
  }

  @Post(":id/desactivar")
  @Permisos("venta.gestionar")
  desactivar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.clientes.desactivar(usuario.empresaId, BigInt(id));
  }
}
