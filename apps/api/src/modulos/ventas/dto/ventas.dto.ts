import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

export class LineaVentaDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioUnitario debe ser decimal" })
  precioUnitario?: string;
}

export class CrearOrdenVentaDto {
  @IsInt()
  almacenId!: number;

  @IsString()
  @MinLength(1)
  numero!: string;

  @IsOptional()
  @IsString()
  cliente?: string;

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
}

export class DespacharDto {
  @IsInt()
  ordenVentaId!: number;

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
  @Type(() => LineaDespachoDto)
  lineas!: LineaDespachoDto[];
}
