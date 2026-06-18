import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export interface ResultadoCorrelativo {
  /** Numero entero asignado (ultimoNumero ya incrementado). */
  numero: number;
  /** Numero formateado con padding (ej. "00001"). */
  formateado: string;
}

/**
 * Asigna correlativos atomicos por (empresa, tipoDocumento, serie).
 *
 * El incremento es atomico: el upsert con `increment` se resuelve en una sola
 * sentencia SQL (UPDATE ... SET ultimo_numero = ultimo_numero + 1) y devuelve
 * el valor ya incrementado. DEBE ejecutarse dentro de prisma.$transaction para
 * que la asignacion del numero y el documento que lo consume sean atomicos.
 */
@Injectable()
export class CorrelativoService {
  /**
   * Reserva y devuelve el siguiente numero para el documento indicado.
   *
   * @param tx Cliente transaccional de Prisma (obligatorio: usar dentro de $transaction).
   * @param empresaId Empresa propietaria del correlativo.
   * @param tipoDocumento Tipo logico de documento (ej. "REQUERIMIENTO").
   * @param serie Serie del documento. Vacio por defecto.
   * @param padding Ancho minimo del numero formateado. 5 por defecto.
   */
  async siguiente(
    tx: Tx,
    empresaId: bigint,
    tipoDocumento: string,
    serie = "",
    padding = 5,
  ): Promise<ResultadoCorrelativo> {
    const registro = await tx.documentoCorrelativo.upsert({
      where: {
        empresaId_tipoDocumento_serie: { empresaId, tipoDocumento, serie },
      },
      create: { empresaId, tipoDocumento, serie, ultimoNumero: 1 },
      update: { ultimoNumero: { increment: 1 } },
    });

    return {
      numero: registro.ultimoNumero,
      formateado: registro.ultimoNumero.toString().padStart(padding, "0"),
    };
  }
}
