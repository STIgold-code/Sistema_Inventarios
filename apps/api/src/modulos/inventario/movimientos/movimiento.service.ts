import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  METODO_VALUACION,
  SIGNO_MOVIMIENTO,
  TIPO_DOCUMENTO,
  TIPO_MOVIMIENTO,
  TIPO_OPERACION,
} from "@bm/tipos";
import { PrismaService } from "../../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../../comun/contexto/usuario-request.js";
import {
  InconsistenciaCapasError,
  StockInsuficienteError,
} from "./errores.js";

type Tx = Prisma.TransactionClient;
type ItemStock = Prisma.ItemStockGetPayload<Record<string, never>>;
const D = Prisma.Decimal;

interface EntradaCompra {
  skuId: bigint;
  almacenId: bigint;
  cantidad: string;
  costoUnitario: string;
  ubicacionId?: bigint;
  /** Id del documento origen (Recepcion) para enlazar el ledger al documento real. */
  documentoId?: bigint;
  tipoDocumentoSunat?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  /** Fecha de emision real de la factura del proveedor (rige el periodo SUNAT). */
  fechaEmisionDocumento?: Date;
  observaciones?: string;
}

interface SalidaVenta {
  skuId: bigint;
  almacenId: bigint;
  cantidad: string;
  ubicacionId?: bigint;
  /** Si true, la salida descuenta del stock comprometido (despacho de reserva). */
  desdeReserva?: boolean;
  /** Id del documento origen (ComprobanteVenta) para enlazar el ledger al comprobante real. */
  documentoId?: bigint;
  tipoDocumentoSunat?: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  /** Fecha de emision real del comprobante (rige el periodo SUNAT). */
  fechaEmisionDocumento?: Date;
  observaciones?: string;
}

interface ConsumoCapaTmp {
  capaCostoId: bigint;
  cantidad: Prisma.Decimal;
  costoUnitario: Prisma.Decimal;
}

interface DatosMovimiento {
  usuario: UsuarioRequest;
  item: ItemStock;
  tipo: string;
  signo: string;
  cantidad: Prisma.Decimal;
  costoUnitario: Prisma.Decimal;
  costoTotal: Prisma.Decimal;
  saldoCantidad: Prisma.Decimal;
  saldoCostoUnitario: Prisma.Decimal;
  saldoCostoTotal: Prisma.Decimal;
  documentoTipo: string;
  /** Id del documento origen real (OC, vale, etc.). Si no viene, queda null. */
  documentoId?: bigint;
  tipoOperacionSunat: string;
  tipoDocumentoSunat: string;
  serieComprobante?: string;
  numeroComprobante?: string;
  /** Fecha de emision real del documento. Si no viene, se usa la fecha actual. */
  fechaEmisionDocumento?: Date;
  observaciones?: string;
}

/**
 * Motor transaccional del kardex. Cada movimiento toca, en UNA transaccion
 * atomica: el LEDGER inmutable (movimiento_stock), las CAPAS DE COSTO y la
 * PROYECCION de stock (item_stock). La concurrencia se serializa por
 * (empresa, sku, almacen) con un advisory lock de Postgres, garantizando que
 * el stock nunca quede negativo.
 */
@Injectable()
export class MovimientoService {
  constructor(private readonly prisma: PrismaService) {}

  /** Entrada por compra: crea una capa de costo y recalcula el promedio movil. */
  async recibirCompra(
    usuario: UsuarioRequest,
    dto: EntradaCompra,
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const costoUnitario = new D(dto.costoUnitario);
    const costoTotal = cantidad.mul(costoUnitario);

    const movimientoId = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerOcrearItem(
        tx,
        usuario.empresaId,
        dto.skuId,
        dto.almacenId,
        dto.ubicacionId,
      );

      // Promedio movil ponderado sobre el stock FISICO (disponible + comprometido).
      const fisicoPrev = new D(item.cantidadDisponible).add(
        new D(item.cantidadComprometida),
      );
      const valorPrev = fisicoPrev.mul(new D(item.costoPromedio));
      const nuevaDisponible = new D(item.cantidadDisponible).add(cantidad);
      const nuevoFisico = fisicoPrev.add(cantidad);
      const nuevoValor = valorPrev.add(costoTotal);
      const nuevoPromedio = nuevoFisico.isZero()
        ? new D(0)
        : nuevoValor.div(nuevoFisico);

      const mov = await this.crearMovimiento(tx, {
        usuario,
        item,
        tipo: TIPO_MOVIMIENTO.ENTRADA_COMPRA,
        signo: SIGNO_MOVIMIENTO.ENTRADA,
        cantidad,
        costoUnitario,
        costoTotal,
        saldoCantidad: nuevoFisico,
        saldoCostoUnitario: nuevoPromedio,
        saldoCostoTotal: nuevoValor,
        documentoTipo: "RECEPCION",
        documentoId: dto.documentoId,
        tipoOperacionSunat: TIPO_OPERACION.COMPRA,
        tipoDocumentoSunat: dto.tipoDocumentoSunat ?? TIPO_DOCUMENTO.FACTURA,
        serieComprobante: dto.serieComprobante,
        numeroComprobante: dto.numeroComprobante,
        fechaEmisionDocumento: dto.fechaEmisionDocumento,
        observaciones: dto.observaciones,
      });

      // Una capa de costo por cada entrada (FIFO disponible).
      await tx.capaCosto.create({
        data: {
          empresaId: usuario.empresaId,
          skuId: dto.skuId,
          almacenId: dto.almacenId,
          movimientoEntradaId: mov.id,
          cantidadInicial: cantidad,
          cantidadRestante: cantidad,
          costoUnitario,
        },
      });

      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadDisponible: nuevaDisponible,
          costoPromedio: nuevoPromedio,
          version: { increment: 1 },
        },
      });

      return mov.id;
    });

    return { movimientoId: movimientoId.toString() };
  }

  /**
   * Carga de stock inicial (migracion / saldo de apertura). Igual que una
   * entrada pero con tipo INICIAL y operacion SUNAT "saldo inicial" (Tabla 12).
   */
  async cargarStockInicial(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; costoUnitario: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const costoUnitario = new D(dto.costoUnitario);
    const costoTotal = cantidad.mul(costoUnitario);

    const movimientoId = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerOcrearItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);

      const fisicoPrev = new D(item.cantidadDisponible).add(new D(item.cantidadComprometida));
      const valorPrev = fisicoPrev.mul(new D(item.costoPromedio));
      const nuevaDisponible = new D(item.cantidadDisponible).add(cantidad);
      const nuevoFisico = fisicoPrev.add(cantidad);
      const nuevoValor = valorPrev.add(costoTotal);
      const nuevoPromedio = nuevoFisico.isZero() ? new D(0) : nuevoValor.div(nuevoFisico);

      const mov = await this.crearMovimiento(tx, {
        usuario,
        item,
        tipo: TIPO_MOVIMIENTO.ENTRADA_INICIAL,
        signo: SIGNO_MOVIMIENTO.ENTRADA,
        cantidad,
        costoUnitario,
        costoTotal,
        saldoCantidad: nuevoFisico,
        saldoCostoUnitario: nuevoPromedio,
        saldoCostoTotal: nuevoValor,
        documentoTipo: "INICIAL",
        tipoOperacionSunat: TIPO_OPERACION.SALDO_INICIAL,
        tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
        observaciones: "Carga de stock inicial",
      });

      await tx.capaCosto.create({
        data: {
          empresaId: usuario.empresaId,
          skuId: dto.skuId,
          almacenId: dto.almacenId,
          movimientoEntradaId: mov.id,
          cantidadInicial: cantidad,
          cantidadRestante: cantidad,
          costoUnitario,
        },
      });

      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadDisponible: nuevaDisponible,
          costoPromedio: nuevoPromedio,
          version: { increment: 1 },
        },
      });

      return mov.id;
    });

    return { movimientoId: movimientoId.toString() };
  }

  /** Salida por venta: valida disponibilidad, consume capas FIFO y descuenta. */
  async registrarSalidaVenta(
    usuario: UsuarioRequest,
    dto: SalidaVenta,
  ): Promise<{ movimientoId: string; costoSalida: string }> {
    const cantidad = new D(dto.cantidad);

    const resultado = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(
        tx,
        usuario.empresaId,
        dto.skuId,
        dto.almacenId,
        dto.ubicacionId,
      );

      const disponible = item ? new D(item.cantidadDisponible) : new D(0);
      const comprometidaPrev = item ? new D(item.cantidadComprometida) : new D(0);
      // El despacho de reserva descuenta del comprometido; la venta directa, del disponible.
      const fuente = dto.desdeReserva ? comprometidaPrev : disponible;
      if (!item || fuente.lessThan(cantidad)) {
        throw new StockInsuficienteError(fuente.toString(), cantidad.toString());
      }

      const sku = await tx.sku.findUniqueOrThrow({ where: { id: dto.skuId } });
      const esPromedio = sku.metodoValuacion === METODO_VALUACION.PROMEDIO;

      // Consumir capas FIFO (mantiene la trazabilidad fisica del costo).
      const { costoTotalSalida, consumos } = await this.consumirCapasFifo(
        tx,
        usuario.empresaId,
        dto.skuId,
        dto.almacenId,
        cantidad,
      );

      const costoPromedio = new D(item.costoPromedio);
      // Valuacion de la salida segun metodo (SUNAT Tabla 14).
      const costoUnitSalida = esPromedio
        ? costoPromedio
        : cantidad.isZero()
          ? new D(0)
          : costoTotalSalida.div(cantidad);
      const costoTotalMov = esPromedio ? cantidad.mul(costoPromedio) : costoTotalSalida;

      const nuevaDisponible = dto.desdeReserva ? disponible : disponible.sub(cantidad);
      const nuevaComprometida = dto.desdeReserva
        ? comprometidaPrev.sub(cantidad)
        : comprometidaPrev;
      // El saldo del ledger es el stock FISICO (disponible + comprometido).
      const saldoFisico = nuevaDisponible.add(nuevaComprometida);
      // En promedio movil el costo unitario del saldo no cambia con la salida.
      const nuevoPromedio = esPromedio
        ? costoPromedio
        : await this.promedioDesdeCapas(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const nuevoSaldoValor = saldoFisico.mul(nuevoPromedio);

      const mov = await this.crearMovimiento(tx, {
        usuario,
        item,
        tipo: TIPO_MOVIMIENTO.SALIDA_VENTA,
        signo: SIGNO_MOVIMIENTO.SALIDA,
        cantidad,
        costoUnitario: costoUnitSalida,
        costoTotal: costoTotalMov,
        saldoCantidad: saldoFisico,
        saldoCostoUnitario: nuevoPromedio,
        saldoCostoTotal: nuevoSaldoValor,
        documentoTipo: "VENTA",
        documentoId: dto.documentoId,
        tipoOperacionSunat: TIPO_OPERACION.VENTA,
        tipoDocumentoSunat: dto.tipoDocumentoSunat ?? TIPO_DOCUMENTO.BOLETA_VENTA,
        serieComprobante: dto.serieComprobante,
        numeroComprobante: dto.numeroComprobante,
        fechaEmisionDocumento: dto.fechaEmisionDocumento,
        observaciones: dto.observaciones,
      });

      // Detalle de consumo de capas (auditoria del costeo FIFO).
      for (const c of consumos) {
        await tx.consumoCapa.create({
          data: {
            empresaId: usuario.empresaId,
            movimientoSalidaId: mov.id,
            capaCostoId: c.capaCostoId,
            cantidad: c.cantidad,
            costoUnitario: c.costoUnitario,
          },
        });
      }

      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadDisponible: nuevaDisponible,
          cantidadComprometida: nuevaComprometida,
          costoPromedio: nuevoPromedio,
          version: { increment: 1 },
        },
      });

      return { movimientoId: mov.id, costoSalida: costoTotalMov };
    });

    return {
      movimientoId: resultado.movimientoId.toString(),
      costoSalida: resultado.costoSalida.toString(),
    };
  }

  /**
   * Reserva (compromete) stock: mueve cantidad de disponible a comprometido.
   * NO toca el ledger ni las capas: es un apartado logico, no un movimiento
   * fisico. El stock fisico total no cambia.
   */
  async reservar(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; ubicacionId?: bigint },
  ): Promise<void> {
    const cantidad = new D(dto.cantidad);
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId, dto.ubicacionId);
      const disponible = item ? new D(item.cantidadDisponible) : new D(0);
      if (!item || disponible.lessThan(cantidad)) {
        throw new StockInsuficienteError(disponible.toString(), cantidad.toString());
      }
      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadDisponible: { decrement: cantidad },
          cantidadComprometida: { increment: cantidad },
          version: { increment: 1 },
        },
      });
    });
  }

  /** Libera una reserva: devuelve cantidad de comprometido a disponible. */
  async liberarReserva(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; ubicacionId?: bigint },
  ): Promise<void> {
    const cantidad = new D(dto.cantidad);
    await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId, dto.ubicacionId);
      const comprometida = item ? new D(item.cantidadComprometida) : new D(0);
      if (!item || comprometida.lessThan(cantidad)) {
        throw new StockInsuficienteError(comprometida.toString(), cantidad.toString());
      }
      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadComprometida: { decrement: cantidad },
          cantidadDisponible: { increment: cantidad },
          version: { increment: 1 },
        },
      });
    });
  }

  /**
   * Ajuste de inventario: lleva el stock disponible a una cantidad objetivo
   * (resultado de un conteo fisico). Genera un movimiento de ajuste de entrada
   * o de salida segun la diferencia. Devuelve la diferencia aplicada.
   */
  async ajustar(
    usuario: UsuarioRequest,
    dto: {
      skuId: bigint;
      almacenId: bigint;
      cantidadObjetivo: string;
      ubicacionId?: bigint;
      observaciones?: string;
    },
  ): Promise<{ diferencia: string; movimientoId: string | null }> {
    const objetivo = new D(dto.cantidadObjetivo);

    const resultado = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerOcrearItem(
        tx,
        usuario.empresaId,
        dto.skuId,
        dto.almacenId,
        dto.ubicacionId,
      );
      const disponible = new D(item.cantidadDisponible);
      const comprometida = new D(item.cantidadComprometida);
      const promedio = new D(item.costoPromedio);
      const diferencia = objetivo.sub(disponible);

      if (diferencia.isZero()) {
        return { diferencia: "0", movimientoId: null as bigint | null };
      }

      const esEntrada = diferencia.greaterThan(0);
      const magnitud = diferencia.abs();
      const nuevaDisponible = objetivo;
      const saldoFisico = nuevaDisponible.add(comprometida);
      const costoUnit = promedio;
      const costoTotal = magnitud.mul(costoUnit);

      const mov = await this.crearMovimiento(tx, {
        usuario,
        item,
        tipo: esEntrada ? TIPO_MOVIMIENTO.ENTRADA_AJUSTE : TIPO_MOVIMIENTO.SALIDA_AJUSTE,
        signo: esEntrada ? SIGNO_MOVIMIENTO.ENTRADA : SIGNO_MOVIMIENTO.SALIDA,
        cantidad: magnitud,
        costoUnitario: costoUnit,
        costoTotal,
        saldoCantidad: saldoFisico,
        saldoCostoUnitario: promedio,
        saldoCostoTotal: saldoFisico.mul(promedio),
        documentoTipo: "AJUSTE",
        tipoOperacionSunat: TIPO_OPERACION.OTROS,
        tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
        observaciones: dto.observaciones ?? "Ajuste por conteo fisico",
      });

      if (esEntrada) {
        // El sobrante encontrado entra como una capa al costo promedio vigente.
        await tx.capaCosto.create({
          data: {
            empresaId: usuario.empresaId,
            skuId: dto.skuId,
            almacenId: dto.almacenId,
            movimientoEntradaId: mov.id,
            cantidadInicial: magnitud,
            cantidadRestante: magnitud,
            costoUnitario: costoUnit,
          },
        });
      } else {
        // El faltante consume capas FIFO.
        const { consumos } = await this.consumirCapasFifo(
          tx,
          usuario.empresaId,
          dto.skuId,
          dto.almacenId,
          magnitud,
        );
        for (const c of consumos) {
          await tx.consumoCapa.create({
            data: {
              empresaId: usuario.empresaId,
              movimientoSalidaId: mov.id,
              capaCostoId: c.capaCostoId,
              cantidad: c.cantidad,
              costoUnitario: c.costoUnitario,
            },
          });
        }
      }

      await tx.itemStock.update({
        where: { id: item.id },
        data: { cantidadDisponible: nuevaDisponible, version: { increment: 1 } },
      });

      return { diferencia: diferencia.toString(), movimientoId: mov.id };
    });

    return {
      diferencia: resultado.diferencia,
      movimientoId: resultado.movimientoId ? resultado.movimientoId.toString() : null,
    };
  }

  /**
   * Ajuste manual de inventario por una cantidad relativa (+/-), con motivo.
   * No ingresa costo: usa el costo promedio vigente del sistema.
   */
  async ajusteManual(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; incremento: boolean; cantidad: string; observaciones?: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerOcrearItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      if (dto.incremento) {
        const mov = await this.aplicarEntrada(tx, usuario, item, {
          cantidad,
          costoUnitario: new D(item.costoPromedio),
          tipo: TIPO_MOVIMIENTO.ENTRADA_AJUSTE,
          documentoTipo: "AJUSTE",
          tipoOperacionSunat: TIPO_OPERACION.OTROS,
          observaciones: dto.observaciones ?? "Ajuste (incremento)",
        });
        return mov.id;
      }
      const { mov } = await this.aplicarSalida(tx, usuario, item, {
        cantidad,
        tipo: TIPO_MOVIMIENTO.SALIDA_AJUSTE,
        documentoTipo: "AJUSTE",
        tipoOperacionSunat: TIPO_OPERACION.OTROS,
        observaciones: dto.observaciones ?? "Ajuste (decremento)",
      });
      return mov.id;
    });
    return { movimientoId: id.toString() };
  }

  /** Merma / desmedro: salida de stock sin venta. Costo del sistema. */
  async merma(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; observaciones?: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      if (!item) throw new StockInsuficienteError("0", cantidad.toString());
      const { mov } = await this.aplicarSalida(tx, usuario, item, {
        cantidad,
        tipo: TIPO_MOVIMIENTO.SALIDA_MERMA,
        documentoTipo: "AJUSTE",
        tipoOperacionSunat: TIPO_OPERACION.MERMAS,
        observaciones: dto.observaciones ?? "Merma",
      });
      return mov.id;
    });
    return { movimientoId: id.toString() };
  }

  /**
   * Despacho de traslado: salida del almacen origen (la mercaderia queda en
   * transito). Devuelve el costo unitario usado, para conservarlo en la
   * recepcion. Operacion SUNAT 11 (transferencia).
   */
  async salidaPorTraslado(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; observaciones?: string },
  ): Promise<{ movimientoId: string; costoUnitario: string }> {
    const cantidad = new D(dto.cantidad);
    const resultado = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      if (!item) throw new StockInsuficienteError("0", cantidad.toString());
      const costo = new D(item.costoPromedio);
      const { mov } = await this.aplicarSalida(tx, usuario, item, {
        cantidad,
        tipo: TIPO_MOVIMIENTO.SALIDA_TRANSFERENCIA,
        documentoTipo: "TRANSFERENCIA",
        tipoOperacionSunat: TIPO_OPERACION.TRANSFERENCIA,
        observaciones: dto.observaciones ?? "Despacho de traslado",
      });
      return { movimientoId: mov.id, costoUnitario: costo };
    });
    return {
      movimientoId: resultado.movimientoId.toString(),
      costoUnitario: resultado.costoUnitario.toString(),
    };
  }

  /**
   * Recepcion de traslado: entrada al almacen destino con el costo conservado
   * del despacho. Operacion SUNAT 11 (transferencia).
   */
  async entradaPorTraslado(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; costoUnitario: string; observaciones?: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const costoUnitario = new D(dto.costoUnitario);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerOcrearItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const mov = await this.aplicarEntrada(tx, usuario, item, {
        cantidad,
        costoUnitario,
        tipo: TIPO_MOVIMIENTO.ENTRADA_TRANSFERENCIA,
        documentoTipo: "TRANSFERENCIA",
        tipoOperacionSunat: TIPO_OPERACION.TRANSFERENCIA,
        observaciones: dto.observaciones ?? "Recepción de traslado",
      });
      return mov.id;
    });
    return { movimientoId: id.toString() };
  }

  /**
   * Salida interna por vale de salida (hoja de cargo): consumo a obra, area o
   * centro de costo. Es una SALIDA REAL de stock (no venta, sin precio ni
   * cliente). Consume capas FIFO al costo vigente y enlaza el movimiento al
   * vale via documentoId. Opera DENTRO de la transaccion del despacho: si
   * cualquier linea falla por stock insuficiente, toda la operacion revierte.
   * Operacion SUNAT 12 (retiro / autoconsumo interno).
   */
  async salidaPorVale(
    usuario: UsuarioRequest,
    tx: Tx,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; documentoId: bigint; observaciones?: string },
  ): Promise<{ movimientoId: bigint }> {
    const cantidad = new D(dto.cantidad);
    await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
    const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
    if (!item) throw new StockInsuficienteError("0", cantidad.toString());
    const { mov } = await this.aplicarSalida(tx, usuario, item, {
      cantidad,
      tipo: TIPO_MOVIMIENTO.SALIDA_CONSUMO,
      documentoTipo: "VALE_SALIDA",
      documentoId: dto.documentoId,
      tipoOperacionSunat: TIPO_OPERACION.RETIRO,
      observaciones: dto.observaciones ?? "Salida por vale",
    });
    return { movimientoId: mov.id };
  }

  // --- helpers privados ---

  /** Aplica una ENTRADA (crea capa, recalcula promedio movil, snapshot fisico). */
  private async aplicarEntrada(
    tx: Tx,
    usuario: UsuarioRequest,
    item: ItemStock,
    datos: {
      cantidad: Prisma.Decimal;
      costoUnitario: Prisma.Decimal;
      tipo: string;
      documentoTipo: string;
      tipoOperacionSunat: string;
      observaciones?: string;
    },
  ) {
    const costoTotal = datos.cantidad.mul(datos.costoUnitario);
    const fisicoPrev = new D(item.cantidadDisponible).add(new D(item.cantidadComprometida));
    const valorPrev = fisicoPrev.mul(new D(item.costoPromedio));
    const nuevaDisponible = new D(item.cantidadDisponible).add(datos.cantidad);
    const nuevoFisico = fisicoPrev.add(datos.cantidad);
    const nuevoValor = valorPrev.add(costoTotal);
    const nuevoPromedio = nuevoFisico.isZero() ? new D(0) : nuevoValor.div(nuevoFisico);

    const mov = await this.crearMovimiento(tx, {
      usuario,
      item,
      tipo: datos.tipo,
      signo: SIGNO_MOVIMIENTO.ENTRADA,
      cantidad: datos.cantidad,
      costoUnitario: datos.costoUnitario,
      costoTotal,
      saldoCantidad: nuevoFisico,
      saldoCostoUnitario: nuevoPromedio,
      saldoCostoTotal: nuevoValor,
      documentoTipo: datos.documentoTipo,
      tipoOperacionSunat: datos.tipoOperacionSunat,
      tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
      observaciones: datos.observaciones,
    });

    await tx.capaCosto.create({
      data: {
        empresaId: usuario.empresaId,
        skuId: item.skuId,
        almacenId: item.almacenId,
        movimientoEntradaId: mov.id,
        cantidadInicial: datos.cantidad,
        cantidadRestante: datos.cantidad,
        costoUnitario: datos.costoUnitario,
      },
    });
    await tx.itemStock.update({
      where: { id: item.id },
      data: { cantidadDisponible: nuevaDisponible, costoPromedio: nuevoPromedio, version: { increment: 1 } },
    });
    return mov;
  }

  /** Aplica una SALIDA (valida disponible, consume capas FIFO, snapshot fisico). */
  private async aplicarSalida(
    tx: Tx,
    usuario: UsuarioRequest,
    item: ItemStock,
    datos: {
      cantidad: Prisma.Decimal;
      tipo: string;
      documentoTipo: string;
      documentoId?: bigint;
      tipoOperacionSunat: string;
      observaciones?: string;
    },
  ) {
    const disponible = new D(item.cantidadDisponible);
    if (disponible.lessThan(datos.cantidad)) {
      throw new StockInsuficienteError(disponible.toString(), datos.cantidad.toString());
    }
    const promedio = new D(item.costoPromedio);
    const comprometida = new D(item.cantidadComprometida);
    const { consumos } = await this.consumirCapasFifo(
      tx,
      usuario.empresaId,
      item.skuId,
      item.almacenId,
      datos.cantidad,
    );
    const nuevaDisponible = disponible.sub(datos.cantidad);
    const saldoFisico = nuevaDisponible.add(comprometida);
    const costoTotal = datos.cantidad.mul(promedio);

    const mov = await this.crearMovimiento(tx, {
      usuario,
      item,
      tipo: datos.tipo,
      signo: SIGNO_MOVIMIENTO.SALIDA,
      cantidad: datos.cantidad,
      costoUnitario: promedio,
      costoTotal,
      saldoCantidad: saldoFisico,
      saldoCostoUnitario: promedio,
      saldoCostoTotal: saldoFisico.mul(promedio),
      documentoTipo: datos.documentoTipo,
      documentoId: datos.documentoId,
      tipoOperacionSunat: datos.tipoOperacionSunat,
      tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
      observaciones: datos.observaciones,
    });
    for (const c of consumos) {
      await tx.consumoCapa.create({
        data: {
          empresaId: usuario.empresaId,
          movimientoSalidaId: mov.id,
          capaCostoId: c.capaCostoId,
          cantidad: c.cantidad,
          costoUnitario: c.costoUnitario,
        },
      });
    }
    await tx.itemStock.update({
      where: { id: item.id },
      data: { cantidadDisponible: nuevaDisponible, version: { increment: 1 } },
    });
    return { mov, costoTotal };
  }

  /** Serializa los movimientos del mismo sku+almacen sin bloquear filas. */
  private async bloquear(
    tx: Tx,
    empresaId: bigint,
    skuId: bigint,
    almacenId: bigint,
  ): Promise<void> {
    const clave = `${empresaId}:${skuId}:${almacenId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
  }

  private async obtenerItem(
    tx: Tx,
    empresaId: bigint,
    skuId: bigint,
    almacenId: bigint,
    ubicacionId?: bigint,
  ): Promise<ItemStock | null> {
    return tx.itemStock.findFirst({
      where: {
        empresaId,
        skuId,
        almacenId,
        ubicacionId: ubicacionId ?? null,
        loteId: null,
        serie: null,
      },
    });
  }

  private async obtenerOcrearItem(
    tx: Tx,
    empresaId: bigint,
    skuId: bigint,
    almacenId: bigint,
    ubicacionId?: bigint,
  ): Promise<ItemStock> {
    const existente = await this.obtenerItem(tx, empresaId, skuId, almacenId, ubicacionId);
    if (existente) return existente;
    return tx.itemStock.create({
      data: { empresaId, skuId, almacenId, ubicacionId: ubicacionId ?? null },
    });
  }

  /** Consume capas FIFO (mas antiguas primero); devuelve costo total y consumos. */
  private async consumirCapasFifo(
    tx: Tx,
    empresaId: bigint,
    skuId: bigint,
    almacenId: bigint,
    cantidad: Prisma.Decimal,
  ): Promise<{ costoTotalSalida: Prisma.Decimal; consumos: ConsumoCapaTmp[] }> {
    const capas = await tx.capaCosto.findMany({
      where: { empresaId, skuId, almacenId, agotada: false },
      orderBy: [{ fechaIngreso: "asc" }, { id: "asc" }],
    });

    let restante = cantidad;
    let costoTotal = new D(0);
    const consumos: ConsumoCapaTmp[] = [];
    for (const capa of capas) {
      if (restante.lessThanOrEqualTo(0)) break;
      const enCapa = new D(capa.cantidadRestante);
      const toma = D.min(restante, enCapa);
      const costoUnit = new D(capa.costoUnitario);
      costoTotal = costoTotal.add(toma.mul(costoUnit));
      const quedaEnCapa = enCapa.sub(toma);
      await tx.capaCosto.update({
        where: { id: capa.id },
        data: { cantidadRestante: quedaEnCapa, agotada: quedaEnCapa.isZero() },
      });
      consumos.push({ capaCostoId: capa.id, cantidad: toma, costoUnitario: costoUnit });
      restante = restante.sub(toma);
    }

    if (restante.greaterThan(0)) {
      throw new InconsistenciaCapasError();
    }
    return { costoTotalSalida: costoTotal, consumos };
  }

  /** Recalcula el costo promedio a partir de las capas restantes (valuacion FIFO). */
  private async promedioDesdeCapas(
    tx: Tx,
    empresaId: bigint,
    skuId: bigint,
    almacenId: bigint,
  ): Promise<Prisma.Decimal> {
    const capas = await tx.capaCosto.findMany({
      where: { empresaId, skuId, almacenId, agotada: false },
    });
    let cant = new D(0);
    let valor = new D(0);
    for (const capa of capas) {
      const c = new D(capa.cantidadRestante);
      cant = cant.add(c);
      valor = valor.add(c.mul(new D(capa.costoUnitario)));
    }
    return cant.isZero() ? new D(0) : valor.div(cant);
  }

  private async crearMovimiento(tx: Tx, datos: DatosMovimiento) {
    const ahora = new Date();
    // El periodo SUNAT se rige por la fecha de emision del documento cuando se
    // provee; si no, por la fecha del movimiento (comportamiento actual).
    const fechaEmision = datos.fechaEmisionDocumento ?? ahora;
    const periodo = this.periodoDe(fechaEmision);
    const secuencia = await this.siguienteSecuencia(tx);

    return tx.movimientoStock.create({
      data: {
        empresaId: datos.usuario.empresaId,
        skuId: datos.item.skuId,
        almacenId: datos.item.almacenId,
        itemStockId: datos.item.id,
        tipo: datos.tipo as never,
        signo: datos.signo as never,
        cantidad: datos.cantidad,
        costoUnitario: datos.costoUnitario,
        costoTotal: datos.costoTotal,
        saldoCantidad: datos.saldoCantidad,
        saldoCostoUnitario: datos.saldoCostoUnitario,
        saldoCostoTotal: datos.saldoCostoTotal,
        documentoTipo: datos.documentoTipo as never,
        documentoId: datos.documentoId ?? null,
        periodo,
        fechaEmisionDocumento: fechaEmision,
        cuo: secuencia.toString(),
        numeroCorrelativo: `A${secuencia}`,
        secuencia,
        tipoDocumentoSunat: datos.tipoDocumentoSunat,
        serieComprobante: datos.serieComprobante ?? "0",
        numeroComprobante: datos.numeroComprobante ?? "0",
        tipoOperacionSunat: datos.tipoOperacionSunat,
        usuarioId: datos.usuario.id,
        fechaMovimiento: ahora,
        observaciones: datos.observaciones ?? null,
      },
    });
  }

  private periodoDe(fecha: Date): string {
    const anio = fecha.getFullYear().toString();
    const mes = (fecha.getMonth() + 1).toString().padStart(2, "0");
    return `${anio}${mes}`;
  }

  /** Secuencia global monotonica para desempatar el orden del kardex. */
  private async siguienteSecuencia(tx: Tx): Promise<bigint> {
    const filas = await tx.$queryRaw<Array<{ valor: bigint }>>`
      SELECT nextval('movimiento_secuencia') AS valor
    `;
    return filas[0]!.valor;
  }
}
