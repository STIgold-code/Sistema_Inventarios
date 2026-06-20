import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { TiposCambioService } from "./tipos-cambio.service.js";
import { GuardarTipoCambioDto } from "./dto/tipos-cambio.dto.js";

@Controller("tipos-cambio")
@UseGuards(JwtGuard, PermisosGuard)
export class TiposCambioController {
  constructor(private readonly tiposCambio: TiposCambioService) {}

  /** GET /tipos-cambio?anio=2026&mes=6 — lista los TC del mes. */
  @Get()
  @Permisos("inventario.ver")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("anio") anio?: string,
    @Query("mes") mes?: string,
  ) {
    const anioNum = Number(anio);
    const mesNum = Number(mes);
    if (!Number.isInteger(anioNum) || !Number.isInteger(mesNum)) {
      throw new BadRequestException("anio y mes son obligatorios y numericos.");
    }
    return this.tiposCambio.listarMes(usuario.empresaId, anioNum, mesNum);
  }

  /** POST /tipos-cambio — upsert por fecha. */
  @Post()
  @Permisos("tipocambio.administrar")
  guardar(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: GuardarTipoCambioDto) {
    return this.tiposCambio.guardar(usuario.empresaId, dto);
  }
}
