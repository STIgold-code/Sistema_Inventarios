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
 * Bitacora append-only de acciones de gobierno. El registro NUNCA debe tumbar
 * la operacion de negocio: si su escritura falla, se loguea y se ignora (no se
 * propaga la excepcion). Por eso `registrar` retorna void y captura sus errores.
 */
@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra una accion en la bitacora. Si recibe `tx`, escribe dentro de esa
   * transaccion; si no, usa el cliente Prisma directo. Nunca lanza: un fallo de
   * auditoria no debe revertir ni tumbar la venta/compra/etc. que la origino.
   */
  async registrar(
    datos: DatosAuditoria,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const cliente = tx ?? this.prisma;
    try {
      await cliente.registroAuditoria.create({
        data: {
          empresaId: datos.empresaId,
          usuarioId: datos.usuarioId,
          accion: datos.accion,
          entidad: datos.entidad,
          entidadId: datos.entidadId,
          detalle: datos.detalle,
        },
      });
    } catch (error: unknown) {
      // La auditoria es best-effort: nunca debe propagar y romper el negocio.
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
