import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { MovimientoService } from "../inventario/movimientos/movimiento.service.js";

/** Una fila cruda del Excel a importar. */
export interface FilaImportacion {
  codigoParlante: string;
  descripcion: string;
  unidadCodigo: string;
  stockFisico: string;
  costoUnitario?: string;
}

export interface ResultadoImportacion {
  dryRun: boolean;
  creados: number;
  actualizados: number;
  conStock: number;
  errores: Array<{ codigo: string; motivo: string }>;
}

// Normaliza unidades del Excel a los codigos SUNAT (Tabla 6).
const ALIAS_UNIDAD: Record<string, string> = {
  KGM: "KGM",
  KG: "KGM",
  KILO: "KGM",
  MTR: "MTR",
  MTS: "MTR",
  M: "MTR",
  METRO: "MTR",
  UND: "NIU",
  UNI: "NIU",
  NIU: "NIU",
  LTR: "LTR",
  LT: "LTR",
  GLL: "GLL",
  GAL: "GLL",
  JGO: "SET",
  SET: "SET",
};

@Injectable()
export class ImportadorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly movimientos: MovimientoService,
  ) {}

  /**
   * Importa filas de productos. Idempotente por codigoParlante. Valida cada
   * fila por separado (no aborta el lote). Con dryRun solo reporta.
   */
  async importar(
    usuario: UsuarioRequest,
    almacenId: bigint,
    filas: FilaImportacion[],
    dryRun: boolean,
  ): Promise<ResultadoImportacion> {
    const empresaId = usuario.empresaId;
    // Aislamiento por empresa: el almacen destino debe pertenecer al tenant.
    const almacen = await this.prisma.almacen.findFirst({
      where: { id: almacenId, empresaId },
    });
    if (!almacen) {
      throw new NotFoundException("Almacén no encontrado.");
    }
    const resultado: ResultadoImportacion = {
      dryRun,
      creados: 0,
      actualizados: 0,
      conStock: 0,
      errores: [],
    };

    // Cache de familias y unidades de la empresa.
    const familias = new Map(
      (await this.prisma.familia.findMany({ where: { empresaId } })).map((f) => [f.codigo, f.id]),
    );
    const unidades = new Map(
      (await this.prisma.unidad.findMany({ where: { empresaId } })).map((u) => [u.codigo, u.id]),
    );

    for (const fila of filas) {
      const codigo = (fila.codigoParlante ?? "").trim();
      try {
        if (codigo.length !== 14 || !/^\d{14}$/.test(codigo)) {
          throw new Error("codigoParlante debe tener 14 digitos");
        }
        const familiaCodigo = codigo.slice(0, 3);
        const familiaId = familias.get(familiaCodigo);
        if (!familiaId) {
          throw new Error(`Familia ${familiaCodigo} no existe`);
        }
        const unidadCodigo = ALIAS_UNIDAD[(fila.unidadCodigo ?? "").trim().toUpperCase()] ?? "NIU";
        const unidadId = unidades.get(unidadCodigo);
        if (!unidadId) {
          throw new Error(`Unidad ${unidadCodigo} no existe`);
        }

        if (dryRun) {
          resultado.creados += 1;
          continue;
        }

        // Upsert producto + sku (idempotente por codigoParlante).
        const existente = await this.prisma.sku.findUnique({
          where: { empresaId_codigoParlante: { empresaId, codigoParlante: codigo } },
        });

        let skuId: bigint;
        if (existente) {
          skuId = existente.id;
          resultado.actualizados += 1;
        } else {
          const producto = await this.prisma.producto.create({
            data: { empresaId, familiaId, nombre: fila.descripcion.trim() || codigo },
          });
          const sku = await this.prisma.sku.create({
            data: {
              empresaId,
              productoId: producto.id,
              codigoParlante: codigo,
              unidadId,
              nombre: fila.descripcion.trim() || null,
            },
          });
          skuId = sku.id;
          resultado.creados += 1;
        }

        // Carga de stock inicial si hay cantidad y aun no tiene movimientos.
        const cantidad = (fila.stockFisico ?? "0").trim();
        if (Number(cantidad) > 0 && !existente) {
          await this.movimientos.cargarStockInicial(usuario, {
            skuId,
            almacenId,
            cantidad,
            costoUnitario: fila.costoUnitario?.trim() || "0",
          });
          resultado.conStock += 1;
        }
      } catch (error) {
        resultado.errores.push({
          codigo,
          motivo: error instanceof Error ? error.message : "error desconocido",
        });
      }
    }

    return resultado;
  }
}
