import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../movimientos/movimiento.service.js";

const D = Prisma.Decimal;

@Injectable()
export class ConteoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
  ) {}

  /** Abre un conteo fisico para un almacen. */
  async abrir(usuario: UsuarioRequest, almacenId: bigint, observaciones?: string) {
    const conteo = await this.prisma.conteoFisico.create({
      data: {
        empresaId: usuario.empresaId,
        almacenId,
        usuarioId: usuario.id,
        observaciones: observaciones ?? null,
      },
    });
    return { id: conteo.id.toString() };
  }

  /**
   * Registra (o actualiza) la cantidad contada de un SKU. Captura un snapshot
   * de la cantidad en sistema al momento del conteo y calcula la diferencia.
   */
  async registrarLinea(
    usuario: UsuarioRequest,
    dto: { conteoId: bigint; skuId: bigint; cantidadContada: string },
  ) {
    const conteo = await this.prisma.conteoFisico.findFirst({
      where: { id: dto.conteoId, empresaId: usuario.empresaId },
    });
    if (!conteo) throw new NotFoundException("Conteo no encontrado");
    if (conteo.estado !== "ABIERTO") {
      throw new BadRequestException("El conteo no esta abierto");
    }

    const item = await this.prisma.itemStock.findFirst({
      where: {
        empresaId: usuario.empresaId,
        skuId: dto.skuId,
        almacenId: conteo.almacenId,
        ubicacionId: null,
        loteId: null,
        serie: null,
      },
    });
    const sistema = item ? new D(item.cantidadDisponible) : new D(0);
    const contada = new D(dto.cantidadContada);
    const diferencia = contada.sub(sistema);

    await this.prisma.conteoLinea.upsert({
      where: { conteoId_skuId: { conteoId: dto.conteoId, skuId: dto.skuId } },
      update: { cantidadSistema: sistema, cantidadContada: contada, diferencia },
      create: {
        empresaId: usuario.empresaId,
        conteoId: dto.conteoId,
        skuId: dto.skuId,
        cantidadSistema: sistema,
        cantidadContada: contada,
        diferencia,
      },
    });
    return { diferencia: diferencia.toString() };
  }

  /**
   * Aplica el conteo: por cada linea con diferencia genera un ajuste en el
   * ledger que lleva el stock a la cantidad contada. Cierra el conteo.
   */
  async aplicar(usuario: UsuarioRequest, conteoId: bigint) {
    const conteo = await this.prisma.conteoFisico.findFirst({
      where: { id: conteoId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!conteo) throw new NotFoundException("Conteo no encontrado");
    if (conteo.estado !== "ABIERTO") {
      throw new BadRequestException("El conteo ya fue procesado");
    }

    let ajustes = 0;
    for (const linea of conteo.lineas) {
      if (new D(linea.diferencia).isZero()) continue;
      const resultado = await this.movimientos.ajustar(usuario, {
        skuId: linea.skuId,
        almacenId: conteo.almacenId,
        cantidadObjetivo: linea.cantidadContada.toString(),
        observaciones: `Cuadre conteo #${conteo.id}`,
      });
      if (resultado.movimientoId) {
        await this.prisma.conteoLinea.update({
          where: { id: linea.id },
          data: { movimientoAjusteId: BigInt(resultado.movimientoId) },
        });
        ajustes += 1;
      }
    }

    await this.prisma.conteoFisico.update({
      where: { id: conteo.id },
      data: { estado: "APLICADO" },
    });
    return { ajustes };
  }

  async detalle(empresaId: bigint, conteoId: bigint) {
    const conteo = await this.prisma.conteoFisico.findFirst({
      where: { id: conteoId, empresaId },
      include: { lineas: true },
    });
    if (!conteo) throw new NotFoundException("Conteo no encontrado");
    return {
      id: conteo.id.toString(),
      almacenId: conteo.almacenId.toString(),
      estado: conteo.estado,
      lineas: conteo.lineas.map((l) => ({
        skuId: l.skuId.toString(),
        cantidadSistema: l.cantidadSistema.toString(),
        cantidadContada: l.cantidadContada.toString(),
        diferencia: l.diferencia.toString(),
      })),
    };
  }
}
