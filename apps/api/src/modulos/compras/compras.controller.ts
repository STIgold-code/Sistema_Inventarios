import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ComprasService } from "./compras.service.js";
import {
  ActualizarProveedorDto,
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

  @Patch("proveedores/:id")
  @Permisos("compra.gestionar")
  actualizarProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: ActualizarProveedorDto,
  ) {
    return this.compras.actualizarProveedor(usuario.empresaId, BigInt(id), dto);
  }

  @Post("proveedores/:id/desactivar")
  @Permisos("compra.gestionar")
  desactivarProveedor(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
  ) {
    return this.compras.desactivarProveedor(usuario.empresaId, BigInt(id));
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
      requerimientoId: dto.requerimientoId ? BigInt(dto.requerimientoId) : undefined,
      moneda: dto.moneda,
      tipoCambio: dto.tipoCambio,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        costoUnitario: l.costoUnitario,
      })),
    });
  }

  @Post("ordenes/:id/aprobar")
  @Permisos("compra.aprobar")
  aprobarOrden(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.compras.aprobarOrden(usuario, BigInt(id));
  }

  @Post("ordenes/:id/anular")
  @Permisos("compra.gestionar")
  anularOrden(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.compras.anularOrden(usuario, BigInt(id));
  }

  @Post("recepciones")
  @Permisos("compra.gestionar")
  recibir(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: RecibirDto) {
    return this.compras.recibir(usuario, {
      ordenCompraId: BigInt(dto.ordenCompraId),
      tipoDocumentoSunat: dto.tipoDocumentoSunat,
      serieComprobante: dto.serieComprobante,
      numeroComprobante: dto.numeroComprobante,
      fechaEmisionDocumento: new Date(dto.fechaEmisionDocumento),
      moneda: dto.moneda,
      tipoCambio: dto.tipoCambio,
      subtotal: dto.subtotal,
      igv: dto.igv,
      total: dto.total,
      guiaRemisionProveedor: dto.guiaRemisionProveedor,
      lineas: dto.lineas.map((l) => ({
        ordenCompraLineaId: BigInt(l.ordenCompraLineaId),
        cantidad: l.cantidad,
      })),
    });
  }
}
