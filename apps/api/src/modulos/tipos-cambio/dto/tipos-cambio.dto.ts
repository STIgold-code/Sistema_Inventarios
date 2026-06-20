import { IsNumberString, IsString, Matches } from "class-validator";

/**
 * Upsert del tipo de cambio de una fecha.
 * `fecha` en formato ISO (YYYY-MM-DD). `compra`/`venta` como string decimal
 * para no perder precision en el transporte.
 */
export class GuardarTipoCambioDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "fecha debe tener formato YYYY-MM-DD" })
  fecha!: string;

  @IsNumberString({}, { message: "compra debe ser un decimal" })
  compra!: string;

  @IsNumberString({}, { message: "venta debe ser un decimal" })
  venta!: string;
}
