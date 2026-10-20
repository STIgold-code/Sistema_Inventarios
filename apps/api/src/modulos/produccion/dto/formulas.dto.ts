import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { SiSeEnvia } from "../../../comun/decoradores/si-se-envia.decorator.js";

// Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
// El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/** Tope del nombre de la fórmula. */
const MAXIMO_NOMBRE = 120;

export class LineaFormulaDto {
  @IsInt()
  skuInsumoId!: number;

  // Cantidad del insumo por cantidadBase del terminado, en unidad de control.
  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;
}

export class CrearFormulaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAXIMO_NOMBRE)
  nombre!: string;

  @IsInt()
  skuTerminadoId!: number;

  // Cantidad de producto terminado que rinde la receta.
  @Matches(REGEX_DECIMAL, { message: "cantidadBase debe ser decimal positivo" })
  cantidadBase!: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaFormulaDto)
  lineas!: LineaFormulaDto[];
}

/**
 * Todos los campos son opcionales. Los obligatorios en la creación usan
 * @SiSeEnvia(): se pueden omitir, pero un `null` explícito se rechaza con 400.
 * Si se envía `lineas`, reemplaza el conjunto completo de insumos.
 */
export class ActualizarFormulaDto {
  @SiSeEnvia()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAXIMO_NOMBRE)
  nombre?: string;

  @SiSeEnvia()
  @IsInt()
  skuTerminadoId?: number;

  @SiSeEnvia()
  @Matches(REGEX_DECIMAL, { message: "cantidadBase debe ser decimal positivo" })
  cantidadBase?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @SiSeEnvia()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaFormulaDto)
  lineas?: LineaFormulaDto[];
}
