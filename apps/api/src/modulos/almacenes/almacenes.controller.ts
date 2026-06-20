import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from "class-validator";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AlmacenesService } from "./almacenes.service.js";

class CrearSucursalDto {
  @IsString() @MinLength(1) codigo!: string;
  @IsString() @MinLength(1) nombre!: string;
}

class CrearAlmacenDto {
  @IsInt() sucursalId!: number;
  @IsString() @MinLength(1) codigo!: string;
  @IsString() @MinLength(1) nombre!: string;
}

class CrearZonaDto {
  @IsString() @MinLength(1) codigo!: string;
  @IsString() @MinLength(1) nombre!: string;
  @IsOptional() @IsString() descripcion?: string;
}

class ActualizarZonaDto {
  @IsOptional() @IsString() @MinLength(1) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) nombre?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsBoolean() activo?: boolean;
}

@Controller("almacenes")
@UseGuards(JwtGuard, PermisosGuard)
export class AlmacenesController {
  constructor(private readonly almacenes: AlmacenesService) {}

  @Get("sucursales")
  @Permisos("inventario.ver")
  listarSucursales(@UsuarioActual() usuario: UsuarioRequest) {
    return this.almacenes.listarSucursales(usuario.empresaId);
  }

  @Post("sucursales")
  @Permisos("almacen.administrar")
  crearSucursal(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearSucursalDto) {
    return this.almacenes.crearSucursal(usuario.empresaId, dto);
  }

  @Get()
  @Permisos("inventario.ver")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.almacenes.listarAlmacenes(usuario.empresaId);
  }

  @Post()
  @Permisos("almacen.administrar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearAlmacenDto) {
    return this.almacenes.crearAlmacen(usuario.empresaId, {
      sucursalId: BigInt(dto.sucursalId),
      codigo: dto.codigo,
      nombre: dto.nombre,
    });
  }

  @Get(":id/zonas")
  @Permisos("inventario.ver")
  listarZonas(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.almacenes.listarZonas(usuario.empresaId, BigInt(id));
  }

  @Post(":id/zonas")
  @Permisos("almacen.administrar")
  crearZona(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: CrearZonaDto,
  ) {
    return this.almacenes.crearZona(usuario.empresaId, BigInt(id), dto);
  }

  @Patch(":id/zonas/:zonaId")
  @Permisos("almacen.administrar")
  actualizarZona(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Param("zonaId") zonaId: string,
    @Body() dto: ActualizarZonaDto,
  ) {
    return this.almacenes.actualizarZona(usuario.empresaId, BigInt(id), BigInt(zonaId), dto);
  }

  @Patch(":id/zonas/:zonaId/baja")
  @Permisos("almacen.administrar")
  darBajaZona(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Param("zonaId") zonaId: string,
  ) {
    return this.almacenes.darBajaZona(usuario.empresaId, BigInt(id), BigInt(zonaId));
  }
}
