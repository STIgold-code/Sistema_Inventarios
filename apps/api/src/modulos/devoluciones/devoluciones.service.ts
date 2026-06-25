import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
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
  // Referencia de la Nota de Credito que sustenta la devolucion (Tabla 10 SUNAT,
  // por defecto 07). Se persiste y se propaga al ledger (serie/numero/fecha reales).
  tipoComprobante?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  fechaComprobante?: Date;
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
    private readonly auditoria: AuditoriaService,
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

    // Lo despachado por SKU es el tope bruto de lo devolvible (no se devuelve mas
    // de lo que salio). Se agrega por SKU porque una orden puede tener varias
    // lineas del mismo SKU. El tope NETO se calcula dentro de la transaccion
    // restando lo ya devuelto en devoluciones previas (ver mas abajo).
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

    // Chequeo barato previo a la transaccion: nunca devolver mas que lo despachado
    // bruto. El tope NETO (descontando devoluciones previas) se valida dentro de la
    // transaccion para evitar carreras entre devoluciones concurrentes.
    for (const [skuId, devolver] of pedidoPorSku) {
      const despachado = despachadoPorSku.get(skuId) ?? new D(0);
      if (devolver.greaterThan(despachado)) {
        throw new BadRequestException(
          `La devolucion del SKU ${skuId} excede lo despachado: despachado ${despachado.toString()}, devolucion ${devolver.toString()}`,
        );
      }
    }

    const fecha = dto.fecha ?? new Date();
    // El periodo SUNAT del reingreso se rige por la fecha de emision de la Nota
    // de Credito cuando se capturo; si no, por la fecha de la devolucion.
    const fechaDocumento = dto.fechaComprobante ?? fecha;

    return this.prisma.$transaction(async (tx) => {
      // Lockear las posiciones (sku+almacen) afectadas ANTES de leer el tope neto:
      // de lo contrario dos devoluciones concurrentes leen el mismo "ya devuelto"
      // y ambas pasan, excediendo juntas lo despachado (TOCTOU). El advisory lock
      // es re-entrante (entradaPorDevolucion vuelve a tomarlo). Se ordena por skuId
      // para evitar deadlock entre devoluciones con SKUs solapados.
      const skusAfectados = [...pedidoPorSku.keys()]
        .map((s) => BigInt(s))
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const skuId of skusAfectados) {
        await this.movimientos.bloquearPosicion(
          tx,
          usuario.empresaId,
          skuId,
          orden.almacenId,
        );
      }

      // Tope NETO por SKU: despachado menos lo ya devuelto en devoluciones previas
      // de ESTA orden. Ahora se lee BAJO el lock, asi dos devoluciones concurrentes
      // no exceden juntas el despacho. Si (previo + nuevo) > despachado, revierte.
      const previas = await tx.devolucionVentaLinea.groupBy({
        by: ["skuId"],
        where: {
          empresaId: usuario.empresaId,
          devolucion: { ordenVentaId: orden.id },
        },
        _sum: { cantidad: true },
      });
      const devueltoPrevioPorSku = new Map<string, Prisma.Decimal>();
      for (const p of previas) {
        devueltoPrevioPorSku.set(p.skuId.toString(), new D(p._sum.cantidad ?? 0));
      }
      for (const [skuId, devolver] of pedidoPorSku) {
        const despachado = despachadoPorSku.get(skuId) ?? new D(0);
        const previo = devueltoPrevioPorSku.get(skuId) ?? new D(0);
        const disponible = despachado.sub(previo);
        if (devolver.greaterThan(disponible)) {
          throw new BadRequestException(
            `La devolucion del SKU ${skuId} excede lo pendiente de devolver: ` +
              `despachado ${despachado.toString()}, ya devuelto ${previo.toString()}, ` +
              `devolucion ${devolver.toString()}`,
          );
        }
      }

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
          tipoComprobante: dto.tipoComprobante ?? null,
          serieComprobante: dto.serieComprobante ?? null,
          numeroComprobante: dto.numeroComprobante ?? null,
          fechaComprobante: dto.fechaComprobante ?? null,
          usuarioId: usuario.id,
        },
      });

      for (const linea of dto.lineas) {
        // Costo basis: reingresar al costo con que el stock SALIO en el despacho,
        // no al costo promedio actual del item. Si la linea referencia una linea de
        // orden, se usa el costo de despacho de ESA linea; si no, el promedio
        // ponderado del costo de despacho sobre las lineas del mismo SKU. Si no hay
        // costo poblado (datos viejos), se omite y entradaPorDevolucion cae al costo
        // promedio vigente.
        const costoBasis = this.calcularCostoBasis(orden.lineas, linea);
        const entrada = await this.movimientos.entradaPorDevolucion(usuario, tx, {
          skuId: linea.skuId,
          almacenId: orden.almacenId,
          cantidad: linea.cantidad,
          documentoId: devolucion.id,
          costoUnitario: costoBasis ?? undefined,
          tipoDocumentoSunat: dto.tipoComprobante,
          serieComprobante: dto.serieComprobante,
          numeroComprobante: dto.numeroComprobante,
          fechaEmisionDocumento: fechaDocumento,
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

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "DEVOLVER",
          entidad: "DEVOLUCION_VENTA",
          entidadId: devolucion.id,
          detalle: `Devolución N° ${devolucion.numero} registrada (OV ${orden.numero})`,
        },
        tx,
      );

      return {
        id: devolucion.id.toString(),
        numero: devolucion.numero,
      };
    });
  }

  /**
   * Determina el costo basis (costo de despacho) para reingresar una linea de
   * devolucion. Si la linea referencia una linea de orden, usa el costo de
   * despacho de ESA linea. Si no, calcula el promedio ponderado del costo de
   * despacho sobre las lineas del mismo SKU con cantidad despachada > 0,
   * ponderado por la cantidad despachada. Devuelve null cuando no hay costo
   * poblado (datos viejos sin la columna) para que el llamador caiga al costo
   * promedio vigente del item.
   */
  private calcularCostoBasis(
    lineasOrden: Prisma.OrdenVentaLineaGetPayload<Record<string, never>>[],
    linea: NuevaDevolucion["lineas"][number],
  ): string | null {
    if (linea.ordenVentaLineaId !== undefined) {
      const ovLinea = lineasOrden.find((l) => l.id === linea.ordenVentaLineaId);
      const costo = ovLinea?.costoDespachoUnitario;
      if (!costo) return null;
      const costoD = new D(costo);
      return costoD.isZero() ? null : costoD.toString();
    }

    let cantidadTotal = new D(0);
    let costoPonderado = new D(0);
    for (const l of lineasOrden) {
      if (l.skuId !== linea.skuId) continue;
      if (l.costoDespachoUnitario === null) continue;
      const cantidad = new D(l.cantidadDespachada);
      if (cantidad.lessThanOrEqualTo(0)) continue;
      cantidadTotal = cantidadTotal.add(cantidad);
      costoPonderado = costoPonderado.add(cantidad.mul(new D(l.costoDespachoUnitario)));
    }
    if (cantidadTotal.isZero()) return null;
    const promedio = costoPonderado.div(cantidadTotal);
    return promedio.isZero() ? null : promedio.toString();
  }

  /**
   * Anula una devolucion REGISTRADA: por cada linea genera una SALIDA
   * compensatoria que retira del kardex el stock que la devolucion habia
   * reingresado (reverso del ledger inmutable, no un borrado). Para SKUs
   * serializados, las series vuelven a DESPACHADO. Todo en UNA transaccion con
   * CAS sobre el estado: si la devolucion ya no esta REGISTRADA, revierte. Si el
   * stock reingresado ya fue consumido (o las series ya se re-despacharon), la
   * salida falla y la anulacion completa se aborta.
   */
  async anular(usuario: UsuarioRequest, devolucionId: bigint) {
    const devolucion = await this.prisma.devolucionVenta.findFirst({
      where: { id: devolucionId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!devolucion) throw new NotFoundException("Devolucion no encontrada");
    if (devolucion.estado !== "REGISTRADA") {
      throw new BadRequestException(`La devolucion esta ${devolucion.estado}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // CAS sobre el estado al inicio: marca ANULADA solo si SIGUE REGISTRADA.
      // Cierra la ventana de carrera contra otra anulacion concurrente.
      const tomado = await tx.devolucionVenta.updateMany({
        where: { id: devolucion.id, empresaId: usuario.empresaId, estado: "REGISTRADA" },
        data: { estado: "ANULADA" },
      });
      if (tomado.count === 0) {
        throw new ConflictException("La devolucion ya no esta REGISTRADA");
      }

      // Lockear las posiciones afectadas antes de operar, ordenadas por skuId
      // para evitar deadlock entre anulaciones con SKUs solapados.
      const skusAfectados = [...new Set(devolucion.lineas.map((l) => l.skuId))].sort(
        (a, b) => (a < b ? -1 : a > b ? 1 : 0),
      );
      for (const skuId of skusAfectados) {
        await this.movimientos.bloquearPosicion(
          tx,
          usuario.empresaId,
          skuId,
          devolucion.almacenId,
        );
      }

      for (const linea of devolucion.lineas) {
        // Series que esta devolucion reingreso (enlazadas a su movimiento de
        // entrada y aun DISPONIBLE). Si alguna ya se re-despacho, no aparece y
        // la salida fallara por cantidad: no se puede anular en ese caso.
        const series = linea.movimientoEntradaId
          ? (
              await tx.serieArticulo.findMany({
                where: {
                  empresaId: usuario.empresaId,
                  skuId: linea.skuId,
                  movimientoEntradaId: linea.movimientoEntradaId,
                  estado: "DISPONIBLE",
                },
                select: { numeroSerie: true },
              })
            ).map((s) => s.numeroSerie)
          : [];

        await this.movimientos.salidaPorAnulacionDevolucionEnTx(usuario, tx, {
          skuId: linea.skuId,
          almacenId: devolucion.almacenId,
          cantidad: linea.cantidad.toString(),
          documentoId: devolucion.id,
          observaciones: `Anulacion devolucion ${devolucion.numero}`,
          numerosSerie: series.length > 0 ? series : undefined,
        });
      }

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "ANULAR",
          entidad: "DEVOLUCION_VENTA",
          entidadId: devolucion.id,
          detalle: `Devolución N° ${devolucion.numero} anulada`,
        },
        tx,
      );

      return { id: devolucion.id.toString(), estado: "ANULADA" };
    });
  }

  async listar(empresaId: bigint) {
    const devoluciones = await this.prisma.devolucionVenta.findMany({
      where: { empresaId },
      include: { lineas: true, ordenVenta: true },
      orderBy: { fecha: "desc" },
    });
    const skuIds = [
      ...new Set(devoluciones.flatMap((d) => d.lineas.map((l) => l.skuId))),
    ];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId },
      select: { id: true, codigoParlante: true, nombre: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id.toString(), s]));
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
      tipoComprobante: d.tipoComprobante,
      serieComprobante: d.serieComprobante,
      numeroComprobante: d.numeroComprobante,
      fechaComprobante: d.fechaComprobante ? d.fechaComprobante.toISOString() : null,
      lineas: d.lineas.map((l) => {
        const sku = skuPorId.get(l.skuId.toString());
        return {
          id: l.id.toString(),
          skuId: l.skuId.toString(),
          codigoSku: sku ? sku.codigoParlante : null,
          nombreSku: sku ? sku.nombre : null,
          cantidad: l.cantidad.toString(),
          motivo: l.motivo,
          costoUnitario: l.costoUnitario.toString(),
          movimientoEntradaId: l.movimientoEntradaId
            ? l.movimientoEntradaId.toString()
            : null,
        };
      }),
    }));
  }
}
