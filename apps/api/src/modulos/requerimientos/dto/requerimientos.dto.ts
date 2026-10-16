import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Recortar } from "../../../comun/decoradores/recortar.decorator.js";
import { SiSeEnvia } from "../../../comun/decoradores/si-se-envia.decorator.js";

// Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
// El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/** Tope de la marca o referencia que escribe el solicitante en cada linea. */
const MAXIMO_REFERENCIA = 200;

export class LineaRequerimientoDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @IsString()
  justificacion?: string;

  // Marca, modelo o referencia ("Marca o Ref." del pedido en papel).
  @SiSeEnvia()
  @Recortar()
  @IsString()
  @MaxLength(MAXIMO_REFERENCIA)
  referencia?: string;

  @SiSeEnvia()
  @IsInt()
  @Min(1)
  // Sin tope, un id mayor pierde precision al parsear el JSON o desborda int8.
  @Max(Number.MAX_SAFE_INTEGER)
  proveedorSugeridoId?: number;
}

export class CrearRequerimientoDto {
  @IsInt()
  centroCostoId!: number;

  // Orden de trabajo para la que se pide el material ("O/T" del pedido en papel).
  @SiSeEnvia()
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  ordenTrabajoId?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRequerimientoDto)
  lineas!: LineaRequerimientoDto[];
}
