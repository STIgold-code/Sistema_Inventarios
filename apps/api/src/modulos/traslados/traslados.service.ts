import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";

const D = Prisma.Decimal;

interface NuevoTraslado {
  almacenOrigenId: bigint;
  almacenDestinoId: bigint;
  numero: string;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string }>;
}

interface Recepcion {
  lineas: Array<{ trasladoLineaId: bigint; cantidadRecibida: string }>;
}

@Injectable()
export class TrasladosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(usuario: UsuarioRequest, dto: NuevoTraslado) {
    if (dto.almacenOrigenId === dto.almacenDestinoId) {
      throw new BadRequestException("El origen y el destino deben ser distintos.");
    }
    // Aislamiento por empresa: ambos almacenes deben pertenecer al tenant.
    const almacenes = await this.prisma.almacen.count({
      where: {
        empresaId: usuario.empresaId,
        id: { in: [dto.almacenOrigenId, dto.almacenDestinoId] },
      },
    });
    if (almacenes !== 2) {
      throw new NotFoundException("Almacén no encontrado.");
    }
    // Aislamiento por empresa (anti-IDOR): todos los SKUs deben pertenecer al tenant.
    const idsSku = [...new Set(dto.lineas.map((l) => l.skuId))];
    const skusValidos = await this.prisma.sku.count({
      where: { id: { in: idsSku }, empresaId: usuario.empresaId },
    });
    if (skusValidos !== idsSku.length) {
      throw new NotFoundException("Algún SKU del traslado no pertenece a la empresa.");
    }
    const traslado = await this.prisma.traslado.create({
      data: {
        empresaId: usuario.empresaId,
        almacenOrigenId: dto.almacenOrigenId,
        almacenDestinoId: dto.almacenDestinoId,
        numero: dto.numero,
        observaciones: dto.observaciones ?? null,
        usuarioId: usuario.id,
        lineas: {
          create: dto.lineas.map((l) => ({
            empresaId: usuario.empresaId,
            skuId: l.skuId,
            cantidad: l.cantidad,
          })),
        },
      },
    });
    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "CREAR",
      entidad: "TRASLADO",
      entidadId: traslado.id,
      detalle: `Traslado ${traslado.numero} creado`,
    });
    return { id: traslado.id.toString() };
  }

  /** Despacho: saca la mercaderia del origen. El traslado queda EN_TRANSITO. */
  async despachar(usuario: UsuarioRequest, trasladoId: bigint) {
    const traslado = await this.obtener(usuario.empresaId, trasladoId);
    if (traslado.estado !== "PENDIENTE") {
      throw new BadRequestException(`El traslado esta ${traslado.estado}.`);
    }

    // Todo el despacho (salidas del ledger inmutable + updates de lineas + cambio
    // de estado) ocurre en UNA transaccion: si cualquier linea falla a mitad, nada
    // se commitea (sin movimientos huerfanos ni estado inconsistente).
    await this.prisma.$transaction(async (tx) => {
      for (const linea of traslado.lineas) {
        const salida = await this.movimientos.salidaPorTrasladoEnTx(usuario, tx, {
          skuId: linea.skuId,
          almacenId: traslado.almacenOrigenId,
          cantidad: linea.cantidad.toString(),
          observaciones: `Despacho traslado ${traslado.numero}`,
        });
        await tx.trasladoLinea.update({
          where: { id: linea.id },
          data: {
            cantidadDespachada: linea.cantidad,
            costoUnitario: salida.costoUnitario,
          },
        });
      }

      await tx.traslado.update({
        where: { id: traslado.id },
        data: { estado: "EN_TRANSITO", fechaDespacho: new Date() },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "DESPACHAR",
          entidad: "TRASLADO",
          entidadId: traslado.id,
          detalle: `Traslado ${traslado.numero} despachado`,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /**
   * Recepcion: ingresa al destino lo efectivamente recibido (puede ser menor
   * a lo despachado por diferencias en el viaje). El traslado queda RECIBIDO.
   */
  async recibir(usuario: UsuarioRequest, trasladoId: bigint, dto: Recepcion) {
    const traslado = await this.obtener(usuario.empresaId, trasladoId);
    if (traslado.estado !== "EN_TRANSITO") {
      throw new BadRequestException(`El traslado esta ${traslado.estado}.`);
    }

    // Toda la recepcion (entradas al ledger inmutable + updates de lineas + cambio
    // de estado) ocurre en UNA transaccion: si cualquier linea falla a mitad, nada
    // se commitea (sin movimientos huerfanos ni estado inconsistente).
    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.lineas) {
        const linea = traslado.lineas.find((l) => l.id === item.trasladoLineaId);
        if (!linea) {
          throw new BadRequestException(`Linea ${item.trasladoLineaId} no pertenece al traslado.`);
        }
        const recibida = new D(item.cantidadRecibida);
        if (recibida.greaterThan(new D(linea.cantidadDespachada))) {
          throw new BadRequestException(
            `No puedes recibir mas de lo despachado (despachado ${linea.cantidadDespachada.toString()}).`,
          );
        }
        if (recibida.greaterThan(0)) {
          await this.movimientos.entradaPorTrasladoEnTx(usuario, tx, {
            skuId: linea.skuId,
            almacenId: traslado.almacenDestinoId,
            cantidad: recibida.toString(),
            costoUnitario: linea.costoUnitario.toString(),
            observaciones: `Recepcion traslado ${traslado.numero}`,
          });
        }
        await tx.trasladoLinea.update({
          where: { id: linea.id },
          data: { cantidadRecibida: recibida },
        });
      }

      await tx.traslado.update({
        where: { id: traslado.id },
        data: { estado: "RECIBIDO", fechaRecepcion: new Date() },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "RECIBIR",
          entidad: "TRASLADO",
          entidadId: traslado.id,
          detalle: `Traslado ${traslado.numero} recibido`,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /** Anula un traslado aun no despachado. */
  async anular(usuario: UsuarioRequest, trasladoId: bigint) {
    const traslado = await this.obtener(usuario.empresaId, trasladoId);
    if (traslado.estado !== "PENDIENTE") {
      throw new BadRequestException("Solo se puede anular un traslado pendiente (sin despachar).");
    }
    await this.prisma.traslado.update({
      where: { id: traslado.id },
      data: { estado: "ANULADO" },
    });
    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "ANULAR",
      entidad: "TRASLADO",
      entidadId: traslado.id,
      detalle: `Traslado ${traslado.numero} anulado`,
    });
    return { ok: true };
  }

  async listar(empresaId: bigint) {
    const traslados = await this.prisma.traslado.findMany({
      where: { empresaId },
      include: { lineas: true },
      orderBy: { fechaEmision: "desc" },
    });
    const almacenes = new Map(
      (await this.prisma.almacen.findMany({ where: { empresaId } })).map((a) => [
        a.id.toString(),
        `${a.codigo} — ${a.nombre}`,
      ]),
    );
    const skus = await this.cargarSkus(
      empresaId,
      traslados.flatMap((t) => t.lineas.map((l) => l.skuId)),
    );

    return traslados.map((t) => ({
      id: t.id.toString(),
      numero: t.numero,
      estado: t.estado,
      origen: almacenes.get(t.almacenOrigenId.toString()) ?? t.almacenOrigenId.toString(),
      destino: almacenes.get(t.almacenDestinoId.toString()) ?? t.almacenDestinoId.toString(),
      lineas: t.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        codigoSku: skus.get(l.skuId.toString())?.codigo ?? "",
        nombreSku: skus.get(l.skuId.toString())?.nombre ?? `SKU ${l.skuId}`,
        cantidad: l.cantidad.toString(),
        cantidadDespachada: l.cantidadDespachada.toString(),
        cantidadRecibida: l.cantidadRecibida.toString(),
      })),
    }));
  }

  private async obtener(empresaId: bigint, trasladoId: bigint) {
    const traslado = await this.prisma.traslado.findFirst({
      where: { id: trasladoId, empresaId },
      include: { lineas: true },
    });
    if (!traslado) throw new NotFoundException("Traslado no encontrado.");
    return traslado;
  }

  private async cargarSkus(
    empresaId: bigint,
    ids: bigint[],
  ): Promise<Map<string, { codigo: string; nombre: string }>> {
    if (ids.length === 0) return new Map();
    const skus = await this.prisma.sku.findMany({
      where: { empresaId, id: { in: [...new Set(ids)] } },
      include: { producto: true },
    });
    return new Map(
      skus.map((s) => [
        s.id.toString(),
        { codigo: s.codigoParlante, nombre: s.nombre ?? s.producto.nombre },
      ]),
    );
  }
}
