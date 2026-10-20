import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { EstadoOrdenProduccion, Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { aUnidadDeControl } from "../comun/conversion/conversion-unidad.js";

/** Estados de una orden de produccion que aceptan nuevos vales y despachos. */
const ESTADOS_ORDEN_PRODUCCION_ACTIVOS: readonly EstadoOrdenProduccion[] = [
  "PLANIFICADA",
  "EN_PROCESO",
];

export interface NuevoValeSalida {
  almacenId: bigint;
  centroCostoId: bigint;
  ordenTrabajoId?: bigint;
  ordenProduccionId?: bigint;
  destino: string;
  observaciones?: string;
  comprobanteFisico?: string;
  entregadoA?: string;
  lineas: Array<{
    skuId: bigint;
    cantidad: string;
    observacion?: string;
    enUnidadReferencia?: boolean;
  }>;
}

@Injectable()
export class ValesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativos: CorrelativoService,
    private readonly movimientos: MovimientoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(empresaId: bigint) {
    const filas = await this.prisma.valeSalida.findMany({
      where: { empresaId },
      include: {
        centroCosto: true,
        almacen: true,
        ordenTrabajo: true,
        ordenProduccion: { select: { id: true, numero: true } },
        solicitante: true,
        autorizadoPor: true,
        lineas: true,
      },
      orderBy: { fecha: "desc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      filas.flatMap((v) => v.lineas.map((l) => l.skuId)),
    );
    return filas.map((v) => this.mapearVale(v, skus));
  }

  /** Obtiene un vale por id con el detalle completo para imprimir. */
  async obtener(empresaId: bigint, id: bigint) {
    const vale = await this.prisma.valeSalida.findFirst({
      where: { id, empresaId },
      include: {
        centroCosto: true,
        almacen: true,
        ordenTrabajo: true,
        ordenProduccion: { select: { id: true, numero: true } },
        solicitante: true,
        autorizadoPor: true,
        lineas: true,
      },
    });
    if (!vale) throw new NotFoundException("Vale de salida no encontrado");
    const skus = await this.cargarSkus(
      empresaId,
      vale.lineas.map((l) => l.skuId),
    );
    return this.mapearVale(vale, skus);
  }

  /** Da forma al vale para la API. Reutilizado por listar() y obtener(). */
  private mapearVale(
    v: Prisma.ValeSalidaGetPayload<{
      include: {
        centroCosto: true;
        almacen: true;
        ordenTrabajo: true;
        ordenProduccion: { select: { id: true; numero: true } };
        solicitante: true;
        autorizadoPor: true;
        lineas: true;
      };
    }>,
    skus: Map<string, { codigo: string; nombre: string; controlaSerie: boolean }>,
  ) {
    return {
      id: v.id.toString(),
      numero: v.numero,
      fecha: v.fecha.toISOString(),
      estado: v.estado,
      almacenId: v.almacenId.toString(),
      almacen: v.almacen.nombre,
      centroCostoId: v.centroCostoId.toString(),
      centroCosto: v.centroCosto.nombre,
      ordenTrabajoId: v.ordenTrabajoId ? v.ordenTrabajoId.toString() : null,
      ordenTrabajo: v.ordenTrabajo ? v.ordenTrabajo.numero : null,
      ordenProduccion: v.ordenProduccion
        ? { id: v.ordenProduccion.id.toString(), numero: v.ordenProduccion.numero }
        : null,
      destino: v.destino,
      solicitanteId: v.solicitanteId.toString(),
      solicitante: v.solicitante.nombre,
      autorizadoPorId: v.autorizadoPorId ? v.autorizadoPorId.toString() : null,
      autorizadoPor: v.autorizadoPor ? v.autorizadoPor.nombre : null,
      observaciones: v.observaciones,
      comprobanteFisico: v.comprobanteFisico,
      entregadoA: v.entregadoA,
      lineas: v.lineas.map((l) => ({
        id: l.id.toString(),
        skuId: l.skuId.toString(),
        codigoSku: skus.get(l.skuId.toString())?.codigo ?? "",
        nombreSku: skus.get(l.skuId.toString())?.nombre ?? `SKU ${l.skuId}`,
        controlaSerie: skus.get(l.skuId.toString())?.controlaSerie ?? false,
        cantidad: l.cantidad.toString(),
        cantidadDespachada: l.cantidadDespachada.toString(),
        observacion: l.observacion,
        movimientoStockId: l.movimientoStockId ? l.movimientoStockId.toString() : null,
      })),
    };
  }

  /** Mapa skuId -> {codigo, nombre, controlaSerie} para enriquecer las lineas. */
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
      select: { id: true, factorConversion: true, unidadReferenciaId: true },
    });
    if (skus.length !== skuIds.length) {
      throw new BadRequestException("Uno o mas SKU no pertenecen a la empresa");
    }
    const factores = new Map(skus.map((s) => [s.id.toString(), s]));

    // Normaliza cada linea a unidad de control (el stock vive en unidad de control).
    const lineasControl = dto.lineas.map((l) => {
      if (!l.enUnidadReferencia) {
        return { skuId: l.skuId, cantidad: l.cantidad, observacion: l.observacion };
      }
      const sku = factores.get(l.skuId.toString())!;
      if (sku.unidadReferenciaId === null || sku.factorConversion === null) {
        throw new BadRequestException(
          `El SKU ${l.skuId} no tiene unidad de referencia configurada para conversion`,
        );
      }
      return {
        skuId: l.skuId,
        cantidad: aUnidadDeControl(l.cantidad, sku.factorConversion),
        observacion: l.observacion,
      };
    });

    const id = await this.prisma.$transaction(async (tx) => {
      const ordenTrabajoId = await this.validarOrdenProduccion(
        tx,
        usuario.empresaId,
        dto.ordenProduccionId,
        dto.ordenTrabajoId,
      );
      // La OT efectiva (del DTO o heredada de la orden de produccion) debe
      // seguir abierta: un vale nunca se imputa a una OT cerrada.
      if (ordenTrabajoId !== null) {
        await this.validarOrdenTrabajoAbierta(tx, usuario.empresaId, ordenTrabajoId);
      }
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
          ordenTrabajoId,
          ordenProduccionId: dto.ordenProduccionId ?? null,
          solicitanteId: usuario.id,
          destino: dto.destino,
          estado: "BORRADOR",
          observaciones: dto.observaciones ?? null,
          // Textos ya recortados: vacio equivale a no informado.
          comprobanteFisico: dto.comprobanteFisico || null,
          entregadoA: dto.entregadoA || null,
          lineas: {
            create: lineasControl.map((l) => ({
              empresaId: usuario.empresaId,
              skuId: l.skuId,
              cantidad: l.cantidad,
              observacion: l.observacion ?? null,
            })),
          },
        },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "CREAR",
          entidad: "VALE_SALIDA",
          entidadId: vale.id,
          detalle: vale.comprobanteFisico
            ? `Vale de salida N° ${vale.numero} creado (comprobante fisico ${vale.comprobanteFisico})`
            : `Vale de salida N° ${vale.numero} creado`,
        },
        tx,
      );
      return vale.id;
    });

    return { id: id.toString() };
  }

  /**
   * Valida la orden de produccion del vale (si se informa) dentro de la
   * transaccion de creacion y resuelve la orden de trabajo a imputar: la del
   * DTO o, si no viene, la heredada de la orden de produccion.
   */
  private async validarOrdenProduccion(
    tx: Prisma.TransactionClient,
    empresaId: bigint,
    ordenProduccionId: bigint | undefined,
    ordenTrabajoId: bigint | undefined,
  ): Promise<bigint | null> {
    if (ordenProduccionId === undefined) return ordenTrabajoId ?? null;
    const orden = await tx.ordenProduccion.findFirst({
      where: { id: ordenProduccionId, empresaId },
    });
    if (!orden) throw new NotFoundException("Orden de producción no encontrada");
    if (!ESTADOS_ORDEN_PRODUCCION_ACTIVOS.includes(orden.estado)) {
      throw new BadRequestException("La orden de producción no admite nuevos vales");
    }
    if (
      ordenTrabajoId !== undefined &&
      orden.ordenTrabajoId !== null &&
      orden.ordenTrabajoId !== ordenTrabajoId
    ) {
      throw new BadRequestException(
        "La orden de trabajo no coincide con la de la orden de producción",
      );
    }
    return ordenTrabajoId ?? orden.ordenTrabajoId;
  }

  /** Verifica que la orden de trabajo sea de la empresa y este ABIERTA. */
  private async validarOrdenTrabajoAbierta(
    tx: Prisma.TransactionClient,
    empresaId: bigint,
    ordenTrabajoId: bigint,
  ) {
    const orden = await tx.ordenTrabajo.findFirst({
      where: { id: ordenTrabajoId, empresaId },
    });
    if (!orden) throw new NotFoundException("Orden de trabajo no encontrada");
    if (orden.estado !== "ABIERTA") {
      throw new BadRequestException(
        "No se puede imputar un vale a una orden de trabajo cerrada",
      );
    }
  }

  /** BORRADOR -> AUTORIZADO. Deja constancia del autorizador (segregacion). */
  async autorizar(usuario: UsuarioRequest, id: bigint) {
    const vale = await this.cargar(usuario.empresaId, id);
    if (vale.estado !== "BORRADOR") {
      throw new BadRequestException(`El vale esta ${vale.estado}`);
    }
    // Segregacion de funciones: quien solicita no puede autorizar su propio vale.
    if (vale.solicitanteId === usuario.id) {
      throw new ForbiddenException(
        "No puedes autorizar un vale que tu mismo solicitaste (segregacion de funciones).",
      );
    }
    // CAS + auditoria en UNA transaccion: la traza es atomica con la transicion
    // (AUTORIZAR es accion de gobierno, no puede quedar sin rastro). El CAS sobre
    // estado=BORRADOR aborta si otra peticion ya lo autorizo/anulo.
    await this.prisma.$transaction(async (tx) => {
      const actualizados = await tx.valeSalida.updateMany({
        where: { id: vale.id, estado: "BORRADOR" },
        data: { estado: "AUTORIZADO", autorizadoPorId: usuario.id },
      });
      if (actualizados.count === 0) {
        throw new ConflictException("El vale ya no esta en BORRADOR");
      }
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "AUTORIZAR",
          entidad: "VALE_SALIDA",
          entidadId: vale.id,
          detalle: `Vale de salida N° ${vale.numero} autorizado`,
        },
        tx,
      );
    });
    return { id: id.toString(), estado: "AUTORIZADO" };
  }

  /**
   * AUTORIZADO -> DESPACHADO. Por cada linea genera la salida REAL en el ledger
   * (consumo FIFO, valida stock). Todo dentro de una transaccion: si falta
   * stock en cualquier linea, la operacion completa revierte.
   * `entregadoA`, si se informa, reemplaza al registrado al crear el vale.
   */
  async despachar(
    usuario: UsuarioRequest,
    id: bigint,
    seriesPorSku: Map<string, string[]> = new Map(),
    entregadoA?: string,
  ) {
    const vale = await this.cargar(usuario.empresaId, id);
    if (vale.estado !== "AUTORIZADO") {
      throw new BadRequestException(
        `El vale debe estar AUTORIZADO para despachar (esta ${vale.estado})`,
      );
    }
    // Segregacion de funciones: quien solicita no puede despachar su propio vale.
    if (vale.solicitanteId === usuario.id) {
      throw new ForbiddenException(
        "No puedes despachar un vale que tu mismo solicitaste (segregacion de funciones).",
      );
    }

    const receptor = entregadoA || vale.entregadoA;
    await this.prisma.$transaction(async (tx) => {
      // Si el vale consume para una orden de produccion, bloquea la orden antes
      // de mover stock: un cierre o anulacion concurrente espera a este despacho
      // (o este despacho ve el nuevo estado y aborta).
      if (vale.ordenProduccionId !== null) {
        await this.bloquearOrdenProduccion(tx, vale.ordenProduccionId);
      }
      // CAS sobre el estado al inicio de la transaccion: marca DESPACHADO solo si
      // SIGUE AUTORIZADO. Si otra peticion despacho/anulo el vale entre el read y
      // esta transaccion, afecta 0 filas -> conflicto y se revierte (sin doble
      // despacho ni salidas duplicadas en el ledger). El estado se actualiza
      // primero (no al final) para cerrar la ventana de carrera.
      const tomado = await tx.valeSalida.updateMany({
        where: { id: vale.id, estado: "AUTORIZADO" },
        data: { estado: "DESPACHADO", ...(entregadoA ? { entregadoA } : {}) },
      });
      if (tomado.count === 0) {
        throw new ConflictException("El vale ya no esta AUTORIZADO para despachar");
      }
      for (const linea of vale.lineas) {
        const { movimientoId } = await this.movimientos.salidaPorVale(usuario, tx, {
          skuId: linea.skuId,
          almacenId: vale.almacenId,
          cantidad: linea.cantidad.toString(),
          documentoId: vale.id,
          observaciones: `Vale de salida ${vale.numero} - ${vale.destino}`,
          numerosSerie: seriesPorSku.get(linea.skuId.toString()),
        });
        await tx.valeSalidaLinea.update({
          where: { id: linea.id },
          data: { cantidadDespachada: linea.cantidad, movimientoStockId: movimientoId },
        });
      }
      // El primer despacho inicia la produccion. Si la orden ya estaba EN_PROCESO
      // no afecta filas, y es correcto (no es un conflicto).
      if (vale.ordenProduccionId !== null) {
        await tx.ordenProduccion.updateMany({
          where: { id: vale.ordenProduccionId, estado: "PLANIFICADA" },
          data: { estado: "EN_PROCESO" },
        });
      }
      // El estado DESPACHADO ya quedo fijado por el CAS al inicio de la transaccion.
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "DESPACHAR",
          entidad: "VALE_SALIDA",
          entidadId: vale.id,
          detalle: receptor
            ? `Vale de salida N° ${vale.numero} despachado, entregado a ${receptor}`
            : `Vale de salida N° ${vale.numero} despachado`,
        },
        tx,
      );
    });

    return { id: id.toString(), estado: "DESPACHADO" };
  }

  /**
   * Toma un bloqueo de fila sobre la orden de produccion y verifica, ya con el
   * bloqueo, que siga admitiendo despachos.
   */
  private async bloquearOrdenProduccion(tx: Prisma.TransactionClient, id: bigint) {
    await tx.$queryRaw`SELECT id FROM orden_produccion WHERE id = ${id} FOR UPDATE`;
    const orden = await tx.ordenProduccion.findUnique({
      where: { id },
      select: { estado: true },
    });
    if (!orden || !ESTADOS_ORDEN_PRODUCCION_ACTIVOS.includes(orden.estado)) {
      throw new ConflictException("La orden de producción ya no admite despachos");
    }
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
    // CAS (solo BORRADOR/AUTORIZADO) + auditoria en UNA transaccion: traza atomica
    // con la anulacion y sin carrera contra un despacho concurrente.
    await this.prisma.$transaction(async (tx) => {
      const actualizados = await tx.valeSalida.updateMany({
        where: { id: vale.id, estado: { in: ["BORRADOR", "AUTORIZADO"] } },
        data: { estado: "ANULADO" },
      });
      if (actualizados.count === 0) {
        throw new ConflictException("El vale ya no se puede anular");
      }
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "ANULAR",
          entidad: "VALE_SALIDA",
          entidadId: vale.id,
          detalle: `Vale de salida N° ${vale.numero} anulado`,
        },
        tx,
      );
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
