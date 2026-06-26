import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
        // Unidad: vacia cae a NIU (unidades); una unidad escrita pero no
        // reconocida es un error de fila (no se asume NIU silenciosamente, seria
        // un dato contable errado en el kardex SUNAT).
        const unidadRaw = (fila.unidadCodigo ?? "").trim().toUpperCase();
        const unidadCodigo = unidadRaw === "" ? "NIU" : ALIAS_UNIDAD[unidadRaw];
        if (!unidadCodigo) {
          throw new Error(`Unidad "${fila.unidadCodigo}" no reconocida`);
        }
        const unidadId = unidades.get(unidadCodigo);
        if (!unidadId) {
          throw new Error(`Unidad ${unidadCodigo} no existe`);
        }

        // Decimales: normaliza notacion peruana (coma decimal, separador de
        // miles) y valida; un valor mal formado es error de fila, no se silencia.
        const cantidad = this.normalizarDecimal(fila.stockFisico, "0");
        if (cantidad === null) {
          throw new Error(`Stock "${fila.stockFisico}" no es un numero valido`);
        }
        const costoUnitario = this.normalizarDecimal(fila.costoUnitario, "0");
        if (costoUnitario === null) {
          throw new Error(`Costo "${fila.costoUnitario}" no es un numero valido`);
        }

        if (dryRun) {
          resultado.creados += 1;
          continue;
        }

        // Producto + SKU + stock inicial en UNA transaccion: la fila pasa
        // completa o falla completa (sin SKUs huerfanos sin saldo de apertura).
        // Idempotente por codigoParlante.
        const fila2 = await this.prisma.$transaction(async (tx) => {
          const existente = await tx.sku.findUnique({
            where: { empresaId_codigoParlante: { empresaId, codigoParlante: codigo } },
          });

          let skuId: bigint;
          if (existente) {
            skuId = existente.id;
          } else {
            const producto = await tx.producto.create({
              data: { empresaId, familiaId, nombre: fila.descripcion.trim() || codigo },
            });
            const sku = await tx.sku.create({
              data: {
                empresaId,
                productoId: producto.id,
                codigoParlante: codigo,
                unidadId,
                nombre: fila.descripcion.trim() || null,
              },
            });
            skuId = sku.id;
          }

          let conStock = false;
          if (cantidad.greaterThan(0) && !existente) {
            await this.movimientos.cargarStockInicialEnTx(usuario, tx, {
              skuId,
              almacenId,
              cantidad: cantidad.toString(),
              costoUnitario: costoUnitario.toString(),
            });
            conStock = true;
          }
          return { creado: !existente, conStock };
        });

        if (fila2.creado) resultado.creados += 1;
        else resultado.actualizados += 1;
        if (fila2.conStock) resultado.conStock += 1;
      } catch (error) {
        resultado.errores.push({
          codigo,
          motivo: error instanceof Error ? error.message : "error desconocido",
        });
      }
    }

    return resultado;
  }

  /**
   * Normaliza un decimal en notacion peruana a Prisma.Decimal. Acepta coma
   * decimal ("1234,50") y separador de miles ("1.234,50" o "1,234.50"). Vacio
   * cae al valor por defecto. Devuelve null si no es un numero valido (la fila
   * lo reporta como error en vez de crear stock corrupto o NaN silencioso).
   */
  private normalizarDecimal(valor: string | undefined, porDefecto: string): Prisma.Decimal | null {
    const bruto = (valor ?? "").trim();
    if (bruto === "") return new Prisma.Decimal(porDefecto);

    let limpio = bruto;
    const tieneComa = limpio.includes(",");
    const tienePunto = limpio.includes(".");
    if (tieneComa && tienePunto) {
      // El ultimo separador que aparece es el decimal; el otro es de miles.
      const sepDecimal = limpio.lastIndexOf(",") > limpio.lastIndexOf(".") ? "," : ".";
      const sepMiles = sepDecimal === "," ? "." : ",";
      limpio = limpio.split(sepMiles).join("");
      limpio = limpio.replace(sepDecimal, ".");
    } else if (tieneComa) {
      // Solo coma: es el separador decimal.
      limpio = limpio.replace(",", ".");
    }

    if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
    try {
      return new Prisma.Decimal(limpio);
    } catch {
      return null;
    }
  }
}
