import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
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
  @MaxLength(200)
  descripcion!: string;

  @IsString()
  @MaxLength(20)
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

  // Tope de filas por request: el backend es la frontera de confianza real (el
  // front lotea de a 400). Evita un POST con millones de filas que agote el pool.
  @IsArray()
  @ArrayMaxSize(1000)
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
