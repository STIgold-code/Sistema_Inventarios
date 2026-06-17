import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ImportadorService, ResultadoImportacion } from "./importador.service.js";

class FilaDto {
  @IsString()
  codigoParlante!: string;

  @IsString()
  descripcion!: string;

  @IsString()
  unidadCodigo!: string;

  @IsString()
  stockFisico!: string;

  @IsOptional()
  @IsString()
  costoUnitario?: string;
}

class ImportarDto {
  @IsInt()
  almacenId!: number;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FilaDto)
  filas!: FilaDto[];
}

@Controller("importador")
@UseGuards(JwtGuard, PermisosGuard)
export class ImportadorController {
  constructor(private readonly importador: ImportadorService) {}

  @Post("productos")
  @Permisos("producto.crear")
  importar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: ImportarDto,
  ): Promise<ResultadoImportacion> {
    return this.importador.importar(
      usuario,
      BigInt(dto.almacenId),
      dto.filas,
      dto.dryRun ?? false,
    );
  }
}
