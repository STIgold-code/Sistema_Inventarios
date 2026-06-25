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
import { AuditoriaService } from "../../auditoria/auditoria.service.js";
import { TiposCambioService } from "../../tipos-cambio/tipos-cambio.service.js";
import {
  InconsistenciaCapasError,
  PeriodoCerradoError,
  PertenenciaInvalidaError,
  SerieInvalidaError,
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
  /** Numeros de serie a registrar (obligatorio si el SKU controla serie). */
  numerosSerie?: string[];
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
  /** Numeros de serie a despachar (obligatorio si el SKU controla serie). */
  numerosSerie?: string[];
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiposCambio: TiposCambioService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Tipo de cambio "venta" del dia de la fecha dada, o null si no hay TC cargado.
   * La valuacion en USD del kardex usa la cotizacion VENTA (criterio contable
   * para convertir costos de adquisicion). Es la unica lectura de TC del motor.
   */
  private async tcVentaDe(
    tx: Tx,
    empresaId: bigint,
    fecha: Date,
  ): Promise<Prisma.Decimal | null> {
    const registro = await this.tiposCambio.obtenerPorFecha(tx, empresaId, fecha);
    if (!registro) return null;
    const venta = new D(registro.venta);
    return venta.isZero() ? null : venta;
  }

  /**
   * Entrada por compra: crea una capa de costo y recalcula el promedio movil.
   * Abre su propia transaccion (uso directo). Cuando forma parte de una recepcion
   * multi-linea, el caller debe usar {@link recibirCompraEnTx} para que todas las
   * lineas compartan UNA transaccion y la atomicidad sea real.
   */
  async recibirCompra(
    usuario: UsuarioRequest,
    dto: EntradaCompra,
  ): Promise<{ movimientoId: string }> {
    const movimientoId = await this.prisma.$transaction((tx) =>
      this.recibirCompraEnTx(usuario, tx, dto),
    );
    return { movimientoId: movimientoId.toString() };
  }

  /**
   * Igual que {@link recibirCompra} pero opera DENTRO de la transaccion del
   * caller: el advisory lock se toma sobre `tx` y nada se commitea por linea. Si
   * cualquier linea posterior del documento falla, toda la operacion revierte.
   */
  async recibirCompraEnTx(
    usuario: UsuarioRequest,
    tx: Tx,
    dto: EntradaCompra,
  ): Promise<bigint> {
    const cantidad = new D(dto.cantidad);
    const costoUnitario = new D(dto.costoUnitario);
    const costoTotal = cantidad.mul(costoUnitario);

    {
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
          costoUnitarioUsd: mov.costoUnitarioUsd,
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

      // Trazabilidad por serie: registra una serie por cada unidad ingresada.
      await this.registrarSeriesEntrada(tx, usuario.empresaId, {
        skuId: dto.skuId,
        almacenId: dto.almacenId,
        cantidad,
        movimientoEntradaId: mov.id,
        numerosSerie: dto.numerosSerie,
      });

      return mov.id;
    }
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
          costoUnitarioUsd: mov.costoUnitarioUsd,
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
   * Salida por venta: valida disponibilidad, consume capas FIFO y descuenta.
   * Abre su propia transaccion (uso directo). En un despacho multi-linea el
   * caller debe usar {@link registrarSalidaVentaEnTx} para garantizar atomicidad.
   */
  async registrarSalidaVenta(
    usuario: UsuarioRequest,
    dto: SalidaVenta,
  ): Promise<{ movimientoId: string; costoSalida: string }> {
    const resultado = await this.prisma.$transaction((tx) =>
      this.registrarSalidaVentaEnTx(usuario, tx, dto),
    );
    return {
      movimientoId: resultado.movimientoId.toString(),
      costoSalida: resultado.costoSalida.toString(),
    };
  }

  /**
   * Igual que {@link registrarSalidaVenta} pero opera DENTRO de la transaccion
   * del caller: advisory lock sobre `tx`, sin commits por linea. Si cualquier
   * linea posterior del despacho falla, toda la operacion revierte.
   */
  async registrarSalidaVentaEnTx(
    usuario: UsuarioRequest,
    tx: Tx,
    dto: SalidaVenta,
  ): Promise<{ movimientoId: bigint; costoSalida: Prisma.Decimal }> {
    const cantidad = new D(dto.cantidad);

    {
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

      // Trazabilidad por serie: marca como DESPACHADO las series que salen.
      await this.marcarSeriesSalida(tx, usuario.empresaId, {
        skuId: dto.skuId,
        almacenId: dto.almacenId,
        cantidad,
        movimientoSalidaId: mov.id,
        numerosSerie: dto.numerosSerie,
      });

      return { movimientoId: mov.id, costoSalida: costoTotalMov };
    }
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
            costoUnitarioUsd: mov.costoUnitarioUsd,
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
      const mov = dto.incremento
        ? await this.aplicarEntrada(tx, usuario, item, {
            cantidad,
            costoUnitario: new D(item.costoPromedio),
            tipo: TIPO_MOVIMIENTO.ENTRADA_AJUSTE,
            documentoTipo: "AJUSTE",
            tipoOperacionSunat: TIPO_OPERACION.OTROS,
            observaciones: dto.observaciones ?? "Ajuste (incremento)",
          })
        : (
            await this.aplicarSalida(tx, usuario, item, {
              cantidad,
              tipo: TIPO_MOVIMIENTO.SALIDA_AJUSTE,
              documentoTipo: "AJUSTE",
              tipoOperacionSunat: TIPO_OPERACION.OTROS,
              observaciones: dto.observaciones ?? "Ajuste (decremento)",
            })
          ).mov;
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "AJUSTE_MANUAL",
          entidad: "MOVIMIENTO",
          entidadId: mov.id,
          detalle: `Ajuste manual ${dto.incremento ? "(incremento)" : "(decremento)"} de ${cantidad.toString()} unidades`,
        },
        tx,
      );
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
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "MERMA",
          entidad: "MOVIMIENTO",
          entidadId: mov.id,
          detalle: `Merma de ${cantidad.toString()} unidades`,
        },
        tx,
      );
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
    const resultado = await this.prisma.$transaction((tx) =>
      this.salidaPorTrasladoEnTx(usuario, tx, dto),
    );
    return {
      movimientoId: resultado.movimientoId.toString(),
      costoUnitario: resultado.costoUnitario.toString(),
    };
  }

  /**
   * Igual que {@link salidaPorTraslado} pero opera DENTRO de la transaccion del
   * caller: el despacho multi-linea de un traslado comparte UNA transaccion.
   */
  async salidaPorTrasladoEnTx(
    usuario: UsuarioRequest,
    tx: Tx,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; observaciones?: string },
  ): Promise<{ movimientoId: bigint; costoUnitario: Prisma.Decimal }> {
    const cantidad = new D(dto.cantidad);
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
  }

  /**
   * Recepcion de traslado: entrada al almacen destino con el costo conservado
   * del despacho. Operacion SUNAT 11 (transferencia).
   */
  async entradaPorTraslado(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; costoUnitario: string; observaciones?: string },
  ): Promise<{ movimientoId: string }> {
    const id = await this.prisma.$transaction((tx) =>
      this.entradaPorTrasladoEnTx(usuario, tx, dto),
    );
    return { movimientoId: id.toString() };
  }

  /**
   * Igual que {@link entradaPorTraslado} pero opera DENTRO de la transaccion del
   * caller: la recepcion multi-linea de un traslado comparte UNA transaccion.
   */
  async entradaPorTrasladoEnTx(
    usuario: UsuarioRequest,
    tx: Tx,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; costoUnitario: string; observaciones?: string },
  ): Promise<bigint> {
    const cantidad = new D(dto.cantidad);
    const costoUnitario = new D(dto.costoUnitario);
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
    dto: {
      skuId: bigint;
      almacenId: bigint;
      cantidad: string;
      documentoId: bigint;
      observaciones?: string;
      numerosSerie?: string[];
    },
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
    await this.marcarSeriesSalida(tx, usuario.empresaId, {
      skuId: dto.skuId,
      almacenId: dto.almacenId,
      cantidad,
      movimientoSalidaId: mov.id,
      numerosSerie: dto.numerosSerie,
    });
    return { movimientoId: mov.id };
  }

  /**
   * Entrada por devolucion de venta (reverso de despacho): reingresa stock al
   * almacen. El costo basis es, preferentemente, el costo con que el stock SALIO
   * en el despacho original (dto.costoUnitario); asi el reingreso no corrompe el
   * costo promedio movil del item si el costo cambio entre venta y devolucion. Si
   * no se provee (datos viejos sin costo de despacho registrado), cae al costo
   * promedio vigente del item. El ledger es inmutable: esto es un movimiento
   * NUEVO, nunca un borrado del original. Crea una capa de costo nueva (FIFO).
   * Opera DENTRO de la transaccion de la devolucion: si cualquier linea falla,
   * toda la operacion revierte. Operacion SUNAT 05 (devolucion recibida).
   * Devuelve el costo unitario usado.
   */
  async entradaPorDevolucion(
    usuario: UsuarioRequest,
    tx: Tx,
    dto: {
      skuId: bigint;
      almacenId: bigint;
      cantidad: string;
      documentoId: bigint;
      costoUnitario?: string;
      fechaEmisionDocumento?: Date;
      observaciones?: string;
      numerosSerie?: string[];
    },
  ): Promise<{ movimientoId: bigint; costoUnitario: Prisma.Decimal }> {
    const cantidad = new D(dto.cantidad);
    await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
    const item = await this.obtenerOcrearItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
    const costoUnitario =
      dto.costoUnitario !== undefined ? new D(dto.costoUnitario) : new D(item.costoPromedio);
    const mov = await this.aplicarEntrada(tx, usuario, item, {
      cantidad,
      costoUnitario,
      tipo: TIPO_MOVIMIENTO.ENTRADA_DEVOLUCION,
      documentoTipo: "DEVOLUCION_VENTA",
      documentoId: dto.documentoId,
      tipoOperacionSunat: TIPO_OPERACION.DEVOLUCION_RECIBIDA,
      fechaEmisionDocumento: dto.fechaEmisionDocumento,
      observaciones: dto.observaciones ?? "Devolucion de venta",
    });
    await this.reingresarSeriesDevolucion(tx, usuario.empresaId, {
      skuId: dto.skuId,
      almacenId: dto.almacenId,
      cantidad,
      movimientoEntradaId: mov.id,
      numerosSerie: dto.numerosSerie,
    });
    return { movimientoId: mov.id, costoUnitario };
  }

  /**
   * Marca stock como DETERIORADO: mueve cantidad de cantidadDisponible ->
   * cantidadDeteriorada. Es la MISMA existencia cambiando de condicion, no una
   * salida fisica: NO consume capas FIFO, NO cambia el costo promedio y el stock
   * fisico total (disponible + comprometida + deteriorada) NO cambia. Registra
   * un movimiento DETERIORO en el ledger inmutable para trazabilidad. El stock
   * deteriorado queda excluido de ventas/consumos porque esos flujos solo leen
   * cantidadDisponible.
   */
  async marcarDeteriorado(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; motivo: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const disponible = item ? new D(item.cantidadDisponible) : new D(0);
      if (!item || disponible.lessThan(cantidad)) {
        throw new StockInsuficienteError(disponible.toString(), cantidad.toString());
      }
      const mov = await this.crearMovimientoCondicion(tx, usuario, item, {
        cantidad,
        tipo: TIPO_MOVIMIENTO.DETERIORO,
        signo: SIGNO_MOVIMIENTO.SALIDA,
        tipoOperacionSunat: TIPO_OPERACION.OTROS,
        observaciones: dto.motivo,
      });
      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadDisponible: { decrement: cantidad },
          cantidadDeteriorada: { increment: cantidad },
          version: { increment: 1 },
        },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "MARCAR_DETERIORADO",
          entidad: "MOVIMIENTO",
          entidadId: mov.id,
          detalle: `${cantidad.toString()} unidades marcadas como deterioradas: ${dto.motivo}`,
        },
        tx,
      );
      return mov.id;
    });
    return { movimientoId: id.toString() };
  }

  /**
   * Recupera stock deteriorado (reparado / revisado): mueve cantidad de
   * cantidadDeteriorada -> cantidadDisponible. Reverso de marcarDeteriorado: no
   * toca capas ni costo, el fisico total no cambia. Registra RECUPERACION.
   */
  async recuperarDeteriorado(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; motivo: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const deteriorada = item ? new D(item.cantidadDeteriorada) : new D(0);
      if (!item || deteriorada.lessThan(cantidad)) {
        throw new StockInsuficienteError(deteriorada.toString(), cantidad.toString());
      }
      const mov = await this.crearMovimientoCondicion(tx, usuario, item, {
        cantidad,
        tipo: TIPO_MOVIMIENTO.RECUPERACION,
        signo: SIGNO_MOVIMIENTO.ENTRADA,
        tipoOperacionSunat: TIPO_OPERACION.OTROS,
        observaciones: dto.motivo,
      });
      await tx.itemStock.update({
        where: { id: item.id },
        data: {
          cantidadDeteriorada: { decrement: cantidad },
          cantidadDisponible: { increment: cantidad },
          version: { increment: 1 },
        },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "RECUPERAR_DETERIORADO",
          entidad: "MOVIMIENTO",
          entidadId: mov.id,
          detalle: `${cantidad.toString()} unidades recuperadas de deterioro: ${dto.motivo}`,
        },
        tx,
      );
      return mov.id;
    });
    return { movimientoId: id.toString() };
  }

  /**
   * Da de baja stock deteriorado: lo retira del sistema (como una merma, pero
   * desde la condicion deteriorada). Es una SALIDA FISICA real: consume capas
   * FIFO al costo vigente, descuenta cantidadDeteriorada y reduce el stock
   * fisico total. Operacion SUNAT 14 (desmedros). Registra BAJA_DETERIORO.
   */
  async darDeBajaDeteriorado(
    usuario: UsuarioRequest,
    dto: { skuId: bigint; almacenId: bigint; cantidad: string; motivo: string },
  ): Promise<{ movimientoId: string }> {
    const cantidad = new D(dto.cantidad);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.bloquear(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const item = await this.obtenerItem(tx, usuario.empresaId, dto.skuId, dto.almacenId);
      const deteriorada = item ? new D(item.cantidadDeteriorada) : new D(0);
      if (!item || deteriorada.lessThan(cantidad)) {
        throw new StockInsuficienteError(deteriorada.toString(), cantidad.toString());
      }

      const promedio = new D(item.costoPromedio);
      const disponible = new D(item.cantidadDisponible);
      const comprometida = new D(item.cantidadComprometida);
      const { consumos } = await this.consumirCapasFifo(
        tx,
        usuario.empresaId,
        item.skuId,
        item.almacenId,
        cantidad,
      );
      const nuevaDeteriorada = deteriorada.sub(cantidad);
      // El saldo del ledger es el stock FISICO (disponible + comprometida + deteriorada).
      const saldoFisico = disponible.add(comprometida).add(nuevaDeteriorada);
      const costoTotal = cantidad.mul(promedio);

      const mov = await this.crearMovimiento(tx, {
        usuario,
        item,
        tipo: TIPO_MOVIMIENTO.BAJA_DETERIORO,
        signo: SIGNO_MOVIMIENTO.SALIDA,
        cantidad,
        costoUnitario: promedio,
        costoTotal,
        saldoCantidad: saldoFisico,
        saldoCostoUnitario: promedio,
        saldoCostoTotal: saldoFisico.mul(promedio),
        documentoTipo: "AJUSTE",
        tipoOperacionSunat: TIPO_OPERACION.DESMEDROS,
        tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
        observaciones: dto.motivo,
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
        data: { cantidadDeteriorada: nuevaDeteriorada, version: { increment: 1 } },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "BAJA_DETERIORADO",
          entidad: "MOVIMIENTO",
          entidadId: mov.id,
          detalle: `Baja de ${cantidad.toString()} unidades deterioradas: ${dto.motivo}`,
        },
        tx,
      );
      return mov.id;
    });
    return { movimientoId: id.toString() };
  }

  /**
   * Crea el movimiento de un CAMBIO DE CONDICION (DETERIORO / RECUPERACION).
   * El stock fisico total no cambia, por lo que el snapshot de saldo (cantidad,
   * costo unitario y costo total) refleja el fisico vigente SIN alterarlo, y el
   * costo unitario del movimiento es el promedio vigente (la existencia conserva
   * su costo). No consume ni crea capas.
   */
  private async crearMovimientoCondicion(
    tx: Tx,
    usuario: UsuarioRequest,
    item: ItemStock,
    datos: {
      cantidad: Prisma.Decimal;
      tipo: string;
      signo: string;
      tipoOperacionSunat: string;
      observaciones: string;
    },
  ) {
    const promedio = new D(item.costoPromedio);
    const fisico = new D(item.cantidadDisponible)
      .add(new D(item.cantidadComprometida))
      .add(new D(item.cantidadDeteriorada));
    return this.crearMovimiento(tx, {
      usuario,
      item,
      tipo: datos.tipo,
      signo: datos.signo,
      cantidad: datos.cantidad,
      costoUnitario: promedio,
      costoTotal: datos.cantidad.mul(promedio),
      saldoCantidad: fisico,
      saldoCostoUnitario: promedio,
      saldoCostoTotal: fisico.mul(promedio),
      documentoTipo: "AJUSTE",
      tipoOperacionSunat: datos.tipoOperacionSunat,
      tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
      observaciones: datos.observaciones,
    });
  }

  // --- trazabilidad por serie ---

  /**
   * Registra los numeros de serie de una ENTRADA cuando el SKU controla serie.
   * Cada serie nace DISPONIBLE, enlazada al movimiento de entrada y al almacen.
   * Reglas: la cantidad de series debe igualar la cantidad ingresada (enteros);
   * no se admiten series duplicadas en el lote ni ya existentes para el SKU.
   * Si el SKU NO controla serie, no debe llegar lista de series.
   */
  private async registrarSeriesEntrada(
    tx: Tx,
    empresaId: bigint,
    datos: {
      skuId: bigint;
      almacenId: bigint;
      cantidad: Prisma.Decimal;
      movimientoEntradaId: bigint;
      numerosSerie?: string[];
    },
  ): Promise<void> {
    const sku = await tx.sku.findUniqueOrThrow({
      where: { id: datos.skuId },
      select: { controlaSerie: true },
    });
    const series = this.normalizarSeries(datos.numerosSerie);

    if (!sku.controlaSerie) {
      if (series.length > 0) {
        throw new SerieInvalidaError(
          "El SKU no controla numero de serie; no se deben enviar series.",
        );
      }
      return;
    }

    this.exigirSeriesCoincidenConCantidad(series, datos.cantidad);

    const existentes = await tx.serieArticulo.findMany({
      where: { empresaId, skuId: datos.skuId, numeroSerie: { in: series } },
      select: { numeroSerie: true },
    });
    if (existentes.length > 0) {
      throw new SerieInvalidaError(
        `Ya existen series registradas para este SKU: ${existentes
          .map((s) => s.numeroSerie)
          .join(", ")}`,
      );
    }

    await tx.serieArticulo.createMany({
      data: series.map((numeroSerie) => ({
        empresaId,
        skuId: datos.skuId,
        numeroSerie,
        almacenId: datos.almacenId,
        estado: "DISPONIBLE" as const,
        movimientoEntradaId: datos.movimientoEntradaId,
      })),
    });
  }

  /**
   * Marca como DESPACHADO los numeros de serie de una SALIDA cuando el SKU
   * controla serie. Las series deben existir, estar DISPONIBLE y pertenecer al
   * almacen de salida. La cantidad de series debe igualar la cantidad de salida.
   */
  private async marcarSeriesSalida(
    tx: Tx,
    empresaId: bigint,
    datos: {
      skuId: bigint;
      almacenId: bigint;
      cantidad: Prisma.Decimal;
      movimientoSalidaId: bigint;
      numerosSerie?: string[];
    },
  ): Promise<void> {
    const sku = await tx.sku.findUniqueOrThrow({
      where: { id: datos.skuId },
      select: { controlaSerie: true },
    });
    const series = this.normalizarSeries(datos.numerosSerie);

    if (!sku.controlaSerie) {
      if (series.length > 0) {
        throw new SerieInvalidaError(
          "El SKU no controla numero de serie; no se deben enviar series.",
        );
      }
      return;
    }

    this.exigirSeriesCoincidenConCantidad(series, datos.cantidad);

    const registros = await tx.serieArticulo.findMany({
      where: { empresaId, skuId: datos.skuId, numeroSerie: { in: series } },
    });
    const porNumero = new Map(registros.map((r) => [r.numeroSerie, r]));

    for (const numeroSerie of series) {
      const registro = porNumero.get(numeroSerie);
      if (!registro) {
        throw new SerieInvalidaError(`La serie ${numeroSerie} no existe para este SKU.`);
      }
      if (registro.estado !== "DISPONIBLE") {
        throw new SerieInvalidaError(`La serie ${numeroSerie} ya fue despachada.`);
      }
      if (registro.almacenId !== datos.almacenId) {
        throw new SerieInvalidaError(
          `La serie ${numeroSerie} no pertenece al almacen de salida.`,
        );
      }
    }

    await tx.serieArticulo.updateMany({
      where: { empresaId, skuId: datos.skuId, numeroSerie: { in: series } },
      data: {
        estado: "DESPACHADO",
        movimientoSalidaId: datos.movimientoSalidaId,
      },
    });
  }

  /**
   * Reingresa numeros de serie en una DEVOLUCION cuando el SKU controla serie.
   * Las series deben existir, estar DESPACHADO y pertenecer al SKU. Vuelven a
   * DISPONIBLE en el almacen de reingreso y se reenlazan al movimiento de
   * entrada de la devolucion. La cantidad de series debe igualar la cantidad.
   */
  private async reingresarSeriesDevolucion(
    tx: Tx,
    empresaId: bigint,
    datos: {
      skuId: bigint;
      almacenId: bigint;
      cantidad: Prisma.Decimal;
      movimientoEntradaId: bigint;
      numerosSerie?: string[];
    },
  ): Promise<void> {
    const sku = await tx.sku.findUniqueOrThrow({
      where: { id: datos.skuId },
      select: { controlaSerie: true },
    });
    const series = this.normalizarSeries(datos.numerosSerie);

    if (!sku.controlaSerie) {
      if (series.length > 0) {
        throw new SerieInvalidaError(
          "El SKU no controla numero de serie; no se deben enviar series.",
        );
      }
      return;
    }

    this.exigirSeriesCoincidenConCantidad(series, datos.cantidad);

    const registros = await tx.serieArticulo.findMany({
      where: { empresaId, skuId: datos.skuId, numeroSerie: { in: series } },
    });
    const porNumero = new Map(registros.map((r) => [r.numeroSerie, r]));

    for (const numeroSerie of series) {
      const registro = porNumero.get(numeroSerie);
      if (!registro) {
        throw new SerieInvalidaError(`La serie ${numeroSerie} no existe para este SKU.`);
      }
      if (registro.estado !== "DESPACHADO") {
        throw new SerieInvalidaError(
          `La serie ${numeroSerie} no esta despachada; no se puede devolver.`,
        );
      }
    }

    await tx.serieArticulo.updateMany({
      where: { empresaId, skuId: datos.skuId, numeroSerie: { in: series } },
      data: {
        estado: "DISPONIBLE",
        almacenId: datos.almacenId,
        movimientoEntradaId: datos.movimientoEntradaId,
        movimientoSalidaId: null,
      },
    });
  }

  /** Limpia, deduplica deteccion y descarta vacios de la lista de series. */
  private normalizarSeries(numerosSerie?: string[]): string[] {
    if (!numerosSerie) return [];
    const limpias = numerosSerie.map((s) => s.trim()).filter((s) => s.length > 0);
    const unicas = new Set(limpias);
    if (unicas.size !== limpias.length) {
      throw new SerieInvalidaError("Hay numeros de serie duplicados en la captura.");
    }
    return limpias;
  }

  /** La cantidad de series debe igualar la cantidad (entera) del movimiento. */
  private exigirSeriesCoincidenConCantidad(
    series: string[],
    cantidad: Prisma.Decimal,
  ): void {
    if (!cantidad.equals(cantidad.trunc())) {
      throw new SerieInvalidaError(
        "Un articulo serializado solo admite cantidades enteras.",
      );
    }
    const esperadas = cantidad.toNumber();
    if (series.length !== esperadas) {
      throw new SerieInvalidaError(
        `Se requieren ${esperadas} numeros de serie y se recibieron ${series.length}.`,
      );
    }
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
      documentoId?: bigint;
      tipoOperacionSunat: string;
      fechaEmisionDocumento?: Date;
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
      documentoId: datos.documentoId,
      tipoOperacionSunat: datos.tipoOperacionSunat,
      tipoDocumentoSunat: TIPO_DOCUMENTO.OTROS,
      fechaEmisionDocumento: datos.fechaEmisionDocumento,
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
        costoUnitarioUsd: mov.costoUnitarioUsd,
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

  /**
   * Toma, desde un caller externo, el mismo lock de serializacion por posicion
   * (empresa:sku:almacen) que usan los movimientos internos. Util para cerrar
   * un TOCTOU cuando hay que leer un tope que depende del stock/movimientos
   * ANTES de generar el asiento (el advisory lock es re-entrante dentro de la
   * misma transaccion). Tomar las posiciones ordenadas para evitar deadlock.
   */
  async bloquearPosicion(
    tx: Tx,
    empresaId: bigint,
    skuId: bigint,
    almacenId: bigint,
  ): Promise<void> {
    await this.bloquear(tx, empresaId, skuId, almacenId);
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

    // Defensa en profundidad (anti-IDOR): antes de materializar un item nuevo en
    // el ledger, el SKU y el almacen deben pertenecer a la empresa. Los flujos
    // validos (compra, traslado, inicial, etc.) ya pasan ids validados, asi que
    // esta consulta scoped por empresaId resuelve para ellos y solo bloquea fugas.
    const [skuValido, almacenValido] = await Promise.all([
      tx.sku.findFirst({ where: { id: skuId, empresaId }, select: { id: true } }),
      tx.almacen.findFirst({ where: { id: almacenId, empresaId }, select: { id: true } }),
    ]);
    if (!skuValido) {
      throw new PertenenciaInvalidaError(`el SKU ${skuId} no pertenece a la empresa`);
    }
    if (!almacenValido) {
      throw new PertenenciaInvalidaError(`el almacen ${almacenId} no pertenece a la empresa`);
    }

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
    // El periodo del movimiento no puede estar contablemente cerrado.
    await this.exigirPeriodoAbierto(tx, datos.usuario.empresaId, periodo);
    const secuencia = await this.siguienteSecuencia(tx);

    // Valuacion bimoneda: si hay TC del dia, deriva el costo en USD del costo
    // en soles. Si no hay TC, queda null sin afectar el costeo en soles.
    const tc = await this.tcVentaDe(tx, datos.usuario.empresaId, fechaEmision);
    const costoUnitarioUsd = tc ? datos.costoUnitario.div(tc) : null;
    const costoTotalUsd = tc ? datos.costoTotal.div(tc) : null;

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
        costoUnitarioUsd,
        costoTotalUsd,
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

  /** Lanza si el periodo (AAAAMM) esta cerrado para la empresa. */
  private async exigirPeriodoAbierto(
    tx: Tx,
    empresaId: bigint,
    periodo: string,
  ): Promise<void> {
    const cierre = await tx.cierrePeriodo.findUnique({
      where: { empresaId_periodo: { empresaId, periodo } },
      select: { estado: true },
    });
    if (cierre?.estado === "CERRADO") {
      throw new PeriodoCerradoError(periodo);
    }
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
