import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";
import {
  aUnidadDeControl,
  precioAUnidadDeControl,
} from "../comun/conversion/conversion-unidad.js";

const D = Prisma.Decimal;

/** Tasa de IGV vigente en Peru (18%). */
const IGV_TASA = new D("0.18");

/** Tolerancia (en moneda) para conciliar el subtotal capturado vs el calculado. */
const TOLERANCIA_CONCILIACION = new D("0.50");

interface NuevaOrden {
  proveedorId: bigint;
  almacenId: bigint;
  requerimientoId?: bigint;
  moneda?: string;
  tipoCambio?: string;
  observaciones?: string;
  lineas: Array<{
    skuId: bigint;
    cantidad: string;
    costoUnitario: string;
    enUnidadReferencia?: boolean;
  }>;
}

interface Recepcion {
  ordenCompraId: bigint;
  tipoDocumentoSunat: string;
  serieComprobante: string;
  numeroComprobante: string;
  fechaEmisionDocumento: Date;
  moneda?: string;
  tipoCambio?: string;
  subtotal: string;
  igv: string;
  total: string;
  guiaRemisionProveedor?: string;
  lineas: Array<{
    ordenCompraLineaId: bigint;
    cantidad: string;
    numerosSerie?: string[];
  }>;
}

/** Item del listado de recepciones (cabecera resumida para la tabla). */
export interface RecepcionListado {
  id: string;
  fecha: string;
  ordenCompraId: string;
  ordenCompraNumero: string;
  proveedor: string;
  comprobante: string;
  moneda: string;
  total: string;
}

/** Linea del detalle de una recepcion, enriquecida con SKU y series recibidas. */
export interface DetalleRecepcionLinea {
  skuId: string;
  skuCodigo: string;
  skuNombre: string;
  cantidad: string;
  costoUnitario: string | null;
  series: string[];
}

/** Detalle completo de una recepcion: cabecera del comprobante + lineas. */
export interface DetalleRecepcion {
  id: string;
  fecha: string;
  ordenCompraId: string;
  ordenCompraNumero: string;
  proveedor: string;
  tipoDocumentoSunat: string;
  serieComprobante: string;
  numeroComprobante: string;
  fechaEmisionDocumento: string;
  moneda: string;
  tipoCambio: string | null;
  subtotal: string;
  igv: string;
  total: string;
  guiaRemisionProveedor: string | null;
  usuario: string;
  lineas: DetalleRecepcionLinea[];
}

@Injectable()
export class ComprasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
    private readonly correlativos: CorrelativoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Crea la OC en estado BORRADOR. Calcula subtotal, IGV (18%) y total.
   * El numero se asigna por correlativo (tipo ORDEN_COMPRA). Si se enlaza un
   * requerimiento APROBADO, este pasa a CONVERTIDO. Todo en una transaccion.
   */
  async crearOrdenCompra(usuario: UsuarioRequest, dto: NuevaOrden) {
    const proveedor = await this.prisma.proveedor.findFirst({
      where: { id: dto.proveedorId, empresaId: usuario.empresaId },
    });
    if (!proveedor) throw new NotFoundException("Proveedor no encontrado");

    let requerimiento = null;
    if (dto.requerimientoId !== undefined) {
      requerimiento = await this.prisma.requerimientoCompra.findFirst({
        where: { id: dto.requerimientoId, empresaId: usuario.empresaId },
      });
      if (!requerimiento) throw new NotFoundException("Requerimiento no encontrado");
      if (requerimiento.estado !== "APROBADO") {
        throw new BadRequestException(
          `Solo se puede convertir un requerimiento APROBADO (estado actual: ${requerimiento.estado})`,
        );
      }
    }

    // Aislamiento por empresa (anti-IDOR): el almacen destino y TODOS los SKUs de
    // las lineas deben pertenecer al tenant antes de tocar la OC o el ledger.
    const almacen = await this.prisma.almacen.findFirst({
      where: { id: dto.almacenId, empresaId: usuario.empresaId },
      select: { id: true },
    });
    if (!almacen) throw new NotFoundException("Almacén no encontrado");

    const idsSku = [...new Set(dto.lineas.map((l) => l.skuId))];
    const skusValidos = await this.prisma.sku.count({
      where: { id: { in: idsSku }, empresaId: usuario.empresaId },
    });
    if (skusValidos !== idsSku.length) {
      throw new NotFoundException("Algun SKU de la orden no pertenece a la empresa");
    }

    // Normaliza cada linea a la unidad de CONTROL. Cuando la linea se captura
    // en unidad de referencia, convertimos cantidad y costo unitario para que la
    // OC, las recepciones y el ledger queden siempre en unidad de control.
    const lineasControl = await this.normalizarLineasACtrl(usuario.empresaId, dto.lineas);

    let subtotal = new D(0);
    for (const l of lineasControl) {
      subtotal = subtotal.add(new D(l.cantidad).mul(new D(l.costoUnitario)));
    }
    const igv = subtotal.mul(IGV_TASA);
    const total = subtotal.add(igv);

    const resultado = await this.prisma.$transaction(async (tx) => {
      const correlativo = await this.correlativos.siguiente(
        tx,
        usuario.empresaId,
        "ORDEN_COMPRA",
      );

      const orden = await tx.ordenCompra.create({
        data: {
          empresaId: usuario.empresaId,
          proveedorId: dto.proveedorId,
          almacenId: dto.almacenId,
          requerimientoId: dto.requerimientoId ?? null,
          numero: correlativo.formateado,
          estado: "BORRADOR",
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
              costoUnitario: l.costoUnitario,
            })),
          },
        },
      });

      if (requerimiento) {
        // CAS sobre el estado: solo convierte si SIGUE APROBADO. Condicionar el
        // update por estado y verificar filas afectadas evita la doble conversion
        // (dos OC creadas en paralelo desde el mismo requerimiento): la segunda
        // afecta 0 filas y se rechaza con conflicto, revirtiendo su transaccion.
        const actualizados = await tx.requerimientoCompra.updateMany({
          where: { id: requerimiento.id, estado: "APROBADO" },
          data: { estado: "CONVERTIDO" },
        });
        if (actualizados.count === 0) {
          throw new ConflictException(
            "El requerimiento ya fue convertido o cambio de estado",
          );
        }
      }

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "CREAR",
          entidad: "ORDEN_COMPRA",
          entidadId: orden.id,
          detalle: `Orden de compra N° ${orden.numero} creada`,
        },
        tx,
      );

      return orden;
    });

    return {
      id: resultado.id.toString(),
      numero: resultado.numero,
      estado: resultado.estado,
      subtotal: subtotal.toString(),
      igv: igv.toString(),
      total: total.toString(),
    };
  }

  /** Aprueba la OC: BORRADOR -> EMITIDA, deja constancia del aprobador. */
  async aprobarOrden(usuario: UsuarioRequest, id: bigint) {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id, empresaId: usuario.empresaId },
    });
    if (!orden) throw new NotFoundException("Orden de compra no encontrada");
    if (orden.estado !== "BORRADOR") {
      throw new BadRequestException(
        `Solo se puede aprobar una OC en BORRADOR (estado actual: ${orden.estado})`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ordenCompra.update({
        where: { id },
        data: { estado: "EMITIDA", aprobadoPorId: usuario.id },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "APROBAR",
          entidad: "ORDEN_COMPRA",
          entidadId: orden.id,
          detalle: `Orden de compra N° ${orden.numero} aprobada`,
        },
        tx,
      );
    });
    return { id: id.toString(), estado: "EMITIDA" };
  }

  /** Anula la OC: BORRADOR o EMITIDA -> ANULADA. No si ya tiene recepciones. */
  async anularOrden(usuario: UsuarioRequest, id: bigint) {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id, empresaId: usuario.empresaId },
      include: { recepciones: { take: 1 } },
    });
    if (!orden) throw new NotFoundException("Orden de compra no encontrada");
    if (orden.estado !== "BORRADOR" && orden.estado !== "EMITIDA") {
      throw new BadRequestException(
        `Solo se puede anular una OC en BORRADOR o EMITIDA (estado actual: ${orden.estado})`,
      );
    }
    if (orden.recepciones.length > 0) {
      throw new BadRequestException("No se puede anular una OC con recepciones registradas");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.ordenCompra.update({ where: { id }, data: { estado: "ANULADA" } });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "ANULAR",
          entidad: "ORDEN_COMPRA",
          entidadId: orden.id,
          detalle: `Orden de compra N° ${orden.numero} anulada`,
        },
        tx,
      );
    });
    return { id: id.toString(), estado: "ANULADA" };
  }

  async listarOrdenes(empresaId: bigint) {
    const ordenes = await this.prisma.ordenCompra.findMany({
      where: { empresaId },
      include: { proveedor: true, lineas: true },
      orderBy: { fechaEmision: "desc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      ordenes.flatMap((o) => o.lineas.map((l) => l.skuId)),
    );
    return ordenes.map((o) => ({
      id: o.id.toString(),
      numero: o.numero,
      estado: o.estado,
      proveedorId: o.proveedorId.toString(),
      proveedor: o.proveedor.razonSocial,
      requerimientoId: o.requerimientoId ? o.requerimientoId.toString() : null,
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
        costoUnitario: l.costoUnitario.toString(),
        cantidadRecibida: l.cantidadRecibida.toString(),
        pendiente: new D(l.cantidad).sub(new D(l.cantidadRecibida)).toString(),
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
   * Recepcion parcial contra factura del proveedor (OBLIGATORIA): persiste el
   * comprobante, concilia el subtotal capturado contra el calculado, genera la
   * entrada en el ledger (con serie/numero/tipoDoc/fecha REALES de la factura) y
   * actualiza la OC. Solo se permite sobre OC EMITIDA o PARCIAL.
   */
  async recibir(usuario: UsuarioRequest, dto: Recepcion) {
    const orden = await this.prisma.ordenCompra.findFirst({
      where: { id: dto.ordenCompraId, empresaId: usuario.empresaId },
      include: { lineas: true },
    });
    if (!orden) throw new NotFoundException("Orden de compra no encontrada");
    if (orden.estado !== "EMITIDA" && orden.estado !== "PARCIAL") {
      throw new BadRequestException(
        `Solo se puede recibir sobre una OC EMITIDA (estado actual: ${orden.estado})`,
      );
    }

    // No registrar dos veces la misma factura del proveedor. La unicidad real la
    // garantiza el indice parcial de la BD (recepcion_empresa_tipo_serie_numero_key);
    // este chequeo previo da un mensaje claro antes de tocar el ledger. Las series
    // dummy '0' (backfill) quedan fuera del indice y por eso se excluyen aqui tambien.
    if (dto.serieComprobante !== "0" && dto.numeroComprobante !== "0") {
      const yaExiste = await this.prisma.recepcion.findFirst({
        where: {
          empresaId: usuario.empresaId,
          tipoDocumentoSunat: dto.tipoDocumentoSunat,
          serieComprobante: dto.serieComprobante,
          numeroComprobante: dto.numeroComprobante,
        },
        select: { id: true },
      });
      if (yaExiste) {
        throw new ConflictException(
          `Ya existe una recepcion con el comprobante ${dto.tipoDocumentoSunat} ` +
            `${dto.serieComprobante}-${dto.numeroComprobante} para esta empresa`,
        );
      }
    }

    // Conciliacion: el subtotal capturado de la factura debe cuadrar con la
    // suma de cantidad recibida x costo unitario de la OC (dentro de tolerancia).
    let subtotalCalculado = new D(0);
    for (const linea of dto.lineas) {
      const ocLinea = orden.lineas.find((l) => l.id === linea.ordenCompraLineaId);
      if (!ocLinea) {
        throw new BadRequestException(
          `Linea ${linea.ordenCompraLineaId} no pertenece a la orden`,
        );
      }
      subtotalCalculado = subtotalCalculado.add(
        new D(linea.cantidad).mul(new D(ocLinea.costoUnitario)),
      );
    }
    const subtotalFactura = new D(dto.subtotal);
    if (subtotalFactura.sub(subtotalCalculado).abs().greaterThan(TOLERANCIA_CONCILIACION)) {
      throw new BadRequestException(
        `El subtotal de la factura (${subtotalFactura.toString()}) no concilia con el calculado de la recepcion (${subtotalCalculado.toString()})`,
      );
    }
    // Conciliacion de IGV y total: el IGV debe ser ~ subtotal x 18% y el total
    // ~ subtotal + IGV, dentro de la tolerancia por redondeo.
    const igvFactura = new D(dto.igv);
    const igvEsperado = subtotalFactura.mul(IGV_TASA);
    if (igvFactura.sub(igvEsperado).abs().greaterThan(TOLERANCIA_CONCILIACION)) {
      throw new BadRequestException(
        `El IGV de la factura (${igvFactura.toString()}) no concilia con el esperado ` +
          `(${igvEsperado.toString()} = subtotal x 18%)`,
      );
    }
    const totalFactura = new D(dto.total);
    const totalEsperado = subtotalFactura.add(igvFactura);
    if (totalFactura.sub(totalEsperado).abs().greaterThan(TOLERANCIA_CONCILIACION)) {
      throw new BadRequestException(
        `El total de la factura (${totalFactura.toString()}) no concilia con ` +
          `subtotal + IGV (${totalEsperado.toString()})`,
      );
    }

    // Toda la recepcion (comprobante + entradas al ledger inmutable + updates de
    // la OC) ocurre en UNA transaccion: si cualquier linea falla a mitad, nada se
    // commitea (sin movimientos huerfanos ni contadores inconsistentes).
    const recepcionId = await this.prisma.$transaction(async (tx) => {
      const recepcion = await tx.recepcion.create({
        data: {
          empresaId: usuario.empresaId,
          ordenCompraId: orden.id,
          tipoDocumentoSunat: dto.tipoDocumentoSunat,
          serieComprobante: dto.serieComprobante,
          numeroComprobante: dto.numeroComprobante,
          fechaEmisionDocumento: dto.fechaEmisionDocumento,
          moneda: dto.moneda ?? "PEN",
          tipoCambio: dto.tipoCambio ?? null,
          subtotal: dto.subtotal,
          igv: dto.igv,
          total: dto.total,
          guiaRemisionProveedor: dto.guiaRemisionProveedor ?? null,
          usuarioId: usuario.id,
        },
      });

      for (const linea of dto.lineas) {
        const ocLinea = orden.lineas.find((l) => l.id === linea.ordenCompraLineaId)!;
        const pendiente = new D(ocLinea.cantidad).sub(new D(ocLinea.cantidadRecibida));
        const recibir = new D(linea.cantidad);
        if (recibir.greaterThan(pendiente)) {
          throw new BadRequestException(
            `La linea excede lo pendiente: pendiente ${pendiente.toString()}, recibido ${recibir.toString()}`,
          );
        }

        // Entrada en el ledger con el costo de la OC y los datos REALES de la factura.
        const movimientoId = await this.movimientos.recibirCompraEnTx(usuario, tx, {
          skuId: ocLinea.skuId,
          almacenId: orden.almacenId,
          cantidad: linea.cantidad,
          costoUnitario: ocLinea.costoUnitario.toString(),
          documentoId: recepcion.id,
          tipoDocumentoSunat: dto.tipoDocumentoSunat,
          serieComprobante: dto.serieComprobante,
          numeroComprobante: dto.numeroComprobante,
          fechaEmisionDocumento: dto.fechaEmisionDocumento,
          observaciones: `Recepcion OC ${orden.numero}`,
          numerosSerie: linea.numerosSerie,
        });

        await tx.recepcionLinea.create({
          data: {
            empresaId: usuario.empresaId,
            recepcionId: recepcion.id,
            ordenCompraLineaId: ocLinea.id,
            skuId: ocLinea.skuId,
            cantidad: linea.cantidad,
            movimientoStockId: movimientoId,
          },
        });

        await tx.ordenCompraLinea.update({
          where: { id: ocLinea.id },
          data: { cantidadRecibida: { increment: recibir } },
        });
      }

      await this.recalcularEstado(tx, orden.id);

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "RECIBIR",
          entidad: "ORDEN_COMPRA",
          entidadId: orden.id,
          detalle: `Recepcion ${dto.serieComprobante}-${dto.numeroComprobante} sobre OC N° ${orden.numero}`,
        },
        tx,
      );

      return recepcion.id;
    });

    return { recepcionId: recepcionId.toString() };
  }

  /**
   * Lista las recepciones de la empresa, mas recientes primero. Cada item
   * resume el comprobante del proveedor para auditoria rapida desde la tabla.
   */
  async listarRecepciones(empresaId: bigint): Promise<RecepcionListado[]> {
    const recepciones = await this.prisma.recepcion.findMany({
      where: { empresaId },
      include: { ordenCompra: { include: { proveedor: true } } },
      orderBy: { fecha: "desc" },
    });
    return recepciones.map((r) => ({
      id: r.id.toString(),
      fecha: r.fecha.toISOString(),
      ordenCompraId: r.ordenCompraId.toString(),
      ordenCompraNumero: r.ordenCompra.numero,
      proveedor: r.ordenCompra.proveedor.razonSocial,
      comprobante: `${r.tipoDocumentoSunat} ${r.serieComprobante}-${r.numeroComprobante}`,
      moneda: r.moneda,
      total: r.total.toString(),
    }));
  }

  /**
   * Detalle completo de una recepcion: cabecera del comprobante del proveedor y
   * lineas con SKU, costo unitario y series recibidas. El costo unitario se toma
   * de la linea de la OC (ordenCompraLineaId), que es el costo con el que se
   * valorizo la entrada en el ledger. Las series son los SerieArticulo cuya
   * entrada al stock (movimientoEntradaId) es el movimiento de la linea recibida.
   * Lanza NotFoundException si la recepcion no existe o no es de la empresa.
   */
  async obtenerDetalleRecepcion(
    empresaId: bigint,
    id: bigint,
  ): Promise<DetalleRecepcion> {
    const recepcion = await this.prisma.recepcion.findFirst({
      where: { id, empresaId },
      include: {
        ordenCompra: { include: { proveedor: true } },
        lineas: true,
      },
    });
    if (!recepcion) throw new NotFoundException("Recepción no encontrada");

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: recepcion.usuarioId },
      select: { nombre: true },
    });

    // Costo unitario por linea de OC (fuente de valorizacion del ledger).
    const idsOcLinea = [...new Set(recepcion.lineas.map((l) => l.ordenCompraLineaId))];
    const ocLineas = await this.prisma.ordenCompraLinea.findMany({
      where: { empresaId, id: { in: idsOcLinea } },
      select: { id: true, costoUnitario: true },
    });
    const costoPorOcLinea = new Map(
      ocLineas.map((l) => [l.id.toString(), l.costoUnitario.toString()]),
    );

    // Series recibidas: SerieArticulo.movimientoEntradaId == movimientoStockId
    // de la linea de recepcion. Solo aplica a SKUs que controlan serie.
    const idsMovimiento = [...new Set(recepcion.lineas.map((l) => l.movimientoStockId))];
    const series = await this.prisma.serieArticulo.findMany({
      where: { empresaId, movimientoEntradaId: { in: idsMovimiento } },
      select: { movimientoEntradaId: true, numeroSerie: true },
      orderBy: { numeroSerie: "asc" },
    });
    const seriesPorMovimiento = new Map<string, string[]>();
    for (const s of series) {
      if (s.movimientoEntradaId === null) continue;
      const clave = s.movimientoEntradaId.toString();
      const acum = seriesPorMovimiento.get(clave) ?? [];
      acum.push(s.numeroSerie);
      seriesPorMovimiento.set(clave, acum);
    }

    const skus = await this.cargarSkus(
      empresaId,
      recepcion.lineas.map((l) => l.skuId),
    );

    return {
      id: recepcion.id.toString(),
      fecha: recepcion.fecha.toISOString(),
      ordenCompraId: recepcion.ordenCompraId.toString(),
      ordenCompraNumero: recepcion.ordenCompra.numero,
      proveedor: recepcion.ordenCompra.proveedor.razonSocial,
      tipoDocumentoSunat: recepcion.tipoDocumentoSunat,
      serieComprobante: recepcion.serieComprobante,
      numeroComprobante: recepcion.numeroComprobante,
      fechaEmisionDocumento: recepcion.fechaEmisionDocumento.toISOString(),
      moneda: recepcion.moneda,
      tipoCambio: recepcion.tipoCambio ? recepcion.tipoCambio.toString() : null,
      subtotal: recepcion.subtotal.toString(),
      igv: recepcion.igv.toString(),
      total: recepcion.total.toString(),
      guiaRemisionProveedor: recepcion.guiaRemisionProveedor,
      usuario: usuario?.nombre ?? "—",
      lineas: recepcion.lineas.map((l) => ({
        skuId: l.skuId.toString(),
        skuCodigo: skus.get(l.skuId.toString())?.codigo ?? "",
        skuNombre: skus.get(l.skuId.toString())?.nombre ?? `SKU ${l.skuId}`,
        cantidad: l.cantidad.toString(),
        costoUnitario: costoPorOcLinea.get(l.ordenCompraLineaId.toString()) ?? null,
        series: seriesPorMovimiento.get(l.movimientoStockId.toString()) ?? [],
      })),
    };
  }

  /**
   * Convierte las lineas capturadas en unidad de referencia a unidad de control.
   * Solo carga factores para los SKUs marcados con enUnidadReferencia. Valida que
   * el SKU pertenezca a la empresa (anti-IDOR) y que tenga factor definido.
   */
  private async normalizarLineasACtrl(
    empresaId: bigint,
    lineas: NuevaOrden["lineas"],
  ): Promise<Array<{ skuId: bigint; cantidad: string; costoUnitario: string }>> {
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
        return { skuId: l.skuId, cantidad: l.cantidad, costoUnitario: l.costoUnitario };
      }
      const factor = factores.get(l.skuId.toString()) ?? null;
      return {
        skuId: l.skuId,
        cantidad: aUnidadDeControl(l.cantidad, factor),
        costoUnitario: precioAUnidadDeControl(l.costoUnitario, factor),
      };
    });
  }

  /** Actualiza el estado de la OC segun lo recibido vs lo pedido. */
  private async recalcularEstado(
    tx: Prisma.TransactionClient,
    ordenId: bigint,
  ): Promise<void> {
    const lineas = await tx.ordenCompraLinea.findMany({
      where: { ordenCompraId: ordenId },
    });
    const todoCompleto = lineas.every((l) =>
      new D(l.cantidadRecibida).greaterThanOrEqualTo(new D(l.cantidad)),
    );
    const algoRecibido = lineas.some((l) => new D(l.cantidadRecibida).greaterThan(0));
    const estado = todoCompleto ? "COMPLETA" : algoRecibido ? "PARCIAL" : "EMITIDA";
    await tx.ordenCompra.update({ where: { id: ordenId }, data: { estado } });
  }
}
