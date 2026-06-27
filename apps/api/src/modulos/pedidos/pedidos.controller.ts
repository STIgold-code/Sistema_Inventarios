import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { PedidosService } from "./pedidos.service.js";
import { CrearPedidoDto, GenerarOrdenVentaDto } from "./dto/pedidos.dto.js";

@Controller("pedidos")
@UseGuards(JwtGuard, PermisosGuard)
export class PedidosController {
  constructor(private readonly pedidos: PedidosService) {}

  @Get()
  @Permisos("venta.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.pedidos.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("venta.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearPedidoDto) {
    return this.pedidos.crear(usuario, {
      almacenId: BigInt(dto.almacenId),
      numero: dto.numero,
      clienteId: dto.clienteId !== undefined ? BigInt(dto.clienteId) : undefined,
      vendedorId: dto.vendedorId !== undefined ? BigInt(dto.vendedorId) : undefined,
      fechaEntrega: dto.fechaEntrega ? new Date(dto.fechaEntrega) : undefined,
      moneda: dto.moneda,
      tipoCambio: dto.tipoCambio,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
      })),
    });
  }

  @Post(":id/aprobar")
  @Permisos("venta.gestionar")
  aprobar(@UsuarioActual() usuario: UsuarioRequest, @Param("id", ParseBigIntPipe) id: bigint) {
    return this.pedidos.aprobar(usuario, id);
  }

  @Post(":id/anular")
  @Permisos("venta.gestionar")
  anular(@UsuarioActual() usuario: UsuarioRequest, @Param("id", ParseBigIntPipe) id: bigint) {
    return this.pedidos.anular(usuario, id);
  }

  @Post(":id/orden-venta")
  @Permisos("venta.gestionar")
  generar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: GenerarOrdenVentaDto,
  ) {
    return this.pedidos.generarOrdenVenta(usuario, id, dto.numero);
  }
}
