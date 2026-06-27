import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from "class-validator";

const DEC = /^\d+(\.\d+)?$/;

export class LineaPedidoDto {
  @IsInt() skuId!: number;
  @Matches(DEC, { message: "cantidad debe ser decimal positivo" }) cantidad!: string;
  @IsOptional() @Matches(DEC, { message: "precioUnitario debe ser decimal" }) precioUnitario?: string;
  @IsOptional() @IsBoolean() enUnidadReferencia?: boolean;
}

export class CrearPedidoDto {
  @IsInt() almacenId!: number;
  @IsString() @MinLength(1) numero!: string;
  @IsOptional() @IsInt() clienteId?: number;
  @IsOptional() @IsInt() vendedorId?: number;
  @IsOptional() @IsISO8601() fechaEntrega?: string;
  @IsOptional() @IsString() moneda?: string;
  @IsOptional() @Matches(DEC) tipoCambio?: string;
  @IsOptional() @IsString() observaciones?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LineaPedidoDto)
  lineas!: LineaPedidoDto[];
}

export class GenerarOrdenVentaDto {
  @IsString() @MinLength(1) numero!: string;
}
