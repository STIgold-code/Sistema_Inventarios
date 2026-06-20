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
  ValidateNested,
} from "class-validator";
import { TIPO_DOCUMENTO } from "@bm/tipos";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;
const TIPOS_DOCUMENTO_SUNAT = Object.values(TIPO_DOCUMENTO);

export class LineaOrdenDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @Matches(REGEX_DECIMAL, { message: "costoUnitario debe ser decimal positivo" })
  costoUnitario!: string;

  // Cuando es true, cantidad/costoUnitario vienen en la unidad de referencia del
  // SKU y el sistema los convierte a unidad de control. Default: unidad de control.
  @IsOptional()
  @IsBoolean()
  enUnidadReferencia?: boolean;
}

export class CrearOrdenCompraDto {
  @IsInt()
  proveedorId!: number;

  @IsInt()
  almacenId!: number;

  @IsOptional()
  @IsInt()
  requerimientoId?: number;

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
  @Type(() => LineaOrdenDto)
  lineas!: LineaOrdenDto[];
}

export class LineaRecepcionDto {
  @IsInt()
  ordenCompraLineaId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  // Numeros de serie de la unidades recibidas. Obligatorio (cantidad exacta)
  // cuando el SKU de la linea controla serie; debe omitirse en caso contrario.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numerosSerie?: string[];
}

export class RecibirDto {
  @IsInt()
  ordenCompraId!: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(TIPOS_DOCUMENTO_SUNAT, {
    message: "tipoDocumentoSunat invalido (Tabla 10 SUNAT)",
  })
  tipoDocumentoSunat!: string;

  @IsString()
  @IsNotEmpty()
  serieComprobante!: string;

  @IsString()
  @IsNotEmpty()
  numeroComprobante!: string;

  @IsISO8601({}, { message: "fechaEmisionDocumento debe ser una fecha valida ISO 8601" })
  fechaEmisionDocumento!: string;

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

  @IsOptional()
  @IsString()
  guiaRemisionProveedor?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionDto)
  lineas!: LineaRecepcionDto[];
}
