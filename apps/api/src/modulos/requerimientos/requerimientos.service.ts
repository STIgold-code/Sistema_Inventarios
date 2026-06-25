import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";

interface NuevoRequerimiento {
  centroCostoId: bigint;
  observaciones?: string;
  lineas: Array<{ skuId: bigint; cantidad: string; justificacion?: string }>;
}

@Injectable()
export class RequerimientosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativos: CorrelativoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(empresaId: bigint) {
    const filas = await this.prisma.requerimientoCompra.findMany({
      where: { empresaId },
      include: { centroCosto: true, solicitante: true, lineas: true },
      orderBy: { fecha: "desc" },
    });
    const skuIds = [...new Set(filas.flatMap((r) => r.lineas.map((l) => l.skuId)))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId },
      select: { id: true, codigoParlante: true, nombre: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id.toString(), s]));
    return filas.map((r) => ({
      id: r.id.toString(),
      numero: r.numero,
      fecha: r.fecha.toISOString(),
      estado: r.estado,
      centroCostoId: r.centroCostoId.toString(),
      centroCosto: r.centroCosto.nombre,
      solicitanteId: r.solicitanteId.toString(),
      solicitante: r.solicitante.nombre,
      aprobadoPorId: r.aprobadoPorId ? r.aprobadoPorId.toString() : null,
      observaciones: r.observaciones,
      lineas: r.lineas.map((l) => {
        const sku = skuPorId.get(l.skuId.toString());
        return {
          id: l.id.toString(),
          skuId: l.skuId.toString(),
          skuCodigo: sku ? sku.codigoParlante : null,
          skuNombre: sku ? sku.nombre : null,
          cantidad: l.cantidad.toString(),
          justificacion: l.justificacion,
        };
      }),
    }));
  }

  /** Devuelve UN requerimiento con todo su detalle para impresion. */
  async obtener(empresaId: bigint, id: bigint) {
    const r = await this.prisma.requerimientoCompra.findFirst({
      where: { id, empresaId },
      include: {
        centroCosto: true,
        solicitante: true,
        aprobadoPor: true,
        lineas: true,
      },
    });
    if (!r) throw new NotFoundException("Requerimiento no encontrado");

    const skuIds = [...new Set(r.lineas.map((l) => l.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId },
      select: { id: true, codigoParlante: true, nombre: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id.toString(), s]));

    return {
      id: r.id.toString(),
      numero: r.numero,
      fecha: r.fecha.toISOString(),
      estado: r.estado,
      centroCostoId: r.centroCostoId.toString(),
      centroCosto: r.centroCosto.nombre,
      solicitanteId: r.solicitanteId.toString(),
      solicitante: r.solicitante.nombre,
      aprobadoPorId: r.aprobadoPorId ? r.aprobadoPorId.toString() : null,
      aprobadoPor: r.aprobadoPor ? r.aprobadoPor.nombre : null,
      observaciones: r.observaciones,
      lineas: r.lineas.map((l) => {
        const sku = skuPorId.get(l.skuId.toString());
        return {
          id: l.id.toString(),
          skuId: l.skuId.toString(),
          skuCodigo: sku ? sku.codigoParlante : null,
          skuNombre: sku ? sku.nombre : null,
          cantidad: l.cantidad.toString(),
          justificacion: l.justificacion,
        };
      }),
    };
  }

  /** Crea el requerimiento en BORRADOR. Valida que centro y skus sean de la empresa. */
  async crear(usuario: UsuarioRequest, dto: NuevoRequerimiento) {
    const centro = await this.prisma.centroCosto.findFirst({
      where: { id: dto.centroCostoId, empresaId: usuario.empresaId },
    });
    if (!centro) throw new NotFoundException("Centro de costo no encontrado");

    const skuIds = [...new Set(dto.lineas.map((l) => l.skuId))];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: skuIds }, empresaId: usuario.empresaId },
      select: { id: true },
    });
    if (skus.length !== skuIds.length) {
      throw new BadRequestException("Uno o mas SKU no pertenecen a la empresa");
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const correlativo = await this.correlativos.siguiente(
        tx,
        usuario.empresaId,
        "REQUERIMIENTO",
      );
      const req = await tx.requerimientoCompra.create({
        data: {
          empresaId: usuario.empresaId,
          numero: correlativo.formateado,
          centroCostoId: dto.centroCostoId,
          solicitanteId: usuario.id,
          estado: "BORRADOR",
          observaciones: dto.observaciones ?? null,
          lineas: {
            create: dto.lineas.map((l) => ({
              empresaId: usuario.empresaId,
              skuId: l.skuId,
              cantidad: l.cantidad,
              justificacion: l.justificacion ?? null,
            })),
          },
        },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "CREAR",
          entidad: "REQUERIMIENTO",
          entidadId: req.id,
          detalle: `Requerimiento N° ${req.numero} creado`,
        },
        tx,
      );
      return req.id;
    });

    return { id: id.toString() };
  }

  /** BORRADOR -> APROBADO, deja constancia del aprobador. */
  async aprobar(usuario: UsuarioRequest, id: bigint) {
    const req = await this.cargarBorrador(usuario.empresaId, id);
    await this.prisma.$transaction(async (tx) => {
      // CAS sobre el estado: solo aprueba si SIGUE en BORRADOR. Si otra peticion
      // ya lo aprobo/rechazo entre el read y este update, afecta 0 filas -> conflicto.
      const actualizados = await tx.requerimientoCompra.updateMany({
        where: { id: req.id, empresaId: usuario.empresaId, estado: "BORRADOR" },
        data: { estado: "APROBADO", aprobadoPorId: usuario.id },
      });
      if (actualizados.count === 0) {
        throw new ConflictException("El requerimiento ya no esta en BORRADOR");
      }
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "APROBAR",
          entidad: "REQUERIMIENTO",
          entidadId: req.id,
          detalle: `Requerimiento N° ${req.numero} aprobado`,
        },
        tx,
      );
    });
    return { id: id.toString(), estado: "APROBADO" };
  }

  /**
   * BORRADOR -> RECHAZADO. NO escribe aprobadoPorId: un rechazo no es una
   * aprobacion. La identidad de quien rechaza queda en el log de auditoria.
   */
  async rechazar(usuario: UsuarioRequest, id: bigint) {
    const req = await this.cargarBorrador(usuario.empresaId, id);
    await this.prisma.$transaction(async (tx) => {
      // CAS sobre el estado: solo rechaza si SIGUE en BORRADOR (anti doble-transicion).
      const actualizados = await tx.requerimientoCompra.updateMany({
        where: { id: req.id, empresaId: usuario.empresaId, estado: "BORRADOR" },
        data: { estado: "RECHAZADO" },
      });
      if (actualizados.count === 0) {
        throw new ConflictException("El requerimiento ya no esta en BORRADOR");
      }
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "RECHAZAR",
          entidad: "REQUERIMIENTO",
          entidadId: req.id,
          detalle: `Requerimiento N° ${req.numero} rechazado`,
        },
        tx,
      );
    });
    return { id: id.toString(), estado: "RECHAZADO" };
  }

  private async cargarBorrador(empresaId: bigint, id: bigint) {
    const req = await this.prisma.requerimientoCompra.findFirst({
      where: { id, empresaId },
    });
    if (!req) throw new NotFoundException("Requerimiento no encontrado");
    if (req.estado !== "BORRADOR") {
      throw new BadRequestException(`El requerimiento esta ${req.estado}`);
    }
    return req;
  }
}
