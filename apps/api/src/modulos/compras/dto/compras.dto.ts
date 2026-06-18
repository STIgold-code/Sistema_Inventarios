import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";
import { TIPO_DOCUMENTO } from "@bm/tipos";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;
const TIPOS_DOCUMENTO_SUNAT = Object.values(TIPO_DOCUMENTO);

export class CrearProveedorDto {
  @IsString()
  @Length(11, 11, { message: "El RUC debe tener 11 digitos" })
  ruc!: string;

  @IsString()
  @MinLength(1)
  razonSocial!: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsString()
  monedaHabitual?: string;

  @IsOptional()
  @IsString()
  cci?: string;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  tipoDocIdentidad?: string;
}

export class ActualizarProveedorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsString()
  monedaHabitual?: string;

  @IsOptional()
  @IsString()
  cci?: string;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  tipoDocIdentidad?: string;
}

export class LineaOrdenDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @Matches(REGEX_DECIMAL, { message: "costoUnitario debe ser decimal positivo" })
  costoUnitario!: string;
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
