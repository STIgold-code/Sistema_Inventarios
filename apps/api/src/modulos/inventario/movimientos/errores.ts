import { BadRequestException } from "@nestjs/common";

/** Se intento una salida mayor al stock disponible. Protege el invariante: nunca negativo. */
export class StockInsuficienteError extends BadRequestException {
  constructor(disponible: string, solicitado: string) {
    super(
      `Stock insuficiente: disponible ${disponible}, solicitado ${solicitado}`,
    );
  }
}

/** La proyeccion decia que habia stock pero las capas de costo no alcanzaron. */
export class InconsistenciaCapasError extends BadRequestException {
  constructor() {
    super("Inconsistencia entre proyeccion y capas de costo");
  }
}

/** Se intento registrar un movimiento con fecha en un periodo ya cerrado. */
export class PeriodoCerradoError extends BadRequestException {
  constructor(periodo: string) {
    super(
      `El periodo ${periodo} esta cerrado. No se pueden registrar movimientos con esa fecha.`,
    );
  }
}

/** Los numeros de serie capturados no cumplen las reglas de trazabilidad del SKU. */
export class SerieInvalidaError extends BadRequestException {
  constructor(mensaje: string) {
    super(mensaje);
  }
}
