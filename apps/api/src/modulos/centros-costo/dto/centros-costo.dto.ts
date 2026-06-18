import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class CrearCentroCostoDto {
  @IsString() @MinLength(1) codigo!: string;
  @IsString() @MinLength(1) nombre!: string;
}

export class ActualizarCentroCostoDto {
  @IsOptional() @IsString() @MinLength(1) nombre?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
