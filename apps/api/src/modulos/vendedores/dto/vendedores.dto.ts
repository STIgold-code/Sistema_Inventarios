import { IsBoolean, IsOptional, IsString, MinLength } from "class-validator";

export class CrearVendedorDto {
  @IsString() @MinLength(1) codigo!: string;
  @IsString() @MinLength(1) nombre!: string;
  @IsOptional() @IsString() documento?: string;
}

export class ActualizarVendedorDto {
  @IsOptional() @IsString() @MinLength(1) nombre?: string;
  @IsOptional() @IsString() documento?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}
