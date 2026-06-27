import { IsBoolean, IsOptional, Matches } from "class-validator";

export class ActualizarParametrosDto {
  @IsOptional()
  @Matches(/^0(\.\d{1,4})?$/, { message: "tasaIgv debe ser un decimal entre 0 y 1 (ej. 0.18)" })
  tasaIgv?: string;

  @IsOptional() @IsBoolean() costeoPromedioActivo?: boolean;
  @IsOptional() @IsBoolean() preciosIncluyenIgv?: boolean;
  @IsOptional() @IsBoolean() permiteSerieUnica?: boolean;
  @IsOptional() @IsBoolean() unidadReferencialVisible?: boolean;
}
