import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import { PERMISO_ADMINISTRAR_USUARIOS } from "../usuarios/administracion-usuarios.js";
import { ActualizarRolDto, CrearRolDto } from "./dto/rol.dto.js";
import { RolesService, type RolGestion } from "./roles.service.js";

function aBigInts(ids: number[]): bigint[] {
  return ids.map((id) => BigInt(id));
}

/** Roles de la empresa del llamador. */
@Controller("roles")
@UseGuards(JwtGuard, PermisosGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  listar(@UsuarioActual() usuario: UsuarioRequest): Promise<RolGestion[]> {
    return this.roles.listar(usuario.empresaId);
  }

  @Post()
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearRolDto,
  ): Promise<RolGestion> {
    return this.roles.crear(usuario, {
      codigo: dto.codigo,
      nombre: dto.nombre,
      permisoIds: aBigInts(dto.permisoIds),
    });
  }

  @Patch(":id")
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarRolDto,
  ): Promise<RolGestion> {
    return this.roles.actualizar(usuario, id, {
      nombre: dto.nombre,
      permisoIds: dto.permisoIds === undefined ? undefined : aBigInts(dto.permisoIds),
    });
  }

  @Delete(":id")
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  eliminar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ): Promise<{ id: string; eliminado: true }> {
    return this.roles.eliminar(usuario, id);
  }
}
