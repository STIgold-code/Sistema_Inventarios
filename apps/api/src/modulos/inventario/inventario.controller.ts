import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Matches } from "class-validator";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ConsultarKardexDto } from "./movimientos/dto/registrar-movimiento.dto.js";
import { MovimientoService } from "./movimientos/movimiento.service.js";
import { StockService } from "./stock/stock.service.js";

const DEC = /^\d+(\.\d+)?$/;

class AjusteDto {
  @IsInt() skuId!: number;
  @IsInt() almacenId!: number;
  @IsBoolean() incremento!: boolean;
  @Matches(DEC, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
  @IsOptional() @IsString() observaciones?: string;
}

class MermaDto {
  @IsInt() skuId!: number;
  @IsInt() almacenId!: number;
  @Matches(DEC, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
  @IsOptional() @IsString() observaciones?: string;
}

class CondicionDto {
  @IsInt() skuId!: number;
  @IsInt() almacenId!: number;
  @Matches(DEC, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
  @IsString() motivo!: string;
}

class ExistenciasDto {
  @IsOptional() @IsInt() pagina?: number;
  @IsOptional() @IsInt() porPagina?: number;
  @IsOptional() @IsString() busqueda?: string;
  @IsOptional() @IsInt() almacenId?: number;
  @IsOptional() @IsBoolean() esRenovable?: boolean;
}

@Controller("inventario")
@UseGuards(JwtGuard, PermisosGuard)
export class InventarioController {
  constructor(
    private readonly movimientos: MovimientoService,
    private readonly stock: StockService,
  ) {}

  @Post("ajustes")
  @Permisos("inventario.movimiento.crear")
  ajuste(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: AjusteDto) {
    return this.movimientos.ajusteManual(usuario, {
      skuId: BigInt(dto.skuId),
      almacenId: BigInt(dto.almacenId),
      incremento: dto.incremento,
      cantidad: dto.cantidad,
      observaciones: dto.observaciones,
    });
  }

  @Post("mermas")
  @Permisos("inventario.movimiento.crear")
  merma(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: MermaDto) {
    return this.movimientos.merma(usuario, {
      skuId: BigInt(dto.skuId),
      almacenId: BigInt(dto.almacenId),
      cantidad: dto.cantidad,
      observaciones: dto.observaciones,
    });
  }

  @Post("deteriorar")
  @Permisos("inventario.movimiento.crear")
  deteriorar(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CondicionDto) {
    return this.movimientos.marcarDeteriorado(usuario, {
      skuId: BigInt(dto.skuId),
      almacenId: BigInt(dto.almacenId),
      cantidad: dto.cantidad,
      motivo: dto.motivo,
    });
  }

  @Post("recuperar")
  @Permisos("inventario.movimiento.crear")
  recuperar(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CondicionDto) {
    return this.movimientos.recuperarDeteriorado(usuario, {
      skuId: BigInt(dto.skuId),
      almacenId: BigInt(dto.almacenId),
      cantidad: dto.cantidad,
      motivo: dto.motivo,
    });
  }

  @Post("baja-deteriorado")
  @Permisos("inventario.movimiento.crear")
  bajaDeteriorado(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CondicionDto) {
    return this.movimientos.darDeBajaDeteriorado(usuario, {
      skuId: BigInt(dto.skuId),
      almacenId: BigInt(dto.almacenId),
      cantidad: dto.cantidad,
      motivo: dto.motivo,
    });
  }

  @Get("almacenes")
  @Permisos("inventario.ver")
  almacenes(@UsuarioActual() usuario: UsuarioRequest) {
    return this.stock.listarAlmacenes(usuario.empresaId);
  }

  @Get("kardex")
  @Permisos("inventario.ver")
  kardex(@UsuarioActual() usuario: UsuarioRequest, @Query() dto: ConsultarKardexDto) {
    return this.stock.kardex(
      usuario.empresaId,
      BigInt(dto.skuId),
      dto.almacenId ? BigInt(dto.almacenId) : undefined,
    );
  }

  @Get("stock")
  @Permisos("inventario.ver")
  stockActual(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("skuId") skuId: string,
  ) {
    return this.stock.stockPorSku(usuario.empresaId, BigInt(skuId));
  }

  @Get("existencias")
  @Permisos("inventario.ver")
  existencias(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query() dto: ExistenciasDto,
  ) {
    return this.stock.existencias(usuario.empresaId, {
      pagina: dto.pagina && dto.pagina > 0 ? dto.pagina : 1,
      porPagina: dto.porPagina && dto.porPagina > 0 ? Math.min(dto.porPagina, 100) : 50,
      busqueda: dto.busqueda,
      almacenId: dto.almacenId ? BigInt(dto.almacenId) : undefined,
      esRenovable: dto.esRenovable,
    });
  }
}
