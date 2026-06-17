import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { TrasladosService } from "./traslados.service.js";
import { CrearTrasladoDto, RecibirTrasladoDto } from "./dto/traslados.dto.js";

@Controller("traslados")
@UseGuards(JwtGuard, PermisosGuard)
export class TrasladosController {
  constructor(private readonly traslados: TrasladosService) {}

  @Get()
  @Permisos("inventario.movimiento.crear")
  listar(@UsuarioActual() usuario: UsuarioRequest) {
    return this.traslados.listar(usuario.empresaId);
  }

  @Post()
  @Permisos("inventario.movimiento.crear")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearTrasladoDto) {
    return this.traslados.crear(usuario, {
      almacenOrigenId: BigInt(dto.almacenOrigenId),
      almacenDestinoId: BigInt(dto.almacenDestinoId),
      numero: dto.numero,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({ skuId: BigInt(l.skuId), cantidad: l.cantidad })),
    });
  }

  @Post(":id/despachar")
  @Permisos("inventario.movimiento.crear")
  despachar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.traslados.despachar(usuario, BigInt(id));
  }

  @Post(":id/recibir")
  @Permisos("inventario.movimiento.crear")
  recibir(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: RecibirTrasladoDto,
  ) {
    return this.traslados.recibir(usuario, BigInt(id), {
      lineas: dto.lineas.map((l) => ({
        trasladoLineaId: BigInt(l.trasladoLineaId),
        cantidadRecibida: l.cantidadRecibida,
      })),
    });
  }

  @Post(":id/anular")
  @Permisos("inventario.movimiento.crear")
  anular(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.traslados.anular(usuario, BigInt(id));
  }
}
