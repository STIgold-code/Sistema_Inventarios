import { BadRequestException, Injectable, PipeTransform } from "@nestjs/common";

/** Solo enteros no negativos: evita que `BigInt("abc")` lance y derive en HTTP 500. */
const REGEX_ENTERO = /^\d+$/;

/**
 * Convierte un parametro de ruta a `bigint`. Si el valor no es un entero valido
 * (p. ej. `/clientes/abc`) responde 400 en lugar de propagar un SyntaxError.
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(valor: string): bigint {
    if (!REGEX_ENTERO.test(valor)) {
      throw new BadRequestException("Identificador invalido");
    }
    return BigInt(valor);
  }
}
