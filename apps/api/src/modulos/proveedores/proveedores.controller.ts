import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ProveedoresService } from "./proveedores.service.js";
import { ActualizarProveedorDto, CrearProveedorDto } from "./dto/proveedores.dto.js";

@Controller("proveedores")
@UseGuards(JwtGuard, PermisosGuard)
export class ProveedoresController {
  constructor(private readonly proveedores: ProveedoresService) {}

  @Get()
  @Permisos("compra.gestionar")
  listarProveedores(@UsuarioActual() usuario: UsuarioRequest) {
    return this.proveedores.listarProveedores(usuario.empresaId);
  }

  @Post()
  @Permisos("compra.gestionar")
  crearProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearProveedorDto,
  ) {
    return this.proveedores.crearProveedor(usuario.empresaId, dto);
  }

  @Patch(":id")
  @Permisos("compra.gestionar")
  actualizarProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: ActualizarProveedorDto,
  ) {
    return this.proveedores.actualizarProveedor(usuario.empresaId, BigInt(id), dto);
  }

  @Post(":id/desactivar")
  @Permisos("compra.gestionar")
  desactivarProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
  ) {
    return this.proveedores.desactivarProveedor(usuario.empresaId, BigInt(id));
  }

  @Post(":id/reactivar")
  @Permisos("compra.gestionar")
  reactivarProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
  ) {
    return this.proveedores.reactivarProveedor(usuario.empresaId, BigInt(id));
  }
}
