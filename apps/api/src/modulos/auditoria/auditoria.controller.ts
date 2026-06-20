import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "./auditoria.service.js";
import { ListarAuditoriaDto } from "./dto/auditoria.dto.js";

@Controller("auditoria")
@UseGuards(JwtGuard, PermisosGuard)
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  @Permisos("auditoria.ver")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query() filtros: ListarAuditoriaDto,
  ) {
    return this.auditoria.listar(usuario.empresaId, {
      entidad: filtros.entidad,
      entidadId:
        filtros.entidadId !== undefined ? BigInt(filtros.entidadId) : undefined,
      usuarioId:
        filtros.usuarioId !== undefined ? BigInt(filtros.usuarioId) : undefined,
      accion: filtros.accion,
      desde: filtros.desde ? new Date(filtros.desde) : undefined,
      hasta: filtros.hasta ? new Date(filtros.hasta) : undefined,
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
    });
  }
}
