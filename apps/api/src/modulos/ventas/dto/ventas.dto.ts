import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";
import { TIPO_DOCUMENTO } from "@bm/tipos";

// Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
// El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;
const TIPOS_DOCUMENTO_SUNAT = Object.values(TIPO_DOCUMENTO);

export class LineaVentaDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioUnitario debe ser decimal" })
  precioUnitario?: string;

  // Cuando es true, cantidad/precioUnitario vienen en la unidad de referencia del
  // SKU y el sistema los convierte a unidad de control. Default: unidad de control.
  @IsOptional()
  @IsBoolean()
  enUnidadReferencia?: boolean;
}

export class CrearOrdenVentaDto {
  @IsInt()
  almacenId!: number;

  @IsString()
  @MinLength(1)
  numero!: string;

  @IsOptional()
  @IsInt()
  clienteId?: number;

  /** @deprecated Usar clienteId. Texto libre legacy. */
  @IsOptional()
  @IsString()
  cliente?: string;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "tipoCambio debe ser decimal positivo" })
  tipoCambio?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaVentaDto)
  lineas!: LineaVentaDto[];
}

export class LineaDespachoDto {
  @IsInt()
  ordenVentaLineaId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  // Numeros de serie de las unidades despachadas. Obligatorio (cantidad exacta)
  // cuando el SKU controla serie; debe omitirse en caso contrario.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numerosSerie?: string[];
}

/**
 * Comprobante de venta (OBLIGATORIO al despachar): es el sustento SUNAT.
 * El sistema NO emite electronicamente, solo registra la referencia.
 */
export class ComprobanteVentaDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(TIPOS_DOCUMENTO_SUNAT, {
    message: "tipoDocumentoSunat invalido (Tabla 10 SUNAT)",
  })
  tipoDocumentoSunat!: string;

  @IsString()
  @IsNotEmpty()
  serie!: string;

  @IsString()
  @IsNotEmpty()
  numero!: string;

  @IsISO8601({}, { message: "fechaEmision debe ser una fecha valida ISO 8601" })
  fechaEmision!: string;

  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "tipoCambio debe ser decimal positivo" })
  tipoCambio?: string;

  @Matches(REGEX_DECIMAL, { message: "subtotal debe ser decimal positivo" })
  subtotal!: string;

  @Matches(REGEX_DECIMAL, { message: "igv debe ser decimal positivo" })
  igv!: string;

  @Matches(REGEX_DECIMAL, { message: "total debe ser decimal positivo" })
  total!: string;
}

export class DespacharDto {
  @IsInt()
  ordenVentaId!: number;

  @ValidateNested()
  @Type(() => ComprobanteVentaDto)
  comprobante!: ComprobanteVentaDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaDespachoDto)
  lineas!: LineaDespachoDto[];
}
