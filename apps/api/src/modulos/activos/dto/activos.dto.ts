import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
  MinLength,
} from "class-validator";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

export class CrearCategoriaActivoDto {
  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsInt()
  @Min(1)
  vidaUtilMeses!: number;

  @Matches(REGEX_DECIMAL, { message: "tasaAnual debe ser decimal" })
  tasaAnual!: string;
}

export class CrearActivoDto {
  @IsInt()
  sucursalId!: number;

  @IsInt()
  categoriaId!: number;

  @IsString()
  @MinLength(1)
  codigo!: string;

  @IsString()
  @MinLength(1)
  nombre!: string;

  @IsOptional()
  @IsString()
  marca?: string;

  @IsOptional()
  @IsString()
  modelo?: string;

  @IsOptional()
  @IsString()
  numeroSerie?: string;

  @IsOptional()
  @IsString()
  departamento?: string;

  @IsString()
  fechaCompra!: string; // ISO

  @Matches(REGEX_DECIMAL, { message: "valorAdquisicion debe ser decimal" })
  valorAdquisicion!: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "valorResidual debe ser decimal" })
  valorResidual?: string;

  @IsInt()
  @Min(1)
  vidaUtilMeses!: number;
}

export class DepreciarDto {
  @Matches(/^\d{4}-\d{2}$/, { message: "periodo debe ser AAAA-MM" })
  periodo!: string;
}
