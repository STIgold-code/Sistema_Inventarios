import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ValesService } from "./vales.service.js";
import { CrearValeSalidaDto, DespacharValeDto } from "./dto/vales.dto.js";

@Controller("vales")
@UseGuards(JwtGuard, PermisosGuard)
export class ValesController {
  constructor(private readonly vales: ValesService) {}

  @Get()
  @Permisos("vale.crear")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.vales.listar(usuario.empresaId);
  }

  @Get(":id")
  @Permisos("vale.crear")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.vales.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("vale.crear")
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearValeSalidaDto,
  ) {
    return this.vales.crear(usuario, {
      almacenId: BigInt(dto.almacenId),
      centroCostoId: BigInt(dto.centroCostoId),
      ordenTrabajoId:
        dto.ordenTrabajoId !== undefined ? BigInt(dto.ordenTrabajoId) : undefined,
      destino: dto.destino,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        observacion: l.observacion,
        enUnidadReferencia: l.enUnidadReferencia,
      })),
    });
  }

  @Post(":id/autorizar")
  @Permisos("vale.autorizar")
  autorizar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.vales.autorizar(usuario, BigInt(id));
  }

  @Post(":id/despachar")
  @Permisos("vale.crear")
  despachar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: DespacharValeDto,
  ) {
    const seriesPorSku = new Map<string, string[]>(
      (dto.series ?? []).map((s) => [BigInt(s.skuId).toString(), s.numerosSerie]),
    );
    return this.vales.despachar(usuario, BigInt(id), seriesPorSku);
  }

  @Post(":id/anular")
  @Permisos("vale.autorizar")
  anular(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.vales.anular(usuario, BigInt(id));
  }
}
