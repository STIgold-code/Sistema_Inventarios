import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
} from "class-validator";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import {
  ExcelExportService,
  type ColumnaExport,
} from "../comun/export/excel-export.service.js";
import { enviarXlsx, fechaArchivo } from "../comun/export/enviar-xlsx.js";
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

class ProduccionDto {
  @IsInt() skuId!: number;
  @IsInt() almacenId!: number;
  @Matches(DEC, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
  @Matches(DEC, { message: "costoUnitario debe ser decimal positivo" }) costoUnitario!: string;
  @IsOptional() @IsInt() ordenTrabajoId?: number;
  @IsOptional() @IsString() observaciones?: string;
}

class ExistenciasDto {
  @IsOptional() @IsInt() pagina?: number;
  @IsOptional() @IsInt() porPagina?: number;
  @IsOptional() @IsString() busqueda?: string;
  @IsOptional() @IsInt() almacenId?: number;
  @IsOptional() @IsBoolean() esRenovable?: boolean;
}

class MovimientosDto {
  @IsOptional() @IsInt() pagina?: number;
  @IsOptional() @IsInt() porPagina?: number;
  @IsOptional() @IsInt() skuId?: number;
  @IsOptional() @IsInt() almacenId?: number;
  @IsOptional() @IsString() tipo?: string;
  @IsOptional() @IsDateString() desde?: string;
  @IsOptional() @IsDateString() hasta?: string;
}

@Controller("inventario")
@UseGuards(JwtGuard, PermisosGuard)
export class InventarioController {
  constructor(
    private readonly movimientos: MovimientoService,
    private readonly stock: StockService,
    private readonly excel: ExcelExportService,
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

  @Post("produccion")
  @Permisos("inventario.movimiento.crear")
  produccion(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: ProduccionDto) {
    return this.movimientos.entradaPorProduccion(usuario, {
      skuId: BigInt(dto.skuId),
      almacenId: BigInt(dto.almacenId),
      cantidad: dto.cantidad,
      costoUnitario: dto.costoUnitario,
      documentoId: dto.ordenTrabajoId !== undefined ? BigInt(dto.ordenTrabajoId) : undefined,
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
    let hasta: Date | undefined;
    if (dto.hasta) {
      hasta = new Date(dto.hasta);
      hasta.setHours(23, 59, 59, 999);
    }
    return this.stock.kardex(
      usuario.empresaId,
      BigInt(dto.skuId),
      dto.almacenId ? BigInt(dto.almacenId) : undefined,
      dto.desde ? new Date(dto.desde) : undefined,
      hasta,
    );
  }

  @Get("movimientos")
  @Permisos("inventario.ver")
  listarMovimientos(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query() dto: MovimientosDto,
  ) {
    // El filtro "hasta" llega como fecha (medianoche): se extiende al fin del
    // dia para que el rango sea inclusivo del dia indicado.
    let hasta: Date | undefined;
    if (dto.hasta) {
      hasta = new Date(dto.hasta);
      hasta.setHours(23, 59, 59, 999);
    }
    return this.stock.listarMovimientos(usuario.empresaId, {
      pagina: dto.pagina && dto.pagina > 0 ? dto.pagina : 1,
      porPagina:
        dto.porPagina && dto.porPagina > 0 ? Math.min(dto.porPagina, 100) : 20,
      skuId: dto.skuId ? BigInt(dto.skuId) : undefined,
      almacenId: dto.almacenId ? BigInt(dto.almacenId) : undefined,
      tipo: dto.tipo,
      desde: dto.desde ? new Date(dto.desde) : undefined,
      hasta,
    });
  }

  @Get("movimientos/:id")
  @Permisos("inventario.ver")
  detalleMovimiento(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
  ) {
    return this.stock.detalleMovimiento(usuario.empresaId, BigInt(id));
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

  @Get("existencias/export.xlsx")
  @Permisos("inventario.ver")
  async existenciasExport(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query() dto: ExistenciasDto,
    @Res() res: Response,
  ): Promise<void> {
    // Se exporta el universo filtrado completo, no solo una pagina de pantalla.
    const respuesta = await this.stock.existencias(usuario.empresaId, {
      pagina: 1,
      porPagina: 100_000,
      busqueda: dto.busqueda,
      almacenId: dto.almacenId ? BigInt(dto.almacenId) : undefined,
      esRenovable: dto.esRenovable,
    });

    const almacenPorId = new Map(
      respuesta.almacenes.map((a) => [a.id, a.codigo]),
    );

    // Una fila por posicion (SKU x almacen) para mostrar el detalle valorizado.
    const filas = respuesta.datos.flatMap((sku) =>
      sku.stocks.map((stock) => ({
        codigo: sku.codigoParlante,
        producto: sku.nombre,
        unidad: sku.unidad,
        almacen: almacenPorId.get(stock.almacenId) ?? stock.almacenId,
        disponible: Number(stock.disponible),
        comprometido: Number(stock.comprometido),
        costoPromedio: Number(stock.costoPromedio),
        valor: Number(stock.valorTotal),
      })),
    );

    const columnas: ColumnaExport[] = [
      { header: "Codigo", key: "codigo", width: 16 },
      { header: "Producto", key: "producto", width: 40 },
      { header: "Unidad", key: "unidad", width: 10, align: "center" },
      { header: "Almacen", key: "almacen", width: 16 },
      { header: "Disponible", key: "disponible", width: 14, align: "right" },
      { header: "Comprometido", key: "comprometido", width: 14, align: "right" },
      { header: "Costo promedio", key: "costoPromedio", width: 16, align: "right" },
      { header: "Valor S/", key: "valor", width: 16, align: "right", total: true },
    ];

    const buffer = await this.excel.construir({
      titulo: "Existencias valorizadas",
      columnas,
      filas,
    });
    enviarXlsx(
      res,
      buffer,
      `existencias_valorizadas_${fechaArchivo()}.xlsx`,
    );
  }

  @Get("kardex/export.xlsx")
  @Permisos("inventario.ver")
  async kardexExport(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query() dto: ConsultarKardexDto,
    @Res() res: Response,
  ): Promise<void> {
    let hastaExport: Date | undefined;
    if (dto.hasta) {
      hastaExport = new Date(dto.hasta);
      hastaExport.setHours(23, 59, 59, 999);
    }
    const lineas = await this.stock.kardex(
      usuario.empresaId,
      BigInt(dto.skuId),
      dto.almacenId ? BigInt(dto.almacenId) : undefined,
      dto.desde ? new Date(dto.desde) : undefined,
      hastaExport,
    );

    const filas = lineas.map((l) => ({
      fecha: l.fecha,
      referencia: l.referencia,
      entradas: Number(l.cantidadEntrada),
      salidas: Number(l.cantidadSalida),
      saldo: Number(l.saldoCantidad),
      costoUnitario: Number(l.costoUnitario),
      costoTotal: Number(l.costoTotal),
    }));

    const columnas: ColumnaExport[] = [
      { header: "Fecha", key: "fecha", width: 22 },
      { header: "Referencia", key: "referencia", width: 36 },
      { header: "Entradas", key: "entradas", width: 14, align: "right" },
      { header: "Salidas", key: "salidas", width: 14, align: "right" },
      { header: "Saldo", key: "saldo", width: 14, align: "right" },
      { header: "Costo unitario", key: "costoUnitario", width: 16, align: "right" },
      { header: "Costo total", key: "costoTotal", width: 16, align: "right" },
    ];

    const buffer = await this.excel.construir({
      titulo: "Kardex",
      columnas,
      filas,
    });
    enviarXlsx(res, buffer, `kardex_${fechaArchivo()}.xlsx`);
  }
}
