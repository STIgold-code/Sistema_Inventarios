import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { GuiasService } from "./guias.service.js";
import { CrearGuiaRemisionDto } from "./dto/guias.dto.js";

@Controller("guias")
@UseGuards(JwtGuard, PermisosGuard)
export class GuiasController {
  constructor(private readonly guias: GuiasService) {}

  @Get()
  @Permisos("guia.gestionar")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("trasladoId") trasladoId?: string,
    @Query("ordenVentaId") ordenVentaId?: string,
  ) {
    return this.guias.listar(usuario.empresaId, {
      trasladoId: trasladoId !== undefined ? BigInt(trasladoId) : undefined,
      ordenVentaId: ordenVentaId !== undefined ? BigInt(ordenVentaId) : undefined,
    });
  }

  @Get(":id")
  @Permisos("guia.gestionar")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.guias.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("guia.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearGuiaRemisionDto) {
    return this.guias.crear(usuario, {
      serie: dto.serie,
      numero: dto.numero,
      fechaTraslado: new Date(dto.fechaTraslado),
      motivoTraslado: dto.motivoTraslado,
      transportistaId:
        dto.transportistaId !== undefined ? BigInt(dto.transportistaId) : undefined,
      transportistaDoc: dto.transportistaDoc,
      transportistaNombre: dto.transportistaNombre,
      puntoPartida: dto.puntoPartida,
      puntoLlegada: dto.puntoLlegada,
      pesoBruto: dto.pesoBruto,
      observaciones: dto.observaciones,
      trasladoId: dto.trasladoId !== undefined ? BigInt(dto.trasladoId) : undefined,
      ordenVentaId: dto.ordenVentaId !== undefined ? BigInt(dto.ordenVentaId) : undefined,
    });
  }
}
