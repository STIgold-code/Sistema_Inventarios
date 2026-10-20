import {
  BadRequestException,
  Body,
  Controller,
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
import { FormulasService } from "./formulas.service.js";
import { ActualizarFormulaDto, CrearFormulaDto } from "./dto/formulas.dto.js";

@Controller("formulas")
@UseGuards(JwtGuard, PermisosGuard)
export class FormulasController {
  constructor(private readonly formulas: FormulasService) {}

  @Get()
  @Permisos("formula.gestionar")
  listar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("activo") activo?: string,
    @Query("skuTerminadoId") skuTerminadoId?: string,
  ) {
    return this.formulas.listar(usuario.empresaId, {
      activo: activo === undefined ? undefined : activo === "true",
      skuTerminadoId: this.parsearSkuTerminadoId(skuTerminadoId),
    });
  }

  @Get(":id")
  @Permisos("formula.gestionar")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.formulas.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("formula.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearFormulaDto) {
    return this.formulas.crear(usuario, {
      nombre: dto.nombre,
      skuTerminadoId: BigInt(dto.skuTerminadoId),
      cantidadBase: dto.cantidadBase,
      observaciones: dto.observaciones,
      lineas: dto.lineas.map((l) => ({
        skuInsumoId: BigInt(l.skuInsumoId),
        cantidad: l.cantidad,
      })),
    });
  }

  @Patch(":id")
  @Permisos("formula.gestionar")
  actualizar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: ActualizarFormulaDto,
  ) {
    return this.formulas.actualizar(usuario, BigInt(id), {
      nombre: dto.nombre,
      skuTerminadoId:
        dto.skuTerminadoId !== undefined ? BigInt(dto.skuTerminadoId) : undefined,
      cantidadBase: dto.cantidadBase,
      observaciones: dto.observaciones,
      lineas: dto.lineas?.map((l) => ({
        skuInsumoId: BigInt(l.skuInsumoId),
        cantidad: l.cantidad,
      })),
    });
  }

  @Post(":id/baja")
  @Permisos("formula.gestionar")
  darDeBaja(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.formulas.darDeBaja(usuario, BigInt(id));
  }

  @Post(":id/reactivar")
  @Permisos("formula.gestionar")
  reactivar(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.formulas.reactivar(usuario, BigInt(id));
  }

  /** `skuTerminadoId` es opcional: vacío/omitido -> undefined; no numérico -> 400. */
  private parsearSkuTerminadoId(skuTerminadoId?: string): bigint | undefined {
    if (skuTerminadoId === undefined || skuTerminadoId === "") {
      return undefined;
    }
    if (!/^\d+$/.test(skuTerminadoId)) {
      throw new BadRequestException("skuTerminadoId inválido");
    }
    return BigInt(skuTerminadoId);
  }
}
