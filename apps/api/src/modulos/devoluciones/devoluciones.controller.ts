import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { DevolucionesService } from "./devoluciones.service.js";
import { RegistrarDevolucionDto } from "./dto/devoluciones.dto.js";

@Controller("devoluciones")
@UseGuards(JwtGuard, PermisosGuard)
export class DevolucionesController {
  constructor(private readonly devoluciones: DevolucionesService) {}

  @Get()
  @Permisos("venta.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.devoluciones.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("venta.gestionar")
  registrar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: RegistrarDevolucionDto,
  ) {
    return this.devoluciones.registrar(usuario, {
      ordenVentaId: BigInt(dto.ordenVentaId),
      comprobanteVentaId:
        dto.comprobanteVentaId !== undefined ? BigInt(dto.comprobanteVentaId) : undefined,
      guiaRemisionId:
        dto.guiaRemisionId !== undefined ? BigInt(dto.guiaRemisionId) : undefined,
      motivo: dto.motivo,
      fecha: dto.fecha ? new Date(dto.fecha) : undefined,
      tipoComprobante: dto.tipoComprobante,
      serieComprobante: dto.serieComprobante,
      numeroComprobante: dto.numeroComprobante,
      fechaComprobante: dto.fechaComprobante ? new Date(dto.fechaComprobante) : undefined,
      lineas: dto.lineas.map((l) => ({
        ordenVentaLineaId:
          l.ordenVentaLineaId !== undefined ? BigInt(l.ordenVentaLineaId) : undefined,
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        motivo: l.motivo,
        numerosSerie: l.numerosSerie,
      })),
    });
  }

  @Patch(":id/anular")
  @Permisos("venta.gestionar")
  anular(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.devoluciones.anular(usuario, id);
  }
}
