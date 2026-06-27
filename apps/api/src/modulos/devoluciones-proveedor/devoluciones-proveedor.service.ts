import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";

const D = Prisma.Decimal;

interface NuevaDevolucionProveedor {
  recepcionId: bigint;
  motivo?: string;
  fecha?: Date;
  tipoComprobante?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  fechaComprobante?: Date;
  lineas: Array<{
    recepcionLineaId?: bigint;
    skuId: bigint;
    cantidad: string;
    motivo?: string;
    numerosSerie?: string[];
  }>;
}

/**
 * Devolucion de mercaderia a un proveedor (reverso de recepcion de compra).
 * Saca stock valorizado del almacen de la orden de compra. La devolucion, su
 * correlativo y todas las salidas del ledger ocurren en UNA transaccion.
 */
@Injectable()
export class DevolucionesProveedorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
    private readonly correlativos: CorrelativoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async registrar(usuario: UsuarioRequest, dto: NuevaDevolucionProveedor) {
    const recepcion = await this.prisma.recepcion.findFirst({
      where: { id: dto.recepcionId, empresaId: usuario.empresaId },
      include: { ordenCompra: true, lineas: true },
    });
    if (!recepcion) throw new NotFoundException("Recepcion no encontrada");
    if (dto.lineas.length === 0) {
      throw new BadRequestException("La devolucion debe tener al menos una linea");
    }

    const almacenId = recepcion.ordenCompra.almacenId;

    // Tope BRUTO por SKU = lo recibido en esta recepcion.
    const recibidoPorSku = new Map<string, Prisma.Decimal>();
    for (const l of recepcion.lineas) {
      const k = l.skuId.toString();
      recibidoPorSku.set(k, (recibidoPorSku.get(k) ?? new D(0)).add(new D(l.cantidad)));
    }

    const pedidoPorSku = new Map<string, Prisma.Decimal>();
    for (const linea of dto.lineas) {
      const cantidad = new D(linea.cantidad);
      if (cantidad.lessThanOrEqualTo(0)) {
        throw new BadRequestException("La cantidad a devolver debe ser mayor a cero");
      }
      const k = linea.skuId.toString();
      pedidoPorSku.set(k, (pedidoPorSku.get(k) ?? new D(0)).add(cantidad));
    }
    for (const [skuId, devolver] of pedidoPorSku) {
      const recibido = recibidoPorSku.get(skuId) ?? new D(0);
      if (devolver.greaterThan(recibido)) {
        throw new BadRequestException(
          `La devolucion del SKU ${skuId} excede lo recibido (recibido ${recibido.toString()}).`,
        );
      }
    }

    const fecha = dto.fecha ?? new Date();

    return this.prisma.$transaction(async (tx) => {
      // Lock por posicion ordenado por skuId (anti-deadlock), antes de leer el tope neto.
      const skus = [...pedidoPorSku.keys()]
        .map((s) => BigInt(s))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const skuId of skus) {
        await this.movimientos.bloquearPosicion(tx, usuario.empresaId, skuId, almacenId);
      }

      // Tope NETO: recibido menos lo ya devuelto en devoluciones previas de ESTA recepcion.
      const previas = await tx.devolucionProveedorLinea.groupBy({
        by: ["skuId"],
        where: { empresaId: usuario.empresaId, devolucion: { recepcionId: recepcion.id } },
        _sum: { cantidad: true },
      });
      const devueltoPorSku = new Map<string, Prisma.Decimal>();
      for (const p of previas) {
        devueltoPorSku.set(p.skuId.toString(), new D(p._sum.cantidad ?? 0));
      }
      for (const [skuId, devolver] of pedidoPorSku) {
        const disponible = (recibidoPorSku.get(skuId) ?? new D(0)).sub(
          devueltoPorSku.get(skuId) ?? new D(0),
        );
        if (devolver.greaterThan(disponible)) {
          throw new BadRequestException(
            `La devolucion del SKU ${skuId} excede lo pendiente de devolver (${disponible.toString()}).`,
          );
        }
      }

      const correlativo = await this.correlativos.siguiente(
        tx,
        usuario.empresaId,
        "DEVOLUCION_PROVEEDOR",
      );
      const numero = `DEVP-${correlativo.formateado}`;

      const devolucion = await tx.devolucionProveedor.create({
        data: {
          empresaId: usuario.empresaId,
          almacenId,
          ordenCompraId: recepcion.ordenCompraId,
          recepcionId: recepcion.id,
          numero,
          fecha,
          motivo: dto.motivo ?? null,
          tipoComprobante: dto.tipoComprobante ?? null,
          serieComprobante: dto.serieComprobante ?? null,
          numeroComprobante: dto.numeroComprobante ?? null,
          fechaComprobante: dto.fechaComprobante ?? null,
          usuarioId: usuario.id,
        },
      });

      for (const linea of dto.lineas) {
        const salida = await this.movimientos.salidaPorDevolucionProveedorEnTx(usuario, tx, {
          skuId: linea.skuId,
          almacenId,
          cantidad: linea.cantidad,
          documentoId: devolucion.id,
          observaciones: `Devolucion a proveedor ${numero}`,
          numerosSerie: linea.numerosSerie,
        });
        await tx.devolucionProveedorLinea.create({
          data: {
            empresaId: usuario.empresaId,
            devolucionId: devolucion.id,
            recepcionLineaId: linea.recepcionLineaId ?? null,
            skuId: linea.skuId,
            cantidad: linea.cantidad,
            motivo: linea.motivo ?? null,
            costoUnitario: salida.costoUnitario,
            movimientoSalidaId: salida.movimientoId,
          },
        });
      }

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "DEVOLVER_PROVEEDOR",
          entidad: "DEVOLUCION_PROVEEDOR",
          entidadId: devolucion.id,
          detalle: `Devolucion al proveedor N° ${numero}`,
        },
        tx,
      );

      return { id: devolucion.id.toString(), numero };
    });
  }

  async listar(empresaId: bigint) {
    const filas = await this.prisma.devolucionProveedor.findMany({
      where: { empresaId },
      include: { lineas: true, ordenCompra: { include: { proveedor: true } }, recepcion: true },
      orderBy: { fecha: "desc" },
    });
    const skuIds = [...new Set(filas.flatMap((d) => d.lineas.map((l) => l.skuId)))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId },
      select: { id: true, codigoParlante: true, nombre: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id.toString(), s]));
    return filas.map((d) => ({
      id: d.id.toString(),
      numero: d.numero,
      estado: d.estado,
      fecha: d.fecha.toISOString(),
      motivo: d.motivo,
      ordenCompraNumero: d.ordenCompra.numero,
      proveedor: d.ordenCompra.proveedor.razonSocial,
      lineas: d.lineas.map((l) => {
        const sku = skuPorId.get(l.skuId.toString());
        return {
          id: l.id.toString(),
          skuId: l.skuId.toString(),
          codigoSku: sku ? sku.codigoParlante : null,
          nombreSku: sku ? sku.nombre : null,
          cantidad: l.cantidad.toString(),
          costoUnitario: l.costoUnitario.toString(),
          motivo: l.motivo,
        };
      }),
    }));
  }
}
