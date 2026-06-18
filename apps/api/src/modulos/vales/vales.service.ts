import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";

interface NuevoValeSalida {
  almacenId: bigint;
  centroCostoId: bigint;
  destino: string;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string; observacion?: string }>;
}

@Injectable()
export class ValesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativos: CorrelativoService,
    private readonly movimientos: MovimientoService,
  ) {}

  async listar(empresaId: bigint) {
    const filas = await this.prisma.valeSalida.findMany({
      where: { empresaId },
      include: {
        centroCosto: true,
        almacen: true,
        solicitante: true,
        autorizadoPor: true,
        lineas: true,
      },
      orderBy: { fecha: "desc" },
    });
    return filas.map((v) => ({
      id: v.id.toString(),
      numero: v.numero,
      fecha: v.fecha.toISOString(),
      estado: v.estado,
      almacenId: v.almacenId.toString(),
      almacen: v.almacen.nombre,
      centroCostoId: v.centroCostoId.toString(),
      centroCosto: v.centroCosto.nombre,
      destino: v.destino,
      solicitanteId: v.solicitanteId.toString(),
      solicitante: v.solicitante.nombre,
      autorizadoPorId: v.autorizadoPorId ? v.autorizadoPorId.toString() : null,
      autorizadoPor: v.autorizadoPor ? v.autorizadoPor.nombre : null,
      observaciones: v.observaciones,
      lineas: v.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        cantidad: l.cantidad.toString(),
        cantidadDespachada: l.cantidadDespachada.toString(),
        observacion: l.observacion,
        movimientoStockId: l.movimientoStockId ? l.movimientoStockId.toString() : null,
      })),
    }));
  }

  /**
   * Crea el vale en BORRADOR. Valida que almacen, centro de costo y skus
   * pertenezcan a la empresa (anti-IDOR). solicitanteId = usuario actual.
   */
  async crear(usuario: UsuarioRequest, dto: NuevoValeSalida) {
    const almacen = await this.prisma.almacen.findFirst({
      where: { id: dto.almacenId, empresaId: usuario.empresaId },
    });
    if (!almacen) throw new NotFoundException("Almacen no encontrado");

    const centro = await this.prisma.centroCosto.findFirst({
      where: { id: dto.centroCostoId, empresaId: usuario.empresaId },
    });
    if (!centro) throw new NotFoundException("Centro de costo no encontrado");

    const skuIds = [...new Set(dto.lineas.map((l) => l.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId: usuario.empresaId },
      select: { id: true },
    });
    if (skus.length !== skuIds.length) {
      throw new BadRequestException("Uno o mas SKU no pertenecen a la empresa");
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const correlativo = await this.correlativos.siguiente(
        tx,
        usuario.empresaId,
        "VALE_SALIDA",
      );
      const vale = await tx.valeSalida.create({
        data: {
          empresaId: usuario.empresaId,
          numero: correlativo.formateado,
          almacenId: dto.almacenId,
          centroCostoId: dto.centroCostoId,
          solicitanteId: usuario.id,
          destino: dto.destino,
          estado: "BORRADOR",
          observaciones: dto.observaciones ?? null,
          lineas: {
            create: dto.lineas.map((l) => ({
              empresaId: usuario.empresaId,
              skuId: l.skuId,
              cantidad: l.cantidad,
              observacion: l.observacion ?? null,
            })),
          },
        },
      });
      return vale.id;
    });

    return { id: id.toString() };
  }

  /** BORRADOR -> AUTORIZADO. Deja constancia del autorizador (segregacion). */
  async autorizar(usuario: UsuarioRequest, id: bigint) {
    const vale = await this.cargar(usuario.empresaId, id);
    if (vale.estado !== "BORRADOR") {
      throw new BadRequestException(`El vale esta ${vale.estado}`);
    }
    await this.prisma.valeSalida.update({
      where: { id: vale.id },
      data: { estado: "AUTORIZADO", autorizadoPorId: usuario.id },
    });
    return { id: id.toString(), estado: "AUTORIZADO" };
  }

  /**
   * AUTORIZADO -> DESPACHADO. Por cada linea genera la salida REAL en el ledger
   * (consumo FIFO, valida stock). Todo dentro de una transaccion: si falta
   * stock en cualquier linea, la operacion completa revierte.
   */
  async despachar(usuario: UsuarioRequest, id: bigint) {
    const vale = await this.cargar(usuario.empresaId, id);
    if (vale.estado !== "AUTORIZADO") {
      throw new BadRequestException(
        `El vale debe estar AUTORIZADO para despachar (esta ${vale.estado})`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      for (const linea of vale.lineas) {
        const { movimientoId } = await this.movimientos.salidaPorVale(usuario, tx, {
          skuId: linea.skuId,
          almacenId: vale.almacenId,
          cantidad: linea.cantidad.toString(),
          documentoId: vale.id,
          observaciones: `Vale de salida ${vale.numero} - ${vale.destino}`,
        });
        await tx.valeSalidaLinea.update({
          where: { id: linea.id },
          data: { cantidadDespachada: linea.cantidad, movimientoStockId: movimientoId },
        });
      }
      await tx.valeSalida.update({
        where: { id: vale.id },
        data: { estado: "DESPACHADO" },
      });
    });

    return { id: id.toString(), estado: "DESPACHADO" };
  }

  /** BORRADOR o AUTORIZADO -> ANULADO. No se puede anular un vale despachado. */
  async anular(usuario: UsuarioRequest, id: bigint) {
    const vale = await this.cargar(usuario.empresaId, id);
    if (vale.estado === "DESPACHADO") {
      throw new BadRequestException("No se puede anular un vale ya despachado");
    }
    if (vale.estado === "ANULADO") {
      throw new BadRequestException("El vale ya esta anulado");
    }
    await this.prisma.valeSalida.update({
      where: { id: vale.id },
      data: { estado: "ANULADO" },
    });
    return { id: id.toString(), estado: "ANULADO" };
  }

  private async cargar(empresaId: bigint, id: bigint) {
    const vale = await this.prisma.valeSalida.findFirst({
      where: { id, empresaId },
      include: { lineas: true },
    });
    if (!vale) throw new NotFoundException("Vale de salida no encontrado");
    return vale;
  }
}
