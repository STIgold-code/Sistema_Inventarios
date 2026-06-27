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

export class LineaDevolucionProveedorDto {
  @IsOptional() @IsInt() recepcionLineaId?: number;
  @IsInt() skuId!: number;
  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
  @IsOptional() @IsString() motivo?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) numerosSerie?: string[];
}

export class RegistrarDevolucionProveedorDto {
  @IsInt() recepcionId!: number;

  @IsOptional() @IsString() motivo?: string;
  @IsOptional() @IsISO8601() fecha?: string;
  @IsOptional() @IsString() tipoComprobante?: string;
  @IsOptional() @IsString() serieComprobante?: string;
  @IsOptional() @IsString() numeroComprobante?: string;
  @IsOptional() @IsISO8601() fechaComprobante?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaDevolucionProveedorDto)
  lineas!: LineaDevolucionProveedorDto[];
}
