import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

export class LineaRequerimientoDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @IsString()
  justificacion?: string;
}

export class CrearRequerimientoDto {
  @IsInt()
  centroCostoId!: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRequerimientoDto)
  lineas!: LineaRequerimientoDto[];
}
