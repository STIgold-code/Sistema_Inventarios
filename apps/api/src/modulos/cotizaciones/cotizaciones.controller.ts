import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { CotizacionesService } from "./cotizaciones.service.js";
import {
  ActualizarCotizacionDto,
  CrearCotizacionDto,
} from "./dto/cotizaciones.dto.js";

@Controller("cotizaciones")
@UseGuards(JwtGuard, PermisosGuard)
export class CotizacionesController {
  constructor(private readonly cotizaciones: CotizacionesService) {}

  /**
   * Sin skuId: error (skuId es obligatorio). Con skuId: lista los proveedores
   * y su ultimo precio para ese articulo, ordenado por precio ascendente.
   */
  @Get()
  @Permisos("compra.gestionar")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("skuId") skuId?: string,
  ) {
    if (!skuId) throw new BadRequestException("skuId es obligatorio");
    return this.cotizaciones.ultimoPrecioPorProveedor(
      usuario.empresaId,
      BigInt(skuId),
    );
  }

  @Get(":id")
  @Permisos("compra.gestionar")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.cotizaciones.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("compra.gestionar")
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearCotizacionDto,
  ) {
    return this.cotizaciones.crear(usuario.empresaId, {
      proveedorId: BigInt(dto.proveedorId),
      skuId: BigInt(dto.skuId),
      moneda: dto.moneda,
      precioUnitario: dto.precioUnitario,
      fechaCotizacion: new Date(dto.fechaCotizacion),
      numeroCotizacion: dto.numeroCotizacion,
      ordenCompraRef: dto.ordenCompraRef,
    });
  }

  @Patch(":id")
  @Permisos("compra.gestionar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: ActualizarCotizacionDto,
  ) {
    return this.cotizaciones.actualizar(usuario.empresaId, BigInt(id), {
      moneda: dto.moneda,
      precioUnitario: dto.precioUnitario,
      fechaCotizacion: dto.fechaCotizacion ? new Date(dto.fechaCotizacion) : undefined,
      numeroCotizacion: dto.numeroCotizacion,
      ordenCompraRef: dto.ordenCompraRef,
    });
  }

  @Delete(":id")
  @Permisos("compra.gestionar")
  eliminar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.cotizaciones.eliminar(usuario.empresaId, BigInt(id));
  }
}
