import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
} from "class-validator";

/**
 * Cantidad y costo se reciben como string para no perder precision decimal.
 * Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
 * El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
 */
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

export class RecibirCompraDto {
  @IsInt()
  skuId!: number;

  @IsInt()
  almacenId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  cantidad!: string;

  @Matches(REGEX_DECIMAL, { message: "costoUnitario debe ser decimal positivo" })
  costoUnitario!: string;

  @IsOptional()
  @IsInt()
  ubicacionId?: number;

  @IsOptional()
  @IsString()
  tipoDocumentoSunat?: string; // Tabla 10 (default 01 Factura)

  @IsOptional()
  @IsString()
  serieComprobante?: string;

  @IsOptional()
  @IsString()
  numeroComprobante?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class RegistrarSalidaDto {
  @IsInt()
  skuId!: number;

  @IsInt()
  almacenId!: number;

  @Matches(REGEX_DECIMAL, { message: "cantidad debe ser decimal positivo" })
  @IsString()
  cantidad!: string;

  @IsOptional()
  @IsInt()
  ubicacionId?: number;

  @IsOptional()
  @IsString()
  tipoDocumentoSunat?: string; // default 03 Boleta

  @IsOptional()
  @IsString()
  serieComprobante?: string;

  @IsOptional()
  @IsString()
  numeroComprobante?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class ConsultarKardexDto {
  @IsInt()
  skuId!: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  almacenId?: number;
}
