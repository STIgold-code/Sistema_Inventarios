import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";

// Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
// El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

export class LineaValeSalidaDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @IsString()
  observacion?: string;

  // Cuando es true, cantidad viene en la unidad de referencia del SKU y el
  // sistema la convierte a unidad de control. Default: unidad de control.
  @IsOptional()
  @IsBoolean()
  enUnidadReferencia?: boolean;
}

/**
 * Series por SKU a despachar. Para articulos serializados, el despacho del vale
 * exige una entrada por cada SKU con controlaSerie, con la cantidad exacta de
 * numeros de serie disponibles en el almacen del vale.
 */
export class SeriesPorSkuDto {
  @IsInt()
  skuId!: number;

  @IsArray()
  @IsString({ each: true })
  numerosSerie!: string[];
}

export class DespacharValeDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SeriesPorSkuDto)
  series?: SeriesPorSkuDto[];
}

export class CrearValeSalidaDto {
  @IsInt()
  almacenId!: number;

  @IsInt()
  centroCostoId!: number;

  @IsOptional()
  @IsInt()
  ordenTrabajoId?: number;

  @IsString()
  @MinLength(1, { message: "destino es obligatorio" })
  destino!: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaValeSalidaDto)
  lineas!: LineaValeSalidaDto[];
}
