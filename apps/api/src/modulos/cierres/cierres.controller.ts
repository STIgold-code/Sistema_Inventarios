import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { CierresService } from "./cierres.service.js";

@Controller("cierres")
@UseGuards(JwtGuard, PermisosGuard)
export class CierresController {
  constructor(private readonly cierres: CierresService) {}

  @Get()
  @Permisos("cierre.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.cierres.listar(usuario.empresaId);
  }

  @Post(":periodo/cerrar")
  @Permisos("cierre.gestionar")
  cerrar(@UsuarioActual() usuario: UsuarioRequest, @Param("periodo") periodo: string) {
    return this.cierres.cerrar(usuario, periodo);
  }

  @Post(":periodo/reabrir")
  @Permisos("cierre.reabrir")
  reabrir(@UsuarioActual() usuario: UsuarioRequest, @Param("periodo") periodo: string) {
    return this.cierres.reabrir(usuario, periodo);
  }
}
