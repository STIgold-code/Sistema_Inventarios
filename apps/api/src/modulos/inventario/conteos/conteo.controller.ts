import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, Matches } from "class-validator";
import { JwtGuard } from "../../../auth/jwt.guard.js";
import { PermisosGuard } from "../../../auth/permisos.guard.js";
import { Permisos } from "../../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../../comun/contexto/usuario-request.js";
import { ConteoService } from "./conteo.service.js";

class AbrirConteoDto {
  @IsInt()
  almacenId!: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

class RegistrarLineaDto {
  @IsInt()
  conteoId!: number;

  @IsInt()
  skuId!: number;

  @Matches(/^\d+(\.\d+)?$/, { message: "cantidadContada debe ser decimal" })
  cantidadContada!: string;
}

@Controller("conteos")
@UseGuards(JwtGuard, PermisosGuard)
export class ConteoController {
  constructor(private readonly conteos: ConteoService) {}

  @Post()
  @Permisos("inventario.movimiento.crear")
  abrir(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: AbrirConteoDto) {
    return this.conteos.abrir(usuario, BigInt(dto.almacenId), dto.observaciones);
  }

  @Post("lineas")
  @Permisos("inventario.movimiento.crear")
  registrarLinea(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: RegistrarLineaDto,
  ) {
    return this.conteos.registrarLinea(usuario, {
      conteoId: BigInt(dto.conteoId),
      skuId: BigInt(dto.skuId),
      cantidadContada: dto.cantidadContada,
    });
  }

  @Post(":id/aplicar")
  @Permisos("inventario.movimiento.crear")
  aplicar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.conteos.aplicar(usuario, BigInt(id));
  }

  @Get(":id")
  @Permisos("inventario.ver")
  detalle(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.conteos.detalle(usuario.empresaId, BigInt(id));
  }
}
