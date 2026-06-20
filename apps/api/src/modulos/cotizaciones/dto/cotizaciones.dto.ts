import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

export class CrearCotizacionDto {
  @IsInt()
  proveedorId!: number;

  @IsInt()
  skuId!: number;

  @IsOptional()
  @IsString()
  moneda?: string;

  @Matches(REGEX_DECIMAL, { message: "precioUnitario debe ser decimal positivo" })
  precioUnitario!: string;

  @IsISO8601({}, { message: "fechaCotizacion debe ser una fecha valida ISO 8601" })
  fechaCotizacion!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  numeroCotizacion?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  ordenCompraRef?: string;
}

export class ActualizarCotizacionDto {
  @IsOptional()
  @IsString()
  moneda?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioUnitario debe ser decimal positivo" })
  precioUnitario?: string;

  @IsOptional()
  @IsISO8601({}, { message: "fechaCotizacion debe ser una fecha valida ISO 8601" })
  fechaCotizacion?: string;

  @IsOptional()
  @IsString()
  numeroCotizacion?: string;

  @IsOptional()
  @IsString()
  ordenCompraRef?: string;
}
