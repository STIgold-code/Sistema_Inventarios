import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import { ActualizarFamiliaDto, CrearFamiliaDto } from "./dto/familia.dto.js";
import { FamiliaListado, FamiliasService } from "./familias.service.js";

@Controller("familias")
@UseGuards(JwtGuard, PermisosGuard)
export class FamiliasController {
  constructor(private readonly familias: FamiliasService) {}

  @Get()
  @Permisos("producto.ver")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("incluirInactivas") incluirInactivas?: string,
  ): Promise<FamiliaListado[]> {
    return this.familias.listar(usuario.empresaId, {
      incluirInactivas: incluirInactivas === "true",
    });
  }

  @Post()
  @Permisos("producto.crear")
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearFamiliaDto,
  ): Promise<FamiliaListado> {
    return this.familias.crear(usuario.empresaId, dto);
  }

  @Patch(":id")
  @Permisos("producto.crear")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarFamiliaDto,
  ): Promise<FamiliaListado> {
    return this.familias.actualizar(usuario.empresaId, id, dto);
  }

  @Delete(":id")
  @Permisos("producto.crear")
  darDeBaja(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ): Promise<FamiliaListado> {
    return this.familias.darDeBaja(usuario.empresaId, id);
  }
}
