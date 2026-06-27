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

export class LineaTransferenciaCodigoDto {
  @IsInt() skuOrigenId!: number;
  @IsInt() skuDestinoId!: number;
  @Matches(DEC, { message: "cantidadOrigen debe ser decimal positivo" }) cantidadOrigen!: string;
  @Matches(DEC, { message: "factorConversion debe ser decimal positivo" }) factorConversion!: string;
}

export class CrearTransferenciaCodigoDto {
  @IsInt() almacenId!: number;
  @IsString() @MinLength(1) numero!: string;
  @IsOptional() @IsString() observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaTransferenciaCodigoDto)
  lineas!: LineaTransferenciaCodigoDto[];
}
