import { IsBoolean, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CrearTransportistaDto {
  @IsString() @MinLength(1) codigo!: string;
  @IsString() @MinLength(1) nombre!: string;
  @IsOptional() @IsString() @Matches(/^\d{11}$/, { message: "El RUC debe tener 11 dígitos." })
  ruc?: string;
}

export class ActualizarTransportistaDto {
  @IsOptional() @IsString() @MinLength(1) nombre?: string;
  @IsOptional() @IsString() @Matches(/^\d{11}$/, { message: "El RUC debe tener 11 dígitos." })
  ruc?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
