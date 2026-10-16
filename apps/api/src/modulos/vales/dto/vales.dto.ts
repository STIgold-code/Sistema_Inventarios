import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Recortar } from "../../../comun/decoradores/recortar.decorator.js";
import { SiSeEnvia } from "../../../comun/decoradores/si-se-envia.decorator.js";

// Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
// El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/** Tope del numero de comprobante en papel y del nombre de quien recibe. */
const MAXIMO_TEXTO_COMPROBANTE = 120;

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

  // Persona que recibe el material ("Destinatario" del comprobante en papel).
  @SiSeEnvia()
  @Recortar()
  @IsString()
  @MaxLength(MAXIMO_TEXTO_COMPROBANTE)
  entregadoA?: string;
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

  // Numero del comprobante de almacen en papel, p. ej. 001-036488.
  @SiSeEnvia()
  @Recortar()
  @IsString()
  @MaxLength(MAXIMO_TEXTO_COMPROBANTE)
  comprobanteFisico?: string;

  @SiSeEnvia()
  @Recortar()
  @IsString()
  @MaxLength(MAXIMO_TEXTO_COMPROBANTE)
  entregadoA?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaValeSalidaDto)
  lineas!: LineaValeSalidaDto[];
}
