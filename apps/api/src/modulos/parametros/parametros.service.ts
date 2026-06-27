import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

const D = Prisma.Decimal;

interface CambioParametros {
  tasaIgv?: string;
  costeoPromedioActivo?: boolean;
  preciosIncluyenIgv?: boolean;
  permiteSerieUnica?: boolean;
  unidadReferencialVisible?: boolean;
}

@Injectable()
export class ParametrosService {
  constructor(private readonly prisma: PrismaService) {}

  /** Garantiza la fila de parametros de la empresa (defaults) y la devuelve. */
  async obtener(empresaId: bigint) {
    const p = await this.prisma.parametrosEmpresa.upsert({
      where: { empresaId },
      create: { empresaId },
      update: {},
    });
    return this.mapear(p);
  }

  async actualizar(empresaId: bigint, dto: CambioParametros) {
    let tasaIgv: Prisma.Decimal | undefined;
    if (dto.tasaIgv !== undefined) {
      tasaIgv = new D(dto.tasaIgv);
      if (tasaIgv.lessThan(0) || tasaIgv.greaterThanOrEqualTo(1)) {
        throw new BadRequestException("La tasa de IGV debe estar entre 0 y 1 (ej. 0.18).");
      }
    }
    const data = {
      tasaIgv,
      costeoPromedioActivo: dto.costeoPromedioActivo,
      preciosIncluyenIgv: dto.preciosIncluyenIgv,
      permiteSerieUnica: dto.permiteSerieUnica,
      unidadReferencialVisible: dto.unidadReferencialVisible,
    };
    const p = await this.prisma.parametrosEmpresa.upsert({
      where: { empresaId },
      create: { empresaId, ...data },
      update: data,
    });
    return this.mapear(p);
  }

  /** Tasa de IGV vigente de la empresa (garantiza la fila). */
  async tasaIgv(empresaId: bigint): Promise<Prisma.Decimal> {
    const p = await this.prisma.parametrosEmpresa.upsert({
      where: { empresaId },
      create: { empresaId },
      update: {},
    });
    return new D(p.tasaIgv);
  }

  /** Igual que {@link tasaIgv} pero dentro de la transaccion del caller. */
  async tasaIgvEnTx(tx: Prisma.TransactionClient, empresaId: bigint): Promise<Prisma.Decimal> {
    const p = await tx.parametrosEmpresa.upsert({
      where: { empresaId },
      create: { empresaId },
      update: {},
    });
    return new D(p.tasaIgv);
  }

  private mapear(p: Prisma.ParametrosEmpresaGetPayload<Record<string, never>>) {
    return {
      tasaIgv: p.tasaIgv.toString(),
      costeoPromedioActivo: p.costeoPromedioActivo,
      preciosIncluyenIgv: p.preciosIncluyenIgv,
      permiteSerieUnica: p.permiteSerieUnica,
      unidadReferencialVisible: p.unidadReferencialVisible,
    };
  }
}
