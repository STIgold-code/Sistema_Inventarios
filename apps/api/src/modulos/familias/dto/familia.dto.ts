import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from "class-validator";

/**
 * Alta de una familia. El codigo son los 3 primeros digitos del codigo parlante
 * de BM, por lo que debe ser exactamente 3 digitos numericos.
 */
export class CrearFamiliaDto {
  @IsString()
  @Length(3, 3, { message: "codigo debe tener exactamente 3 digitos" })
  @Matches(/^\d{3}$/, { message: "codigo debe ser numerico de 3 digitos" })
  codigo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre!: string;
}

/** Edicion de familia. El codigo no se modifica (es la llave de negocio). */
export class ActualizarFamiliaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
