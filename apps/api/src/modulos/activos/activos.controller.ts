import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ActivosService } from "./activos.service.js";
import {
  CrearActivoDto,
  CrearCategoriaActivoDto,
  DepreciarDto,
} from "./dto/activos.dto.js";

@Controller("activos")
@UseGuards(JwtGuard, PermisosGuard)
export class ActivosController {
  constructor(private readonly activos: ActivosService) {}

  @Get("categorias")
  @Permisos("activo.gestionar")
  listarCategorias(@UsuarioActual() usuario: UsuarioRequest) {
    return this.activos.listarCategorias(usuario.empresaId);
  }

  @Post("categorias")
  @Permisos("activo.gestionar")
  crearCategoria(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearCategoriaActivoDto,
  ) {
    return this.activos.crearCategoria(usuario.empresaId, dto);
  }

  @Get()
  @Permisos("activo.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.activos.listarActivos(usuario.empresaId);
  }

  @Post()
  @Permisos("activo.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearActivoDto) {
    return this.activos.crearActivo(usuario.empresaId, {
      sucursalId: BigInt(dto.sucursalId),
      categoriaId: BigInt(dto.categoriaId),
      codigo: dto.codigo,
      nombre: dto.nombre,
      marca: dto.marca,
      modelo: dto.modelo,
      numeroSerie: dto.numeroSerie,
      departamento: dto.departamento,
      fechaCompra: dto.fechaCompra,
      valorAdquisicion: dto.valorAdquisicion,
      valorResidual: dto.valorResidual,
      vidaUtilMeses: dto.vidaUtilMeses,
    });
  }

  @Post("depreciar")
  @Permisos("activo.gestionar")
  depreciar(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: DepreciarDto) {
    return this.activos.depreciar(usuario.empresaId, dto.periodo);
  }
}
