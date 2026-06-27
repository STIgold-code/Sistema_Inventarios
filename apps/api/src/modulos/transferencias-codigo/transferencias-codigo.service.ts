import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";

const D = Prisma.Decimal;

interface NuevaTransferenciaCodigo {
  almacenId: bigint;
  numero: string;
  observaciones?: string;
  lineas: Array<{
    skuOrigenId: bigint;
    skuDestinoId: bigint;
    cantidadOrigen: string;
    factorConversion: string;
  }>;
}

@Injectable()
export class TransferenciasCodigoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(usuario: UsuarioRequest, dto: NuevaTransferenciaCodigo) {
    const almacen = await this.prisma.almacen.findFirst({
      where: { id: dto.almacenId, empresaId: usuario.empresaId },
    });
    if (!almacen) throw new NotFoundException("Almacen no encontrado");

    // Validar SKUs (origen y destino) ∈ empresa y descartar serializados (v1).
    const idsSku = [
      ...new Set(dto.lineas.flatMap((l) => [l.skuOrigenId, l.skuDestinoId])),
    ];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: idsSku }, empresaId: usuario.empresaId },
      select: { id: true, controlaSerie: true },
    });
    if (skus.length !== idsSku.length) {
      throw new BadRequestException("Algún SKU no pertenece a la empresa.");
    }
    if (skus.some((s) => s.controlaSerie)) {
      throw new BadRequestException(
        "La transformación de SKUs serializados no está soportada.",
      );
    }
    for (const l of dto.lineas) {
      if (l.skuOrigenId === l.skuDestinoId) {
        throw new BadRequestException("El SKU origen y destino deben ser distintos.");
      }
      if (new D(l.factorConversion).lessThanOrEqualTo(0)) {
        throw new BadRequestException("El factor de conversión debe ser mayor a 0.");
      }
      if (new D(l.cantidadOrigen).lessThanOrEqualTo(0)) {
        throw new BadRequestException("La cantidad de origen debe ser mayor a 0.");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const transf = await tx.transferenciaCodigo.create({
        data: {
          empresaId: usuario.empresaId,
          numero: dto.numero,
          almacenId: dto.almacenId,
          observaciones: dto.observaciones ?? null,
          usuarioId: usuario.id,
        },
      });

      for (const l of dto.lineas) {
        const cantidadDestino = new D(l.cantidadOrigen).mul(new D(l.factorConversion));
        const salida = await this.movimientos.salidaPorTransformacionEnTx(usuario, tx, {
          skuId: l.skuOrigenId,
          almacenId: dto.almacenId,
          cantidad: l.cantidadOrigen,
          documentoId: transf.id,
        });
        const entrada = await this.movimientos.entradaPorTransformacionEnTx(usuario, tx, {
          skuId: l.skuDestinoId,
          almacenId: dto.almacenId,
          cantidadDestino: cantidadDestino.toString(),
          costoTotal: salida.costoTotal.toString(),
          documentoId: transf.id,
        });
        await tx.transferenciaCodigoLinea.create({
          data: {
            empresaId: usuario.empresaId,
            transferenciaId: transf.id,
            skuOrigenId: l.skuOrigenId,
            skuDestinoId: l.skuDestinoId,
            cantidadOrigen: l.cantidadOrigen,
            factorConversion: l.factorConversion,
            cantidadDestino,
            costoTotal: salida.costoTotal,
            movimientoSalidaId: salida.movimientoId,
            movimientoEntradaId: entrada.movimientoId,
          },
        });
      }

      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "TRANSFORMAR_CODIGO",
          entidad: "TRANSFERENCIA_CODIGO",
          entidadId: transf.id,
          detalle: `Transferencia de código ${transf.numero}`,
        },
        tx,
      );

      return { id: transf.id.toString(), numero: transf.numero };
    });
  }

  async listar(empresaId: bigint) {
    const filas = await this.prisma.transferenciaCodigo.findMany({
      where: { empresaId },
      include: { lineas: true },
      orderBy: { fecha: "desc" },
    });
    const idsSku = [
      ...new Set(filas.flatMap((t) => t.lineas.flatMap((l) => [l.skuOrigenId, l.skuDestinoId]))),
    ];
    const skus = await this.prisma.sku.findMany({
      where: { id: { in: idsSku }, empresaId },
      select: { id: true, codigoParlante: true, nombre: true },
    });
    const skuPorId = new Map(skus.map((s) => [s.id.toString(), s]));
    const etiqueta = (id: bigint): string => {
      const s = skuPorId.get(id.toString());
      return s ? `${s.codigoParlante} — ${s.nombre ?? ""}` : id.toString();
    };
    return filas.map((t) => ({
      id: t.id.toString(),
      numero: t.numero,
      estado: t.estado,
      fecha: t.fecha.toISOString(),
      observaciones: t.observaciones,
      lineas: t.lineas.map((l) => ({
        id: l.id.toString(),
        origen: etiqueta(l.skuOrigenId),
        destino: etiqueta(l.skuDestinoId),
        cantidadOrigen: l.cantidadOrigen.toString(),
        factorConversion: l.factorConversion.toString(),
        cantidadDestino: l.cantidadDestino.toString(),
        costoTotal: l.costoTotal.toString(),
      })),
    }));
  }
}
