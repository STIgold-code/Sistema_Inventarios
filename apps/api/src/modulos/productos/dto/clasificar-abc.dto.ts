import { IsBoolean, IsOptional, Matches } from "class-validator";

const REGEX_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Solicitud de clasificacion ABC por valor de consumo en el rango [desde, hasta].
 * Si persistir es true, escribe clasificacionAbc en cada SKU clasificado.
 */
export class ClasificarAbcDto {
  @Matches(REGEX_FECHA, { message: "desde debe tener formato AAAA-MM-DD" })
  desde!: string;

  @Matches(REGEX_FECHA, { message: "hasta debe tener formato AAAA-MM-DD" })
  hasta!: string;

  @IsOptional()
  @IsBoolean()
  persistir?: boolean;
}
