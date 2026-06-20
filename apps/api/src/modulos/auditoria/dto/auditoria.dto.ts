import { Type } from "class-transformer";
import { IsInt, IsISO8601, IsOptional, IsString, Min } from "class-validator";

/** Filtros de consulta de la bitacora de auditoria (todos opcionales). */
export class ListarAuditoriaDto {
  @IsOptional()
  @IsString()
  entidad?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  entidadId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  usuarioId?: number;

  @IsOptional()
  @IsString()
  accion?: string;

  @IsOptional()
  @IsISO8601()
  desde?: string;

  @IsOptional()
  @IsISO8601()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  porPagina?: number;
}
