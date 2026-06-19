import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from "class-validator";
import { MOTIVO_TRASLADO } from "@bm/tipos";

const REGEX_DECIMAL = /^\d+(\.\d+)?$/;
const MOTIVOS_TRASLADO = Object.values(MOTIVO_TRASLADO);

export class CrearGuiaRemisionDto {
  @IsString()
  @MinLength(1)
  serie!: string;

  @IsString()
  @MinLength(1)
  numero!: string;

  @IsISO8601()
  fechaTraslado!: string;

  @IsIn(MOTIVOS_TRASLADO, { message: "motivoTraslado no pertenece al catalogo SUNAT" })
  motivoTraslado!: string;

  @IsOptional()
  @IsString()
  transportistaDoc?: string;

  @IsOptional()
  @IsString()
  transportistaNombre?: string;

  @IsString()
  @MinLength(1)
  puntoPartida!: string;

  @IsString()
  @MinLength(1)
  puntoLlegada!: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "pesoBruto debe ser decimal positivo" })
  pesoBruto?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsOptional()
  @IsInt()
  trasladoId?: number;

  @IsOptional()
  @IsInt()
  ordenVentaId?: number;
}
