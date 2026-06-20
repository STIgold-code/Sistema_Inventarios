import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";

const D = Prisma.Decimal;

/** Tipo logico de documento para el correlativo de devoluciones. */
const TIPO_DOC_DEVOLUCION = "DEVOLUCION_VENTA";

interface NuevaDevolucion {
  ordenVentaId: bigint;
  comprobanteVentaId?: bigint;
  guiaRemisionId?: bigint;
  motivo?: string;
  fecha?: Date;
  lineas: Array<{
    ordenVentaLineaId?: bigint;
    skuId: bigint;
    cantidad: string;
    motivo?: string;
    numerosSerie?: string[];
  }>;
}

/**
 * Devolucion (reverso) de una venta despachada. Reingresa stock al almacen de la
 * orden mediante movimientos de ENTRADA por devolucion (ledger inmutable: el
 * reverso es un movimiento NUEVO, nunca un borrado). La devolucion, su
 * correlativo y todos los reingresos del ledger ocurren en UNA transaccion: si
 * cualquier linea falla, toda la operacion revierte.
 */
@Injectable()
export class DevolucionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
    private readonly correlativos: CorrelativoService,
  ) {}

  async registrar(usuario: UsuarioRequest, dto: NuevaDevolucion) {
    const orden = await this.prisma.ordenVenta.findFirst({
      where: { id: dto.ordenVentaId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de venta no encontrada");
    if (orden.estado !== "DESPACHADA" && orden.estado !== "PARCIAL") {
      throw new BadRequestException(
        "Solo se puede devolver una orden con despacho (DESPACHADA o PARCIAL)",
      );
    }

    // Validar pertenencia a la empresa de los documentos de referencia (anti-IDOR).
    if (dto.comprobanteVentaId !== undefined) {
      const comp = await this.prisma.comprobanteVenta.findFirst({
        where: {
          id: dto.comprobanteVentaId,
          empresaId: usuario.empresaId,
          ordenVentaId: orden.id,
        },
      });
      if (!comp) {
        throw new NotFoundException("Comprobante de venta no encontrado para esta orden");
      }
    }
    if (dto.guiaRemisionId !== undefined) {
      const guia = await this.prisma.guiaRemision.findFirst({
        where: {
          id: dto.guiaRemisionId,
          empresaId: usuario.empresaId,
          ordenVentaId: orden.id,
        },
      });
      if (!guia) {
        throw new NotFoundException("Guia de remision no encontrada para esta orden");
      }
    }

    if (dto.lineas.length === 0) {
      throw new BadRequestException("La devolucion debe tener al menos una linea");
    }

    // Lo despachado por SKU es el tope de lo devolvible (no se devuelve mas de lo
    // que salio). Se agrega por SKU porque una orden puede tener varias lineas del
    // mismo SKU. No descontamos devoluciones previas en esta version (control simple).
    const despachadoPorSku = new Map<string, Prisma.Decimal>();
    for (const l of orden.lineas) {
      const clave = l.skuId.toString();
      const acum = despachadoPorSku.get(clave) ?? new D(0);
      despachadoPorSku.set(clave, acum.add(new D(l.cantidadDespachada)));
    }

    const pedidoPorSku = new Map<string, Prisma.Decimal>();
    for (const linea of dto.lineas) {
      const cantidad = new D(linea.cantidad);
      if (cantidad.lessThanOrEqualTo(0)) {
        throw new BadRequestException("La cantidad a devolver debe ser mayor a cero");
      }
      // Si se referencia una linea de orden, validar que pertenezca a la orden y al SKU.
      if (linea.ordenVentaLineaId !== undefined) {
        const ovLinea = orden.lineas.find((l) => l.id === linea.ordenVentaLineaId);
        if (!ovLinea) {
          throw new BadRequestException(
            `La linea ${linea.ordenVentaLineaId} no pertenece a la orden`,
          );
        }
        if (ovLinea.skuId !== linea.skuId) {
          throw new BadRequestException(
            `El SKU no coincide con la linea ${linea.ordenVentaLineaId}`,
          );
        }
      }
      const clave = linea.skuId.toString();
      const acum = pedidoPorSku.get(clave) ?? new D(0);
      pedidoPorSku.set(clave, acum.add(cantidad));
    }

    for (const [skuId, devolver] of pedidoPorSku) {
      const despachado = despachadoPorSku.get(skuId) ?? new D(0);
      if (devolver.greaterThan(despachado)) {
        throw new BadRequestException(
          `La devolucion del SKU ${skuId} excede lo despachado: despachado ${despachado.toString()}, devolucion ${devolver.toString()}`,
        );
      }
    }

    const fecha = dto.fecha ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      const correlativo = await this.correlativos.siguiente(
        tx,
        usuario.empresaId,
        TIPO_DOC_DEVOLUCION,
      );
      const numero = `DEV-${correlativo.formateado}`;

      const devolucion = await tx.devolucionVenta.create({
        data: {
          empresaId: usuario.empresaId,
          almacenId: orden.almacenId,
          ordenVentaId: orden.id,
          comprobanteVentaId: dto.comprobanteVentaId ?? null,
          guiaRemisionId: dto.guiaRemisionId ?? null,
          numero,
          fecha,
          motivo: dto.motivo ?? null,
          usuarioId: usuario.id,
        },
      });

      for (const linea of dto.lineas) {
        const entrada = await this.movimientos.entradaPorDevolucion(usuario, tx, {
          skuId: linea.skuId,
          almacenId: orden.almacenId,
          cantidad: linea.cantidad,
          documentoId: devolucion.id,
          fechaEmisionDocumento: fecha,
          observaciones: `Devolucion ${numero} (OV ${orden.numero})`,
          numerosSerie: linea.numerosSerie,
        });

        await tx.devolucionVentaLinea.create({
          data: {
            empresaId: usuario.empresaId,
            devolucionId: devolucion.id,
            ordenVentaLineaId: linea.ordenVentaLineaId ?? null,
            skuId: linea.skuId,
            cantidad: linea.cantidad,
            motivo: linea.motivo ?? null,
            costoUnitario: entrada.costoUnitario,
            movimientoEntradaId: entrada.movimientoId,
          },
        });
      }

      return {
        id: devolucion.id.toString(),
        numero: devolucion.numero,
      };
    });
  }

  async listar(empresaId: bigint) {
    const devoluciones = await this.prisma.devolucionVenta.findMany({
      where: { empresaId },
      include: { lineas: true, ordenVenta: true },
      orderBy: { fecha: "desc" },
    });
    return devoluciones.map((d) => ({
      id: d.id.toString(),
      numero: d.numero,
      estado: d.estado,
      fecha: d.fecha.toISOString(),
      motivo: d.motivo,
      ordenVentaId: d.ordenVentaId.toString(),
      ordenVentaNumero: d.ordenVenta.numero,
      comprobanteVentaId: d.comprobanteVentaId ? d.comprobanteVentaId.toString() : null,
      guiaRemisionId: d.guiaRemisionId ? d.guiaRemisionId.toString() : null,
      lineas: d.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        cantidad: l.cantidad.toString(),
        motivo: l.motivo,
        costoUnitario: l.costoUnitario.toString(),
        movimientoEntradaId: l.movimientoEntradaId
          ? l.movimientoEntradaId.toString()
          : null,
      })),
    }));
  }
}
