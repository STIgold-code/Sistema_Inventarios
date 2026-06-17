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

const DEC = /^\d+(\.\d+)?$/;

export class LineaTrasladoDto {
  @IsInt() skuId!: number;
  @Matches(DEC, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
}

export class CrearTrasladoDto {
  @IsInt() almacenOrigenId!: number;
  @IsInt() almacenDestinoId!: number;

  @IsString()
  @MinLength(1)
  numero!: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaTrasladoDto)
  lineas!: LineaTrasladoDto[];
}

export class LineaRecepcionTrasladoDto {
  @IsInt() trasladoLineaId!: number;
  @Matches(DEC, { message: "cantidad debe ser decimal" }) cantidadRecibida!: string;
}

export class RecibirTrasladoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaRecepcionTrasladoDto)
  lineas!: LineaRecepcionTrasladoDto[];
}
