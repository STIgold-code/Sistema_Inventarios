import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { VentasService } from "./ventas.service.js";
import { CrearOrdenVentaDto, DespacharDto } from "./dto/ventas.dto.js";

@Controller("ventas")
@UseGuards(JwtGuard, PermisosGuard)
export class VentasController {
  constructor(private readonly ventas: VentasService) {}

  @Get("ordenes")
  @Permisos("venta.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.ventas.listarOrdenes(usuario.empresaId);
  }

  @Get("comprobantes")
  @Permisos("venta.gestionar")
  listarComprobantes(@UsuarioActual() usuario: UsuarioRequest) {
    return this.ventas.listarComprobantes(usuario.empresaId);
  }

  @Get("comprobantes/:id")
  @Permisos("venta.gestionar")
  obtenerComprobante(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
  ) {
    return this.ventas.obtenerDetalleComprobante(usuario.empresaId, BigInt(id));
  }

  @Get("precio-sugerido")
  @Permisos("venta.gestionar")
  precioSugerido(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("skuId") skuId: string,
    @Query("clienteId") clienteId?: string,
  ) {
    return this.ventas.precioSugerido(
      usuario.empresaId,
      BigInt(skuId),
      clienteId ? BigInt(clienteId) : undefined,
    );
  }

  @Post("ordenes")
  @Permisos("venta.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearOrdenVentaDto) {
    return this.ventas.crearOrdenVenta(usuario, {
      almacenId: BigInt(dto.almacenId),
      numero: dto.numero,
      clienteId: dto.clienteId ? BigInt(dto.clienteId) : undefined,
      cliente: dto.cliente,
      moneda: dto.moneda,
      tipoCambio: dto.tipoCambio,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuId: BigInt(l.skuId),
        cantidad: l.cantidad,
        precioUnitario: l.precioUnitario,
        enUnidadReferencia: l.enUnidadReferencia,
      })),
    });
  }

  @Post("despachos")
  @Permisos("venta.gestionar")
  despachar(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: DespacharDto) {
    return this.ventas.despachar(usuario, {
      ordenVentaId: BigInt(dto.ordenVentaId),
      comprobante: {
        tipoDocumentoSunat: dto.comprobante.tipoDocumentoSunat,
        serie: dto.comprobante.serie,
        numero: dto.comprobante.numero,
        fechaEmision: new Date(dto.comprobante.fechaEmision),
        moneda: dto.comprobante.moneda,
        tipoCambio: dto.comprobante.tipoCambio,
        subtotal: dto.comprobante.subtotal,
        igv: dto.comprobante.igv,
        total: dto.comprobante.total,
      },
      lineas: dto.lineas.map((l) => ({
        ordenVentaLineaId: BigInt(l.ordenVentaLineaId),
        cantidad: l.cantidad,
        numerosSerie: l.numerosSerie,
      })),
    });
  }

  @Post("ordenes/:id/anular")
  @Permisos("venta.gestionar")
  anular(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.ventas.anular(usuario, BigInt(id));
  }
}
