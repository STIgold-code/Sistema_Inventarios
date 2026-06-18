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

export class LineaValeSalidaDto {
  @IsInt()
  skuId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @IsOptional()
  @IsString()
  observacion?: string;
}

export class CrearValeSalidaDto {
  @IsInt()
  almacenId!: number;

  @IsInt()
  centroCostoId!: number;

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
