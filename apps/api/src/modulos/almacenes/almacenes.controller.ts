import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
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

class ActualizarSucursalDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
}

class ActualizarAlmacenDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(50) codigo?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) nombre?: string;
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
  listarSucursales(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("incluirInactivos") incluirInactivos?: string,
  ) {
    return this.almacenes.listarSucursales(
      usuario.empresaId,
      incluirInactivos === "true",
    );
  }

  @Post("sucursales")
  @Permisos("almacen.administrar")
  crearSucursal(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearSucursalDto) {
    return this.almacenes.crearSucursal(usuario.empresaId, dto);
  }

  @Post("sucursales/:id/baja")
  @Permisos("almacen.administrar")
  darBajaSucursal(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.almacenes.darBajaSucursal(usuario.empresaId, id);
  }

  @Post("sucursales/:id/reactivar")
  @Permisos("almacen.administrar")
  reactivarSucursal(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.almacenes.reactivarSucursal(usuario.empresaId, id);
  }

  @Patch("sucursales/:id")
  @Permisos("almacen.administrar")
  actualizarSucursal(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarSucursalDto,
  ) {
    return this.almacenes.actualizarSucursal(usuario.empresaId, id, dto);
  }

  @Get()
  @Permisos("inventario.ver")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("incluirInactivos") incluirInactivos?: string,
  ) {
    return this.almacenes.listarAlmacenes(
      usuario.empresaId,
      incluirInactivos === "true",
    );
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

  @Post(":id/baja")
  @Permisos("almacen.administrar")
  darBajaAlmacen(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.almacenes.darBajaAlmacen(usuario.empresaId, id);
  }

  @Post(":id/reactivar")
  @Permisos("almacen.administrar")
  reactivarAlmacen(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.almacenes.reactivarAlmacen(usuario.empresaId, id);
  }

  @Patch(":id")
  @Permisos("almacen.administrar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarAlmacenDto,
  ) {
    return this.almacenes.actualizarAlmacen(usuario.empresaId, id, dto);
  }

  @Get(":id/zonas")
  @Permisos("inventario.ver")
  listarZonas(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ) {
    return this.almacenes.listarZonas(usuario.empresaId, id);
  }

  @Post(":id/zonas")
  @Permisos("almacen.administrar")
  crearZona(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: CrearZonaDto,
  ) {
    return this.almacenes.crearZona(usuario.empresaId, id, dto);
  }

  @Patch(":id/zonas/:zonaId")
  @Permisos("almacen.administrar")
  actualizarZona(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Param("zonaId", ParseBigIntPipe) zonaId: bigint,
    @Body() dto: ActualizarZonaDto,
  ) {
    return this.almacenes.actualizarZona(usuario.empresaId, id, zonaId, dto);
  }

  @Patch(":id/zonas/:zonaId/baja")
  @Permisos("almacen.administrar")
  darBajaZona(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Param("zonaId", ParseBigIntPipe) zonaId: bigint,
  ) {
    return this.almacenes.darBajaZona(usuario.empresaId, id, zonaId);
  }
}
