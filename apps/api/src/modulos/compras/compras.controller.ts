import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ComprasService } from "./compras.service.js";
import {
  CrearOrdenCompraDto,
  CrearProveedorDto,
  RecibirDto,
} from "./dto/compras.dto.js";

@Controller("compras")
@UseGuards(JwtGuard, PermisosGuard)
export class ComprasController {
  constructor(private readonly compras: ComprasService) {}

  @Get("proveedores")
  @Permisos("compra.gestionar")
  listarProveedores(@UsuarioActual() usuario: UsuarioRequest) {
    return this.compras.listarProveedores(usuario.empresaId);
  }

  @Post("proveedores")
  @Permisos("compra.gestionar")
  crearProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearProveedorDto,
  ) {
    return this.compras.crearProveedor(usuario.empresaId, dto);
  }

  @Get("ordenes")
  @Permisos("compra.gestionar")
  listarOrdenes(@UsuarioActual() usuario: UsuarioRequest) {
    return this.compras.listarOrdenes(usuario.empresaId);
  }

  @Post("ordenes")
  @Permisos("compra.gestionar")
  crearOrden(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearOrdenCompraDto,
  ) {
    return this.compras.crearOrdenCompra(usuario, {
      proveedorId: BigInt(dto.proveedorId),
      almacenId: BigInt(dto.almacenId),
      numero: dto.numero,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
      })),
    });
  }

  @Post("recepciones")
  @Permisos("compra.gestionar")
  recibir(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: RecibirDto) {
    return this.compras.recibir(usuario, {
      ordenCompraId: BigInt(dto.ordenCompraId),
      tipoDocumentoSunat: dto.tipoDocumentoSunat,
      serieComprobante: dto.serieComprobante,
      numeroComprobante: dto.numeroComprobante,
      lineas: dto.lineas.map((l) => ({
        ordenCompraLineaId: BigInt(l.ordenCompraLineaId),
        cantidad: l.cantidad,
      })),
    });
  }
}
