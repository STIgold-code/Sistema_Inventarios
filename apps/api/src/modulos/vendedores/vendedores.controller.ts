import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { VendedoresService } from "./vendedores.service.js";
import { ActualizarVendedorDto, CrearVendedorDto } from "./dto/vendedores.dto.js";

@Controller("vendedores")
@UseGuards(JwtGuard, PermisosGuard)
export class VendedoresController {
  constructor(private readonly vendedores: VendedoresService) {}

  @Get()
  @Permisos("inventario.ver")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.vendedores.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("venta.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearVendedorDto) {
    return this.vendedores.crear(usuario.empresaId, dto);
  }

  @Patch(":id")
  @Permisos("venta.gestionar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarVendedorDto,
  ) {
    return this.vendedores.actualizar(usuario.empresaId, id, dto);
  }
}
