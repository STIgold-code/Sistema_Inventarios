import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { DevolucionesProveedorService } from "./devoluciones-proveedor.service.js";
import { RegistrarDevolucionProveedorDto } from "./dto/devoluciones-proveedor.dto.js";

@Controller("devoluciones-proveedor")
@UseGuards(JwtGuard, PermisosGuard)
export class DevolucionesProveedorController {
  constructor(private readonly devoluciones: DevolucionesProveedorService) {}

  @Get()
  @Permisos("compra.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.devoluciones.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("compra.gestionar")
  registrar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: RegistrarDevolucionProveedorDto,
  ) {
    return this.devoluciones.registrar(usuario, {
      recepcionId: BigInt(dto.recepcionId),
      motivo: dto.motivo,
      fecha: dto.fecha ? new Date(dto.fecha) : undefined,
      tipoComprobante: dto.tipoComprobante,
      serieComprobante: dto.serieComprobante,
      numeroComprobante: dto.numeroComprobante,
      fechaComprobante: dto.fechaComprobante ? new Date(dto.fechaComprobante) : undefined,
      lineas: dto.lineas.map((l) => ({
        recepcionLineaId:
          l.recepcionLineaId !== undefined ? BigInt(l.recepcionLineaId) : undefined,
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        motivo: l.motivo,
        numerosSerie: l.numerosSerie,
      })),
    });
  }
}
