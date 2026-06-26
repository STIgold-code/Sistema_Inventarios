import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { ContabilidadService, type TipoAsiento } from "./contabilidad.service.js";
import { ActualizarCuentasDto } from "./dto/contabilidad.dto.js";

const REGEX_PERIODO = /^\d{6}$/;
const TIPOS_ASIENTO = ["COSTO_VENTA", "CONSUMO", "COMPRA", "DEVOLUCION"] as const;

@Controller("contabilidad")
@UseGuards(JwtGuard, PermisosGuard)
export class ContabilidadController {
  constructor(private readonly contabilidad: ContabilidadService) {}

  @Get("cuentas")
  @Permisos("contabilidad.exportar")
  listarCuentas(@UsuarioActual() usuario: UsuarioRequest) {
    return this.contabilidad.listarCuentas(usuario.empresaId);
  }

  @Put("cuentas")
  @Permisos("contabilidad.exportar")
  guardarCuentas(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: ActualizarCuentasDto,
  ) {
    return this.contabilidad.guardarCuentas(usuario.empresaId, dto.cuentas);
  }

  @Get("asientos")
  @Permisos("contabilidad.exportar")
  async asientos(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("periodo") periodo: string,
    @Query("tipo") tipo?: string,
    @Query("formato") formato?: string,
    @Query("separador") separador?: string,
  ) {
    if (!periodo || !REGEX_PERIODO.test(periodo)) {
      throw new BadRequestException("periodo debe tener formato AAAAMM");
    }
    if (!tipo || !TIPOS_ASIENTO.includes(tipo as TipoAsiento)) {
      throw new BadRequestException("tipo debe ser COSTO_VENTA o CONSUMO");
    }
    const tipoAsiento = tipo as TipoAsiento;

    const resultado = await this.contabilidad.generarAsientos(
      usuario.empresaId,
      periodo,
      tipoAsiento,
    );

    if (formato === "texto") {
      const sep: "|" | "," = separador === "coma" ? "," : "|";
      const contenido = this.contabilidad.serializarTexto(
        resultado.lineas,
        sep,
      );
      const nombre = `asientos_${tipoAsiento}_${periodo}.txt`;
      return { nombre, contenido };
    }

    return resultado;
  }
}
