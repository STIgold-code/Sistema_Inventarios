import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { PERMISO_ADMINISTRAR_USUARIOS } from "../usuarios/administracion-usuarios.js";
import { RolesService, type PermisoCatalogo } from "./roles.service.js";

/** Catalogo global de permisos (para armar la matriz de roles). */
@Controller("permisos")
@UseGuards(JwtGuard, PermisosGuard)
export class PermisosController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permisos(PERMISO_ADMINISTRAR_USUARIOS)
  listar(): Promise<PermisoCatalogo[]> {
    return this.roles.listarPermisos();
  }
}
