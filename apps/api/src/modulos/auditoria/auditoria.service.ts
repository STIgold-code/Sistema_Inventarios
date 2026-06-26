import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

/** Datos minimos para registrar una accion en la bitacora de auditoria. */
export interface DatosAuditoria {
  empresaId: bigint;
  usuarioId: bigint;
  accion: string;
  entidad: string;
  entidadId?: bigint;
  detalle?: string;
}

/** Filtros opcionales para consultar la bitacora de auditoria. */
export interface FiltrosAuditoria {
  entidad?: string;
  entidadId?: bigint;
  usuarioId?: bigint;
  accion?: string;
  desde?: Date;
  hasta?: Date;
  pagina?: number;
  porPagina?: number;
}

const POR_PAGINA_DEFECTO = 50;
const POR_PAGINA_MAXIMO = 200;

/**
 * Bitacora append-only de acciones de gobierno. La politica de fallo depende de
 * si la traza es parte de una transaccion:
 * - SIN `tx` (best-effort): un fallo de auditoria no debe tumbar la operacion
 *   ya commiteada que la origino; se loguea y se ignora.
 * - CON `tx` (atomica): la traza es parte de la operacion auditada; si falla,
 *   la excepcion se propaga para abortar TODO (no se commitea una accion de
 *   gobierno sin su registro).
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una accion en la bitacora. Con `tx` la escritura es atomica con la
   * operacion: si falla, la excepcion se propaga y aborta la transaccion (no se
   * puede commitear una accion sin su traza). Sin `tx` es best-effort: un fallo
   * se loguea y se ignora para no tumbar una operacion ya commiteada.
   */
  async registrar(
    datos: DatosAuditoria,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const data = {
      empresaId: datos.empresaId,
      usuarioId: datos.usuarioId,
      accion: datos.accion,
      entidad: datos.entidad,
      entidadId: datos.entidadId,
      detalle: datos.detalle,
    };

    // Dentro de una transaccion: la traza es parte de la operacion. NO se traga
    // la excepcion; debe abortar todo si la auditoria falla.
    if (tx) {
      await tx.registroAuditoria.create({ data });
      return;
    }

    // Sin transaccion: best-effort, no debe romper la operacion ya hecha.
    try {
      await this.prisma.registroAuditoria.create({ data });
    } catch (error: unknown) {
      this.logger.error(
        `No se pudo registrar auditoria (${datos.entidad}/${datos.accion}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Lista la bitacora con filtros y paginacion, mas reciente primero. */
  async listar(empresaId: bigint, filtros: FiltrosAuditoria) {
    const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1;
    const porPagina = Math.min(
      filtros.porPagina && filtros.porPagina > 0
        ? filtros.porPagina
        : POR_PAGINA_DEFECTO,
      POR_PAGINA_MAXIMO,
    );

    const where: Prisma.RegistroAuditoriaWhereInput = {
      empresaId,
      ...(filtros.entidad ? { entidad: filtros.entidad } : {}),
      ...(filtros.entidadId !== undefined
        ? { entidadId: filtros.entidadId }
        : {}),
      ...(filtros.usuarioId !== undefined
        ? { usuarioId: filtros.usuarioId }
        : {}),
      ...(filtros.accion ? { accion: filtros.accion } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            creadoEn: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lte: filtros.hasta } : {}),
            },
          }
        : {}),
    };

    const [registros, total] = await this.prisma.$transaction([
      this.prisma.registroAuditoria.findMany({
        where,
        orderBy: { creadoEn: "desc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
        include: { usuario: { select: { id: true, nombre: true } } },
      }),
      this.prisma.registroAuditoria.count({ where }),
    ]);

    return {
      datos: registros.map((r) => ({
        id: r.id.toString(),
        accion: r.accion,
        entidad: r.entidad,
        entidadId: r.entidadId !== null ? r.entidadId.toString() : null,
        detalle: r.detalle,
        creadoEn: r.creadoEn.toISOString(),
        usuario: { id: r.usuario.id.toString(), nombre: r.usuario.nombre },
      })),
      total,
      pagina,
      porPagina,
    };
  }
}
