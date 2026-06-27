import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { TransferenciasCodigoService } from "./transferencias-codigo.service.js";
import { CrearTransferenciaCodigoDto } from "./dto/transferencias-codigo.dto.js";

@Controller("transferencias-codigo")
@UseGuards(JwtGuard, PermisosGuard)
export class TransferenciasCodigoController {
  constructor(private readonly transferencias: TransferenciasCodigoService) {}

  @Get()
  @Permisos("inventario.movimiento.crear")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.transferencias.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("inventario.movimiento.crear")
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearTransferenciaCodigoDto,
  ) {
    return this.transferencias.crear(usuario, {
      almacenId: BigInt(dto.almacenId),
      numero: dto.numero,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuOrigenId: BigInt(l.skuOrigenId),
        skuDestinoId: BigInt(l.skuDestinoId),
        cantidadOrigen: l.cantidadOrigen,
        factorConversion: l.factorConversion,
      })),
    });
  }
}
