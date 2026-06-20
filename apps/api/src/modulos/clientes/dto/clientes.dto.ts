import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { TIPO_DOCUMENTO_IDENTIDAD } from "@bm/tipos";

const TIPOS_DOC_IDENTIDAD = Object.values(TIPO_DOCUMENTO_IDENTIDAD);

export class CrearClienteDto {
  @IsOptional()
  @IsString()
  @IsIn(TIPOS_DOC_IDENTIDAD, {
    message: "tipoDocIdentidad invalido (Tabla 2 SUNAT)",
  })
  tipoDocIdentidad?: string;

  @IsString()
  @MinLength(1)
  numeroDoc!: string;

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

  // Nivel de precio de venta del cliente: 1=publico, 2=distribuidor, 3, 4.
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4], { message: "tipoPrecio debe ser 1, 2, 3 o 4" })
  tipoPrecio?: number;
}

export class ActualizarClienteDto {
  @IsOptional()
  @IsString()
  @IsIn(TIPOS_DOC_IDENTIDAD, {
    message: "tipoDocIdentidad invalido (Tabla 2 SUNAT)",
  })
  tipoDocIdentidad?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  numeroDoc?: string;

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

  // Nivel de precio de venta del cliente: 1=publico, 2=distribuidor, 3, 4.
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4], { message: "tipoPrecio debe ser 1, 2, 3 o 4" })
  tipoPrecio?: number;
}
