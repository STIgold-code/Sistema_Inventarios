import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  EstadoOrdenProduccion,
  EstadoValeSalida,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";
import { ValesService } from "../vales/vales.service.js";
import { cargarSkuRefs, referenciaSku, type SkuRef } from "./sku-ref.js";

const D = Prisma.Decimal;

const ENTIDAD_AUDITORIA = "ORDEN_PRODUCCION";

/** Estados de la orden que admiten nuevos vales (misma regla que vales.service). */
const ESTADOS_ADMITEN_VALES: readonly EstadoOrdenProduccion[] = [
  "PLANIFICADA",
  "EN_PROCESO",
];

/** Estados de vale cuya cantidad todavía no llegó al ledger. */
const ESTADOS_VALE_EN_CURSO: readonly EstadoValeSalida[] = ["BORRADOR", "AUTORIZADO"];

export interface NuevaOrdenProduccion {
  formulaId: bigint;
  cantidadPlanificada: string;
  almacenInsumosId: bigint;
  almacenDestinoId: bigint;
  centroCostoId: bigint;
  ordenTrabajoId?: bigint;
  observaciones?: string;
}

export interface ConsumoOrden {
  lineas: Array<{
    skuInsumo: SkuRef;
    cantidadPlanificada: string;
    cantidadEnCurso: string;
    cantidadConsumida: string;
    cantidadPendiente: string;
    costoConsumido: string;
  }>;
  fueraDeFormula: Array<{
    skuInsumo: SkuRef;
    cantidadConsumida: string;
    costoConsumido: string;
  }>;
  costoTotalConsumido: string;
}

/** Consumo más los datos que necesita el cierre de la orden. */
export type ConsumoCalculado = ConsumoOrden & {
  idsValesDespachados: bigint[];
  hayValesEnCurso: boolean;
};

interface OrdenProduccionCabecera {
  id: string;
  numero: string;
  estado: EstadoOrdenProduccion;
  formula: { id: string; codigo: string; nombre: string };
  skuTerminado: SkuRef;
  cantidadPlanificada: string;
  cantidadProducida: string | null;
  almacenInsumos: { id: string; nombre: string };
  almacenDestino: { id: string; nombre: string };
  centroCosto: { id: string; nombre: string };
  ordenTrabajo: { id: string; numero: string } | null;
  costoTotalInsumos: string | null;
  costoUnitarioTerminado: string | null;
  movimientoEntradaId: string | null;
  fechaEmision: string;
  fechaCierre: string | null;
  observaciones: string | null;
}

export interface OrdenProduccionResumen extends OrdenProduccionCabecera {
  cantidadLineas: number;
}

export interface OrdenProduccionDetalle extends OrdenProduccionCabecera {
  consumo: ConsumoOrden;
  vales: Array<{ id: string; numero: string; estado: EstadoValeSalida }>;
}

export interface FiltroOrdenesProduccion {
  estado?: EstadoOrdenProduccion;
}

/** Relaciones que necesita la cabecera de la orden. */
const INCLUDE_CABECERA = {
  formula: { select: { id: true, codigo: true, nombre: true } },
  almacenInsumos: { select: { id: true, nombre: true } },
  almacenDestino: { select: { id: true, nombre: true } },
  centroCosto: { select: { id: true, nombre: true } },
  ordenTrabajo: { select: { id: true, numero: true } },
} satisfies Prisma.OrdenProduccionInclude;

type OrdenConCabecera = Prisma.OrdenProduccionGetPayload<{
  include: typeof INCLUDE_CABECERA;
}>;

@Injectable()
export class OrdenesProduccionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativos: CorrelativoService,
    private readonly auditoria: AuditoriaService,
    private readonly vales: ValesService,
  ) {}

  /** Lista las órdenes de la empresa, la más reciente primero. */
  async listar(
    empresaId: bigint,
    filtro: FiltroOrdenesProduccion = {},
  ): Promise<OrdenProduccionResumen[]> {
    const filas = await this.prisma.ordenProduccion.findMany({
      where: {
        empresaId,
        ...(filtro.estado !== undefined ? { estado: filtro.estado } : {}),
      },
      include: { ...INCLUDE_CABECERA, _count: { select: { lineas: true } } },
      orderBy: [{ fechaEmision: "desc" }, { id: "desc" }],
    });
    const skus = await cargarSkuRefs(
      this.prisma,
      empresaId,
      filas.map((o) => o.skuTerminadoId),
    );
    return filas.map((o) => ({
      ...this.mapearCabecera(o, skus),
      cantidadLineas: o._count.lineas,
    }));
  }

  /**
   * Obtiene la orden con su consumo leído del ledger y sus vales.
   * 404 si no pertenece a la empresa.
   */
  async obtener(empresaId: bigint, id: bigint): Promise<OrdenProduccionDetalle> {
    const orden = await this.prisma.ordenProduccion.findFirst({
      where: { id, empresaId },
      include: {
        ...INCLUDE_CABECERA,
        valesSalida: {
          select: { id: true, numero: true, estado: true },
          orderBy: { id: "asc" },
        },
      },
    });
    if (!orden) throw new NotFoundException("Orden de producción no encontrada");

    const skus = await cargarSkuRefs(this.prisma, empresaId, [orden.skuTerminadoId]);
    const consumo = await this.calcularConsumo(this.prisma, empresaId, orden.id);
    return {
      ...this.mapearCabecera(orden, skus),
      consumo: {
        lineas: consumo.lineas,
        fueraDeFormula: consumo.fueraDeFormula,
        costoTotalConsumido: consumo.costoTotalConsumido,
      },
      vales: orden.valesSalida.map((v) => ({
        id: v.id.toString(),
        numero: v.numero,
        estado: v.estado,
      })),
    };
  }

  /**
   * Crea la orden PLANIFICADA explotando y congelando la fórmula. Validación,
   * correlativo, orden con sus líneas y auditoría van en una sola transacción;
   * la validación corre ANTES de tomar el correlativo para no consumir números
   * en un rechazo.
   */
  async crear(
    usuario: UsuarioRequest,
    datos: NuevaOrdenProduccion,
  ): Promise<{ id: string; numero: string }> {
    const empresaId = usuario.empresaId;
    const planificada = new D(datos.cantidadPlanificada);

    const orden = await this.prisma.$transaction(async (tx) => {
      const formula = await tx.formula.findFirst({
        where: { id: datos.formulaId, empresaId },
        include: { lineas: { orderBy: { id: "asc" } } },
      });
      if (!formula) throw new NotFoundException("Fórmula no encontrada");
      if (!formula.activo) {
        throw new BadRequestException("La fórmula está dada de baja");
      }
      await this.validarSkuTerminado(tx, empresaId, formula.skuTerminadoId);
      await this.validarReferencias(tx, empresaId, datos);

      const lineas = formula.lineas.map((l) => ({
        empresaId,
        skuInsumoId: l.skuInsumoId,
        cantidadPlanificada: new D(l.cantidad)
          .mul(planificada)
          .div(formula.cantidadBase)
          .toDecimalPlaces(8),
      }));
      await this.validarLineasNoNulas(tx, empresaId, lineas);

      const correlativo = await this.correlativos.siguiente(
        tx,
        empresaId,
        "ORDEN_PRODUCCION",
      );
      const creada = await tx.ordenProduccion.create({
        data: {
          empresaId,
          numero: correlativo.formateado,
          formulaId: formula.id,
          skuTerminadoId: formula.skuTerminadoId,
          cantidadPlanificada: planificada,
          almacenInsumosId: datos.almacenInsumosId,
          almacenDestinoId: datos.almacenDestinoId,
          centroCostoId: datos.centroCostoId,
          ordenTrabajoId: datos.ordenTrabajoId ?? null,
          observaciones: datos.observaciones ?? null,
          usuarioId: usuario.id,
          lineas: { create: lineas },
        },
      });
      await this.auditoria.registrar(
        {
          empresaId,
          usuarioId: usuario.id,
          accion: "CREAR",
          entidad: ENTIDAD_AUDITORIA,
          entidadId: creada.id,
          detalle: `Orden de producción ${creada.numero} creada con la fórmula ${formula.codigo}`,
        },
        tx,
      );
      return creada;
    });

    return { id: orden.id.toString(), numero: orden.numero };
  }

  /**
   * Genera un vale de salida en BORRADOR con los insumos pendientes de
   * entregar. No va dentro de una transacción externa: `ValesService.crear`
   * abre la suya y revalida la orden dentro de ella.
   */
  async generarVale(usuario: UsuarioRequest, id: bigint): Promise<{ valeId: string }> {
    const empresaId = usuario.empresaId;
    const orden = await this.prisma.ordenProduccion.findFirst({
      where: { id, empresaId },
    });
    if (!orden) throw new NotFoundException("Orden de producción no encontrada");
    if (!ESTADOS_ADMITEN_VALES.includes(orden.estado)) {
      throw new BadRequestException("La orden de producción no admite nuevos vales");
    }

    const consumo = await this.calcularConsumo(this.prisma, empresaId, orden.id);
    const pendientes = consumo.lineas.filter((l) => new D(l.cantidadPendiente).gt(0));
    if (pendientes.length === 0) {
      throw new BadRequestException("No hay insumos pendientes de entregar");
    }

    // Las cantidades de la fórmula ya están en la unidad de control del SKU.
    const { id: valeId } = await this.vales.crear(usuario, {
      almacenId: orden.almacenInsumosId,
      centroCostoId: orden.centroCostoId,
      ordenTrabajoId: orden.ordenTrabajoId ?? undefined,
      ordenProduccionId: orden.id,
      destino: `Orden de producción ${orden.numero}`,
      lineas: pendientes.map((l) => ({
        skuId: BigInt(l.skuInsumo.id),
        cantidad: l.cantidadPendiente,
      })),
    });

    const vale = await this.prisma.valeSalida.findFirst({
      where: { id: BigInt(valeId), empresaId },
      select: { numero: true },
    });
    // Sin `tx`: la traza CREAR del vale ya es atómica con el vale; esta es
    // complementaria (best-effort).
    await this.auditoria.registrar({
      empresaId,
      usuarioId: usuario.id,
      accion: "GENERAR_VALE",
      entidad: ENTIDAD_AUDITORIA,
      entidadId: orden.id,
      detalle: `Vale de salida N° ${vale?.numero ?? valeId} (id ${valeId}) generado para la orden de producción ${orden.numero}`,
    });

    return { valeId };
  }

  /**
   * PLANIFICADA -> ANULADA. Bloquea la fila de la orden (FOR UPDATE, el mismo
   * bloqueo que toma el despacho de un vale), valida estado y vales vinculados,
   * y aplica el CAS con su auditoría en la misma transacción.
   */
  async anular(usuario: UsuarioRequest, id: bigint): Promise<{ id: string }> {
    const empresaId = usuario.empresaId;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orden_produccion WHERE id = ${id} AND empresa_id = ${empresaId} FOR UPDATE`;
      const orden = await tx.ordenProduccion.findFirst({
        where: { id, empresaId },
        select: { id: true, numero: true, estado: true },
      });
      if (!orden) throw new NotFoundException("Orden de producción no encontrada");
      if (orden.estado !== "PLANIFICADA") {
        throw new ConflictException("Solo se puede anular una orden planificada");
      }
      const valeVinculado = await tx.valeSalida.findFirst({
        where: { empresaId, ordenProduccionId: orden.id, estado: { not: "ANULADO" } },
        select: { id: true },
      });
      if (valeVinculado) {
        throw new BadRequestException("La orden tiene vales vinculados");
      }

      const actualizadas = await tx.ordenProduccion.updateMany({
        where: { id: orden.id, empresaId, estado: "PLANIFICADA" },
        data: { estado: "ANULADA" },
      });
      if (actualizadas.count === 0) {
        throw new ConflictException("Solo se puede anular una orden planificada");
      }
      await this.auditoria.registrar(
        {
          empresaId,
          usuarioId: usuario.id,
          accion: "ANULAR",
          entidad: ENTIDAD_AUDITORIA,
          entidadId: orden.id,
          detalle: `Orden de producción ${orden.numero} anulada`,
        },
        tx,
      );
    });
    return { id: id.toString() };
  }

  /**
   * Consumo de la orden leído del ledger. Consumido y costo por SKU salen de
   * las salidas de los vales DESPACHADO (costo tal como se registró en el
   * kardex); en curso es lo pedido en vales BORRADOR/AUTORIZADO; pendiente =
   * planificada − consumida − en curso, nunca negativa. Los SKU consumidos que
   * no están en la orden se informan en `fueraDeFormula` y suman al costo total.
   * Reutilizado por el cierre de la orden.
   */
  private async calcularConsumo(
    db: Prisma.TransactionClient | PrismaService,
    empresaId: bigint,
    ordenId: bigint,
  ): Promise<ConsumoCalculado> {
    const cliente: Prisma.TransactionClient = db;
    const lineas = await cliente.ordenProduccionLinea.findMany({
      where: { empresaId, ordenProduccionId: ordenId },
      orderBy: { id: "asc" },
    });
    const vales = await cliente.valeSalida.findMany({
      where: { empresaId, ordenProduccionId: ordenId },
      select: { id: true, estado: true },
    });
    const idsValesDespachados = vales
      .filter((v) => v.estado === "DESPACHADO")
      .map((v) => v.id);
    const idsValesEnCurso = vales
      .filter((v) => ESTADOS_VALE_EN_CURSO.includes(v.estado))
      .map((v) => v.id);

    const consumos =
      idsValesDespachados.length === 0
        ? []
        : await cliente.movimientoStock.groupBy({
            by: ["skuId"],
            where: {
              empresaId,
              documentoTipo: "VALE_SALIDA",
              documentoId: { in: idsValesDespachados },
            },
            _sum: { cantidad: true, costoTotal: true },
            orderBy: { skuId: "asc" },
          });
    const enCurso =
      idsValesEnCurso.length === 0
        ? []
        : await cliente.valeSalidaLinea.groupBy({
            by: ["skuId"],
            where: { empresaId, valeSalidaId: { in: idsValesEnCurso } },
            _sum: { cantidad: true },
            orderBy: { skuId: "asc" },
          });

    const consumoPorSku = new Map(
      consumos.map((c) => [
        c.skuId.toString(),
        {
          cantidad: new D(c._sum.cantidad ?? 0),
          costo: new D(c._sum.costoTotal ?? 0),
        },
      ]),
    );
    const enCursoPorSku = new Map(
      enCurso.map((e) => [e.skuId.toString(), new D(e._sum.cantidad ?? 0)]),
    );
    const skusDeLaOrden = new Set(lineas.map((l) => l.skuInsumoId.toString()));
    const fuera = consumos.filter((c) => !skusDeLaOrden.has(c.skuId.toString()));

    const skus = await cargarSkuRefs(cliente, empresaId, [
      ...lineas.map((l) => l.skuInsumoId),
      ...fuera.map((c) => c.skuId),
    ]);

    const cero = new D(0);
    const costoTotal = consumos.reduce(
      (total, c) => total.plus(c._sum.costoTotal ?? 0),
      cero,
    );

    return {
      lineas: lineas.map((l) => {
        const clave = l.skuInsumoId.toString();
        const consumida = consumoPorSku.get(clave)?.cantidad ?? cero;
        const costo = consumoPorSku.get(clave)?.costo ?? cero;
        const enCursoSku = enCursoPorSku.get(clave) ?? cero;
        const pendiente = D.max(
          cero,
          l.cantidadPlanificada.minus(consumida).minus(enCursoSku),
        );
        return {
          skuInsumo: referenciaSku(l.skuInsumoId, skus),
          cantidadPlanificada: l.cantidadPlanificada.toString(),
          cantidadEnCurso: enCursoSku.toString(),
          cantidadConsumida: consumida.toString(),
          cantidadPendiente: pendiente.toString(),
          costoConsumido: costo.toFixed(2),
        };
      }),
      fueraDeFormula: fuera.map((c) => ({
        skuInsumo: referenciaSku(c.skuId, skus),
        cantidadConsumida: new D(c._sum.cantidad ?? 0).toString(),
        costoConsumido: new D(c._sum.costoTotal ?? 0).toFixed(2),
      })),
      costoTotalConsumido: costoTotal.toFixed(2),
      idsValesDespachados,
      hayValesEnCurso: idsValesEnCurso.length > 0,
    };
  }

  /** El SKU terminado de la fórmula debe seguir activo (400 si no). */
  private async validarSkuTerminado(
    tx: Prisma.TransactionClient,
    empresaId: bigint,
    skuTerminadoId: bigint,
  ): Promise<void> {
    const sku = await tx.sku.findFirst({
      where: { id: skuTerminadoId, empresaId },
      select: { codigoParlante: true, activo: true },
    });
    if (!sku) throw new NotFoundException("SKU no encontrado");
    if (!sku.activo) {
      throw new BadRequestException(`El SKU ${sku.codigoParlante} está inactivo`);
    }
  }

  /**
   * Almacenes, centro de costo y OT deben pertenecer a la empresa (anti-IDOR:
   * 404 si no). La OT, si se informa, debe estar ABIERTA (misma regla que el
   * vale de salida, que heredará esta OT).
   */
  private async validarReferencias(
    tx: Prisma.TransactionClient,
    empresaId: bigint,
    datos: NuevaOrdenProduccion,
  ): Promise<void> {
    const almacenInsumos = await tx.almacen.findFirst({
      where: { id: datos.almacenInsumosId, empresaId },
      select: { id: true },
    });
    if (!almacenInsumos) throw new NotFoundException("Almacén de insumos no encontrado");

    const almacenDestino = await tx.almacen.findFirst({
      where: { id: datos.almacenDestinoId, empresaId },
      select: { id: true },
    });
    if (!almacenDestino) throw new NotFoundException("Almacén de destino no encontrado");

    const centro = await tx.centroCosto.findFirst({
      where: { id: datos.centroCostoId, empresaId },
      select: { id: true },
    });
    if (!centro) throw new NotFoundException("Centro de costo no encontrado");

    if (datos.ordenTrabajoId === undefined) return;
    const ot = await tx.ordenTrabajo.findFirst({
      where: { id: datos.ordenTrabajoId, empresaId },
      select: { estado: true },
    });
    if (!ot) throw new NotFoundException("Orden de trabajo no encontrada");
    if (ot.estado !== "ABIERTA") {
      throw new BadRequestException(
        "No se puede vincular la orden de producción a una orden de trabajo cerrada",
      );
    }
  }

  /**
   * Ninguna línea explotada puede quedar en cero tras redondear a 8 decimales
   * (receta con una proporción demasiado pequeña para la cantidad planificada).
   */
  private async validarLineasNoNulas(
    tx: Prisma.TransactionClient,
    empresaId: bigint,
    lineas: Array<{ skuInsumoId: bigint; cantidadPlanificada: Prisma.Decimal }>,
  ): Promise<void> {
    const nula = lineas.find((l) => l.cantidadPlanificada.isZero());
    if (!nula) return;
    const sku = await tx.sku.findFirst({
      where: { id: nula.skuInsumoId, empresaId },
      select: { codigoParlante: true },
    });
    throw new BadRequestException(
      `La cantidad planificada es demasiado pequeña para el insumo ${
        sku?.codigoParlante ?? nula.skuInsumoId.toString()
      }`,
    );
  }

  private mapearCabecera(
    o: OrdenConCabecera,
    skus: Map<string, SkuRef>,
  ): OrdenProduccionCabecera {
    return {
      id: o.id.toString(),
      numero: o.numero,
      estado: o.estado,
      formula: {
        id: o.formula.id.toString(),
        codigo: o.formula.codigo,
        nombre: o.formula.nombre,
      },
      skuTerminado: referenciaSku(o.skuTerminadoId, skus),
      cantidadPlanificada: o.cantidadPlanificada.toString(),
      cantidadProducida:
        o.cantidadProducida !== null ? o.cantidadProducida.toString() : null,
      almacenInsumos: {
        id: o.almacenInsumos.id.toString(),
        nombre: o.almacenInsumos.nombre,
      },
      almacenDestino: {
        id: o.almacenDestino.id.toString(),
        nombre: o.almacenDestino.nombre,
      },
      centroCosto: { id: o.centroCosto.id.toString(), nombre: o.centroCosto.nombre },
      ordenTrabajo: o.ordenTrabajo
        ? { id: o.ordenTrabajo.id.toString(), numero: o.ordenTrabajo.numero }
        : null,
      costoTotalInsumos:
        o.costoTotalInsumos !== null ? o.costoTotalInsumos.toFixed(2) : null,
      costoUnitarioTerminado:
        o.costoUnitarioTerminado !== null ? o.costoUnitarioTerminado.toString() : null,
      movimientoEntradaId:
        o.movimientoEntradaId !== null ? o.movimientoEntradaId.toString() : null,
      fechaEmision: o.fechaEmision.toISOString(),
      fechaCierre: o.fechaCierre ? o.fechaCierre.toISOString() : null,
      observaciones: o.observaciones,
    };
  }
}
