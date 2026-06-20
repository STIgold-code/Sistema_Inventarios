import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from "class-validator";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

export class LineaDevolucionDto {
  @IsOptional()
  @IsInt()
  ordenVentaLineaId?: number;

  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @IsString()
  motivo?: string;

  // Numeros de serie de las unidades devueltas. Obligatorio (cantidad exacta)
  // cuando el SKU controla serie; debe omitirse en caso contrario.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numerosSerie?: string[];
}

export class RegistrarDevolucionDto {
  @IsInt()
  ordenVentaId!: number;

  @IsOptional()
  @IsInt()
  comprobanteVentaId?: number;

  @IsOptional()
  @IsInt()
  guiaRemisionId?: number;

  @IsOptional()
  @IsString()
  motivo?: string;

  @IsOptional()
  @IsISO8601({}, { message: "fecha debe ser una fecha valida ISO 8601" })
  fecha?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaDevolucionDto)
  lineas!: LineaDevolucionDto[];
}
