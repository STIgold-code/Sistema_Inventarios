import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

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

  @IsString()
  @MinLength(1)
  numero!: string;

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

  @IsOptional()
  @IsString()
  tipoDocumentoSunat?: string;

  @IsOptional()
  @IsString()
  serieComprobante?: string;

  @IsOptional()
  @IsString()
  numeroComprobante?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionDto)
  lineas!: LineaRecepcionDto[];
}
