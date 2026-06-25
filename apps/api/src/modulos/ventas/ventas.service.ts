import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";
import {
  aUnidadDeControl,
  precioAUnidadDeControl,
} from "../comun/conversion/conversion-unidad.js";

const D = Prisma.Decimal;

/** Tasa de IGV vigente en Peru (18%). */
const IGV_TASA = new D("0.18");

/** Tolerancia (en moneda) para conciliar los montos del comprobante. */
const TOLERANCIA_CONCILIACION = new D("0.50");

interface NuevaOrdenVenta {
  almacenId: bigint;
  numero: string;
  clienteId?: bigint;
  cliente?: string;
  moneda?: string;
  tipoCambio?: string;
  observaciones?: string;
  lineas: Array<{
    skuId: bigint;
    cantidad: string;
    precioUnitario?: string;
    enUnidadReferencia?: boolean;
  }>;
}

interface ComprobanteEntrada {
  tipoDocumentoSunat: string;
  serie: string;
  numero: string;
  fechaEmision: Date;
  moneda?: string;
  tipoCambio?: string;
  subtotal: string;
  igv: string;
  total: string;
}

interface Despacho {
  ordenVentaId: bigint;
  comprobante: ComprobanteEntrada;
  lineas: Array<{
    ordenVentaLineaId: bigint;
    cantidad: string;
    numerosSerie?: string[];
  }>;
}

/** Fila del listado de comprobantes de venta emitidos. */
export interface ComprobanteListado {
  id: string;
  fechaEmision: string;
  comprobante: string;
  ordenVentaId: string;
  ordenVentaNumero: string;
  cliente: string;
  moneda: string;
  total: string;
}

/** Linea del detalle de un comprobante, derivada de lo despachado. */
export interface DetalleComprobanteLinea {
  skuId: string;
  skuCodigo: string;
  skuNombre: string;
  cantidad: string;
  precioUnitario: string | null;
  importe: string;
}

/** Detalle completo de un comprobante: cabecera + lineas despachadas. */
export interface DetalleComprobante {
  id: string;
  tipoDocumentoSunat: string;
  serie: string;
  numero: string;
  fechaEmision: string;
  cliente: string;
  ordenVentaId: string;
  ordenVentaNumero: string;
  moneda: string;
  tipoCambio: string | null;
  subtotal: string;
  igv: string;
  total: string;
  lineas: DetalleComprobanteLinea[];
}

@Injectable()
export class VentasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Crea la orden y RESERVA el stock de cada linea. Si una reserva falla,
   * libera las reservas previas y elimina la orden (atomicidad efectiva).
   */
  async crearOrdenVenta(usuario: UsuarioRequest, dto: NuevaOrdenVenta) {
    // Si se provee clienteId, validar pertenencia a la empresa (anti-IDOR).
    if (dto.clienteId !== undefined) {
      const cliente = await this.prisma.cliente.findFirst({
        where: { id: dto.clienteId, empresaId: usuario.empresaId },
      });
      if (!cliente) throw new NotFoundException("Cliente no encontrado");
    }

    // Normaliza cada linea a unidad de control (reserva, stock y costos viven en
    // unidad de control). El precio capturado por unidad de referencia se ajusta
    // para preservar el importe total.
    const lineasControl = await this.normalizarLineasACtrl(usuario.empresaId, dto.lineas);

    let subtotal = new D(0);
    for (const l of lineasControl) {
      subtotal = subtotal.add(new D(l.cantidad).mul(new D(l.precioUnitario ?? "0")));
    }
    const igv = subtotal.mul(IGV_TASA);
    const total = subtotal.add(igv);

    const orden = await this.prisma.ordenVenta.create({
      data: {
        empresaId: usuario.empresaId,
        almacenId: dto.almacenId,
        numero: dto.numero,
        clienteId: dto.clienteId ?? null,
        cliente: dto.cliente ?? null,
        moneda: dto.moneda ?? "PEN",
        tipoCambio: dto.tipoCambio ?? null,
        subtotal,
        igv,
        total,
        observaciones: dto.observaciones ?? null,
        usuarioId: usuario.id,
        lineas: {
          create: lineasControl.map((l) => ({
            empresaId: usuario.empresaId,
            skuId: l.skuId,
            cantidad: l.cantidad,
            precioUnitario: l.precioUnitario ?? "0",
          })),
        },
      },
    });

    // Reservar cada linea; si una falla, revertir las previas y borrar la orden.
    const reservadas: Array<{ skuId: bigint; cantidad: string }> = [];
    try {
      for (const l of lineasControl) {
        await this.movimientos.reservar(usuario, {
          skuId: l.skuId,
          almacenId: dto.almacenId,
          cantidad: l.cantidad,
        });
        reservadas.push({ skuId: l.skuId, cantidad: l.cantidad });
      }
    } catch (error) {
      for (const r of reservadas) {
        await this.movimientos.liberarReserva(usuario, {
          skuId: r.skuId,
          almacenId: dto.almacenId,
          cantidad: r.cantidad,
        });
      }
      await this.prisma.ordenVentaLinea.deleteMany({ where: { ordenVentaId: orden.id } });
      await this.prisma.ordenVenta.delete({ where: { id: orden.id } });
      throw error;
    }

    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "CREAR",
      entidad: "ORDEN_VENTA",
      entidadId: orden.id,
      detalle: `Orden de venta N° ${orden.numero} creada`,
    });

    return {
      id: orden.id.toString(),
      numero: orden.numero,
      subtotal: subtotal.toString(),
      igv: igv.toString(),
      total: total.toString(),
    };
  }

  /**
   * Convierte las lineas capturadas en unidad de referencia a unidad de control.
   * Valida pertenencia a la empresa (anti-IDOR) y que el SKU tenga factor.
   */
  private async normalizarLineasACtrl(
    empresaId: bigint,
    lineas: NuevaOrdenVenta["lineas"],
  ): Promise<Array<{ skuId: bigint; cantidad: string; precioUnitario?: string }>> {
    const idsReferencia = [
      ...new Set(lineas.filter((l) => l.enUnidadReferencia).map((l) => l.skuId)),
    ];

    const factores = new Map<string, Prisma.Decimal | null>();
    if (idsReferencia.length > 0) {
      const skus = await this.prisma.sku.findMany({
        where: { id: { in: idsReferencia }, empresaId },
        select: { id: true, factorConversion: true, unidadReferenciaId: true },
      });
      if (skus.length !== idsReferencia.length) {
        throw new NotFoundException("Algun SKU de la orden no pertenece a la empresa");
      }
      for (const s of skus) {
        if (s.unidadReferenciaId === null || s.factorConversion === null) {
          throw new BadRequestException(
            `El SKU ${s.id} no tiene unidad de referencia configurada para conversion`,
          );
        }
        factores.set(s.id.toString(), s.factorConversion);
      }
    }

    return lineas.map((l) => {
      if (!l.enUnidadReferencia) {
        return { skuId: l.skuId, cantidad: l.cantidad, precioUnitario: l.precioUnitario };
      }
      const factor = factores.get(l.skuId.toString()) ?? null;
      return {
        skuId: l.skuId,
        cantidad: aUnidadDeControl(l.cantidad, factor),
        precioUnitario: precioAUnidadDeControl(l.precioUnitario ?? "0", factor),
      };
    });
  }

  /**
   * Precio de venta sugerido para un SKU segun el nivel de precio del cliente.
   * El nivel se decide por Cliente.tipoPrecio (1=publico, 2=distribuidor, 3, 4);
   * si el cliente no esta identificado o no tiene tipoPrecio, se asume publico (1).
   * Si el nivel resuelto no tiene precio configurado, cae al primer nivel con
   * precio en orden de prioridad (publico, distribuidor, 3, 4). Valida pertenencia
   * a la empresa (anti-IDOR). Devuelve null en precio si ningun nivel tiene valor.
   */
  async precioSugerido(
    empresaId: bigint,
    skuId: bigint,
    clienteId?: bigint,
  ): Promise<{
    skuId: string;
    nivel: number;
    precio: string | null;
    monedaVenta: string | null;
  }> {
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, empresaId },
      select: {
        id: true,
        precioPublico: true,
        precioDistribuidor: true,
        precioVenta3: true,
        precioVenta4: true,
        monedaVenta: true,
      },
    });
    if (!sku) throw new NotFoundException("SKU no encontrado");

    let nivel = 1;
    if (clienteId !== undefined) {
      const cliente = await this.prisma.cliente.findFirst({
        where: { id: clienteId, empresaId },
        select: { tipoPrecio: true },
      });
      if (!cliente) throw new NotFoundException("Cliente no encontrado");
      if (cliente.tipoPrecio !== null) nivel = cliente.tipoPrecio;
    }

    const porNivel = new Map<number, Prisma.Decimal | null>([
      [1, sku.precioPublico],
      [2, sku.precioDistribuidor],
      [3, sku.precioVenta3],
      [4, sku.precioVenta4],
    ]);

    // Nivel solicitado primero; si no tiene valor, fallback por prioridad.
    const orden = [nivel, 1, 2, 3, 4];
    let precio: Prisma.Decimal | null = null;
    for (const n of orden) {
      const valor = porNivel.get(n);
      if (valor !== undefined && valor !== null) {
        precio = valor;
        break;
      }
    }

    return {
      skuId: sku.id.toString(),
      nivel,
      precio: precio !== null ? precio.toString() : null,
      monedaVenta: sku.monedaVenta,
    };
  }

  async listarOrdenes(empresaId: bigint) {
    const ordenes = await this.prisma.ordenVenta.findMany({
      where: { empresaId },
      include: { lineas: true, clienteRef: true },
      orderBy: { fechaEmision: "desc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      ordenes.flatMap((o) => o.lineas.map((l) => l.skuId)),
    );
    return ordenes.map((o) => ({
      id: o.id.toString(),
      numero: o.numero,
      clienteId: o.clienteId ? o.clienteId.toString() : null,
      cliente: o.clienteRef ? o.clienteRef.razonSocial : o.cliente,
      estado: o.estado,
      moneda: o.moneda,
      tipoCambio: o.tipoCambio ? o.tipoCambio.toString() : null,
      subtotal: o.subtotal.toString(),
      igv: o.igv.toString(),
      total: o.total.toString(),
      lineas: o.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        codigoSku: skus.get(l.skuId.toString())?.codigo ?? "",
        nombreSku: skus.get(l.skuId.toString())?.nombre ?? `SKU ${l.skuId}`,
        controlaSerie: skus.get(l.skuId.toString())?.controlaSerie ?? false,
        cantidad: l.cantidad.toString(),
        cantidadDespachada: l.cantidadDespachada.toString(),
        pendiente: new D(l.cantidad).sub(new D(l.cantidadDespachada)).toString(),
      })),
    }));
  }

  /** Mapa skuId -> {codigo, nombre} para enriquecer las lineas de orden. */
  private async cargarSkus(
    empresaId: bigint,
    ids: bigint[],
  ): Promise<
    Map<string, { codigo: string; nombre: string; controlaSerie: boolean }>
  > {
    if (ids.length === 0) return new Map();
    const skus = await this.prisma.sku.findMany({
      where: { empresaId, id: { in: [...new Set(ids)] } },
      include: { producto: true },
    });
    return new Map(
      skus.map((s) => [
        s.id.toString(),
        {
          codigo: s.codigoParlante,
          nombre: s.nombre ?? s.producto.nombre,
          controlaSerie: s.controlaSerie,
        },
      ]),
    );
  }

  /**
   * Lista los comprobantes de venta emitidos por la empresa, mas recientes
   * primero. Cada item resume documento, orden y cliente para auditoria rapida
   * desde la tabla.
   */
  async listarComprobantes(empresaId: bigint): Promise<ComprobanteListado[]> {
    const comprobantes = await this.prisma.comprobanteVenta.findMany({
      where: { empresaId },
      include: { ordenVenta: true, cliente: true },
      orderBy: { fechaEmision: "desc" },
    });
    return comprobantes.map((c) => ({
      id: c.id.toString(),
      fechaEmision: c.fechaEmision.toISOString(),
      comprobante: `${c.tipoDocumentoSunat} ${c.serie}-${c.numero}`,
      ordenVentaId: c.ordenVentaId.toString(),
      ordenVentaNumero: c.ordenVenta.numero,
      cliente: c.cliente ? c.cliente.razonSocial : "—",
      moneda: c.moneda,
      total: c.total.toString(),
    }));
  }

  /**
   * Detalle completo de un comprobante: cabecera y lineas DESPACHADAS en este
   * comprobante. ComprobanteVenta NO tiene lineas propias; las lineas se derivan
   * de los MovimientoStock cuyo documentoId apunta a este comprobante (cantidad
   * exacta despachada en ESTE comprobante, no toda la orden). El precio de venta
   * vive en OrdenVentaLinea.precioUnitario (el movimiento solo guarda costo), por
   * lo que se enriquece por skuId contra las lineas de la orden. El importe es
   * cantidad x precioUnitario. Lanza NotFoundException si no existe o no es de la
   * empresa.
   */
  async obtenerDetalleComprobante(
    empresaId: bigint,
    id: bigint,
  ): Promise<DetalleComprobante> {
    const comprobante = await this.prisma.comprobanteVenta.findFirst({
      where: { id, empresaId },
      include: {
        ordenVenta: { include: { lineas: true } },
        cliente: true,
      },
    });
    if (!comprobante) throw new NotFoundException("Comprobante no encontrado");

    // Movimientos de venta enlazados a ESTE comprobante (lo despachado aqui).
    const movimientos = await this.prisma.movimientoStock.findMany({
      where: {
        empresaId,
        documentoTipo: "VENTA",
        documentoId: comprobante.id,
      },
      select: { skuId: true, cantidad: true },
    });

    // Precio de venta por SKU desde las lineas de la orden (fuente economica).
    const precioPorSku = new Map<string, string>();
    for (const l of comprobante.ordenVenta.lineas) {
      precioPorSku.set(l.skuId.toString(), l.precioUnitario.toString());
    }

    const skus = await this.cargarSkus(
      empresaId,
      movimientos.map((m) => m.skuId),
    );

    // Cliente: razon social + doc si esta disponible.
    const cliente = comprobante.cliente
      ? `${comprobante.cliente.razonSocial} (${comprobante.cliente.numeroDoc})`
      : "—";

    return {
      id: comprobante.id.toString(),
      tipoDocumentoSunat: comprobante.tipoDocumentoSunat,
      serie: comprobante.serie,
      numero: comprobante.numero,
      fechaEmision: comprobante.fechaEmision.toISOString(),
      cliente,
      ordenVentaId: comprobante.ordenVentaId.toString(),
      ordenVentaNumero: comprobante.ordenVenta.numero,
      moneda: comprobante.moneda,
      tipoCambio: comprobante.tipoCambio ? comprobante.tipoCambio.toString() : null,
      subtotal: comprobante.subtotal.toString(),
      igv: comprobante.igv.toString(),
      total: comprobante.total.toString(),
      lineas: movimientos.map((m) => {
        const skuId = m.skuId.toString();
        const cantidad = m.cantidad.toString();
        const precio = precioPorSku.get(skuId) ?? null;
        const importe =
          precio !== null ? new D(cantidad).mul(new D(precio)).toString() : "0";
        return {
          skuId,
          skuCodigo: skus.get(skuId)?.codigo ?? "",
          skuNombre: skus.get(skuId)?.nombre ?? `SKU ${skuId}`,
          cantidad,
          precioUnitario: precio,
          importe,
        };
      }),
    };
  }

  /**
   * Despacho (parcial): registra el comprobante de venta (OBLIGATORIO, sustento
   * SUNAT) y genera las salidas del ledger DESDE la reserva, enlazando cada
   * movimiento al comprobante real (documentoId + serie/numero/tipoDoc/fecha).
   * Un comprobante por despacho. Requiere que la orden tenga cliente identificado.
   */
  async despachar(usuario: UsuarioRequest, dto: Despacho) {
    const orden = await this.prisma.ordenVenta.findFirst({
      where: { id: dto.ordenVentaId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de venta no encontrada");
    if (orden.estado === "DESPACHADA" || orden.estado === "ANULADA") {
      throw new BadRequestException(`La orden esta ${orden.estado}`);
    }
    if (orden.clienteId === null) {
      throw new BadRequestException(
        "La orden no tiene cliente identificado; no se puede emitir comprobante",
      );
    }

    // Validar todas las lineas antes de tocar el ledger o crear el comprobante.
    // Ademas se acumula el subtotal calculado (cantidad despachada x precio de la
    // linea) para conciliar los montos del comprobante.
    let subtotalCalculado = new D(0);
    for (const linea of dto.lineas) {
      const ovLinea = orden.lineas.find((l) => l.id === linea.ordenVentaLineaId);
      if (!ovLinea) {
        throw new BadRequestException(`Linea ${linea.ordenVentaLineaId} no pertenece a la orden`);
      }
      const pendiente = new D(ovLinea.cantidad).sub(new D(ovLinea.cantidadDespachada));
      const despachar = new D(linea.cantidad);
      if (despachar.greaterThan(pendiente)) {
        throw new BadRequestException(
          `La linea excede lo pendiente: pendiente ${pendiente.toString()}, despacho ${despachar.toString()}`,
        );
      }
      subtotalCalculado = subtotalCalculado.add(
        despachar.mul(new D(ovLinea.precioUnitario)),
      );
    }

    const c = dto.comprobante;

    // Conciliacion de montos del comprobante (sustento SUNAT). El subtotal debe
    // cuadrar con lo despachado en ESTE comprobante, el IGV con subtotal x 18% y
    // el total con subtotal + IGV, todo dentro de la tolerancia por redondeo.
    const subtotalComprobante = new D(c.subtotal);
    if (
      subtotalComprobante.sub(subtotalCalculado).abs().greaterThan(TOLERANCIA_CONCILIACION)
    ) {
      throw new BadRequestException(
        `El subtotal del comprobante (${subtotalComprobante.toString()}) no concilia ` +
          `con lo despachado (${subtotalCalculado.toString()})`,
      );
    }
    const igvComprobante = new D(c.igv);
    const igvEsperado = subtotalComprobante.mul(IGV_TASA);
    if (igvComprobante.sub(igvEsperado).abs().greaterThan(TOLERANCIA_CONCILIACION)) {
      throw new BadRequestException(
        `El IGV del comprobante (${igvComprobante.toString()}) no concilia con el ` +
          `esperado (${igvEsperado.toString()} = subtotal x 18%)`,
      );
    }
    const totalComprobante = new D(c.total);
    const totalEsperado = subtotalComprobante.add(igvComprobante);
    if (totalComprobante.sub(totalEsperado).abs().greaterThan(TOLERANCIA_CONCILIACION)) {
      throw new BadRequestException(
        `El total del comprobante (${totalComprobante.toString()}) no concilia con ` +
          `subtotal + IGV (${totalEsperado.toString()})`,
      );
    }
    // clienteId quedo garantizado no-nulo por la validacion previa; se captura
    // aqui para preservar el narrowing dentro de la closure transaccional.
    const clienteId = orden.clienteId;
    // Todo el despacho (comprobante + salidas del ledger inmutable + updates de la
    // orden) ocurre en UNA transaccion: si cualquier linea falla a mitad, nada se
    // commitea (sin movimientos huerfanos ni stock comprometido inconsistente).
    const comprobanteId = await this.prisma.$transaction(async (tx) => {
      const comprobante = await tx.comprobanteVenta.create({
        data: {
          empresaId: usuario.empresaId,
          ordenVentaId: orden.id,
          clienteId,
          tipoDocumentoSunat: c.tipoDocumentoSunat,
          serie: c.serie,
          numero: c.numero,
          fechaEmision: c.fechaEmision,
          moneda: c.moneda ?? orden.moneda,
          tipoCambio: c.tipoCambio ?? null,
          subtotal: c.subtotal,
          igv: c.igv,
          total: c.total,
        },
      });

      for (const linea of dto.lineas) {
        const ovLinea = orden.lineas.find((l) => l.id === linea.ordenVentaLineaId)!;
        const despachar = new D(linea.cantidad);

        const resultado = await this.movimientos.registrarSalidaVentaEnTx(usuario, tx, {
          skuId: ovLinea.skuId,
          almacenId: orden.almacenId,
          cantidad: linea.cantidad,
          desdeReserva: true,
          documentoId: comprobante.id,
          tipoDocumentoSunat: c.tipoDocumentoSunat,
          serieComprobante: c.serie,
          numeroComprobante: c.numero,
          fechaEmisionDocumento: c.fechaEmision,
          observaciones: `Despacho OV ${orden.numero}`,
          numerosSerie: linea.numerosSerie,
        });

        // Promedio ponderado acumulado del costo de despacho de la linea: soporta
        // despachos parciales a distinto costo. Se usa como costo basis al devolver,
        // de modo que el reingreso no corrompa el costo promedio movil del item.
        const prevQty = new D(ovLinea.cantidadDespachada);
        const prevCost = ovLinea.costoDespachoUnitario
          ? new D(ovLinea.costoDespachoUnitario)
          : new D(0);
        const nuevaQty = prevQty.add(despachar);
        const nuevoCosto = nuevaQty.isZero()
          ? new D(0)
          : prevQty.mul(prevCost).add(despachar.mul(resultado.costoSalida)).div(nuevaQty);

        await tx.ordenVentaLinea.update({
          where: { id: ovLinea.id },
          data: {
            cantidadDespachada: { increment: despachar },
            costoDespachoUnitario: nuevoCosto,
          },
        });
      }

      await this.recalcularEstado(tx, orden.id);

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "DESPACHAR",
          entidad: "ORDEN_VENTA",
          entidadId: orden.id,
          detalle: `Orden de venta N° ${orden.numero} despachada con comprobante ${c.serie}-${c.numero}`,
        },
        tx,
      );

      return comprobante.id;
    });

    return { ok: true, comprobanteId: comprobanteId.toString() };
  }

  /** Anula una orden no despachada y libera sus reservas. */
  async anular(usuario: UsuarioRequest, ordenVentaId: bigint) {
    const orden = await this.prisma.ordenVenta.findFirst({
      where: { id: ordenVentaId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de venta no encontrada");
    if (orden.estado === "DESPACHADA") {
      throw new BadRequestException("No se puede anular una orden ya despachada");
    }

    for (const linea of orden.lineas) {
      const pendienteReserva = new D(linea.cantidad).sub(new D(linea.cantidadDespachada));
      if (pendienteReserva.greaterThan(0)) {
        await this.movimientos.liberarReserva(usuario, {
          skuId: linea.skuId,
          almacenId: orden.almacenId,
          cantidad: pendienteReserva.toString(),
        });
      }
    }
    await this.prisma.ordenVenta.update({
      where: { id: orden.id },
      data: { estado: "ANULADA" },
    });
    await this.auditoria.registrar({
      empresaId: usuario.empresaId,
      usuarioId: usuario.id,
      accion: "ANULAR",
      entidad: "ORDEN_VENTA",
      entidadId: orden.id,
      detalle: `Orden de venta N° ${orden.numero} anulada`,
    });
    return { ok: true };
  }

  private async recalcularEstado(
    tx: Prisma.TransactionClient,
    ordenId: bigint,
  ): Promise<void> {
    const lineas = await tx.ordenVentaLinea.findMany({
      where: { ordenVentaId: ordenId },
    });
    const todo = lineas.every((l) =>
      new D(l.cantidadDespachada).greaterThanOrEqualTo(new D(l.cantidad)),
    );
    const algo = lineas.some((l) => new D(l.cantidadDespachada).greaterThan(0));
    const estado = todo ? "DESPACHADA" : algo ? "PARCIAL" : "PENDIENTE";
    await tx.ordenVenta.update({ where: { id: ordenId }, data: { estado } });
  }
}
