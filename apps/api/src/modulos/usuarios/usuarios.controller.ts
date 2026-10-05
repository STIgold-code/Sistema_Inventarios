import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import { PERMISO_ADMINISTRAR_USUARIOS } from "./administracion-usuarios.js";
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
  RestablecerClaveDto,
} from "./dto/usuario.dto.js";
import { UsuariosService, type UsuarioGestion } from "./usuarios.service.js";

function aBigInts(ids: number[]): bigint[] {
  return ids.map((id) => BigInt(id));
}

/** Administracion de usuarios de la empresa del llamador. */
@Controller("usuarios")
@UseGuards(JwtGuard, PermisosGuard)
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Get()
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("incluirInactivos") incluirInactivos?: string,
  ): Promise<UsuarioGestion[]> {
    return this.usuarios.listar(usuario.empresaId, incluirInactivos === "true");
  }

  @Post()
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearUsuarioDto,
  ): Promise<UsuarioGestion> {
    return this.usuarios.crear(usuario, { ...dto, rolIds: aBigInts(dto.rolIds) });
  }

  @Patch(":id")
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarUsuarioDto,
  ): Promise<UsuarioGestion> {
    return this.usuarios.actualizar(usuario, id, {
      email: dto.email,
      nombre: dto.nombre,
      rolIds: dto.rolIds === undefined ? undefined : aBigInts(dto.rolIds),
    });
  }

  @Post(":id/baja")
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  darDeBaja(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ): Promise<UsuarioGestion> {
    return this.usuarios.darDeBaja(usuario, id);
  }

  @Post(":id/reactivar")
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  reactivar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ): Promise<UsuarioGestion> {
    return this.usuarios.reactivar(usuario, id);
  }

  @Post(":id/restablecer-clave")
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  restablecerClave(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: RestablecerClaveDto,
  ): Promise<UsuarioGestion> {
    return this.usuarios.restablecerClave(usuario, id, dto.clave);
  }
}
