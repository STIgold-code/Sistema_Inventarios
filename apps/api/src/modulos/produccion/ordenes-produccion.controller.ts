import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { EstadoOrdenProduccion } from "@prisma/client";
import { JwtGuard } from "../../auth/jwt.guard.js";
import { PermisosGuard } from "../../auth/permisos.guard.js";
import { Permisos } from "../../comun/decoradores/permisos.decorator.js";
import { UsuarioActual } from "../../comun/decoradores/usuario-actual.decorator.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { FormulasService, type FormulaResumen } from "./formulas.service.js";
import { OrdenesProduccionService } from "./ordenes-produccion.service.js";
import {
  CerrarOrdenProduccionDto,
  CrearOrdenProduccionDto,
} from "./dto/ordenes-produccion.dto.js";

const ESTADOS_ORDEN: readonly string[] = Object.values(EstadoOrdenProduccion);

function esEstadoOrden(valor: string): valor is EstadoOrdenProduccion {
  return ESTADOS_ORDEN.includes(valor);
}

@Controller("ordenes-produccion")
@UseGuards(JwtGuard, PermisosGuard)
export class OrdenesProduccionController {
  constructor(
    private readonly ordenes: OrdenesProduccionService,
    private readonly formulas: FormulasService,
  ) {}

  @Get()
  @Permisos("produccion.gestionar")
  listar(@UsuarioActual() usuario: UsuarioRequest, @Query("estado") estado?: string) {
    return this.ordenes.listar(usuario.empresaId, { estado: this.parsearEstado(estado) });
  }

  /**
   * Catálogo de fórmulas activas para registrar órdenes: solo lectura con el
   * permiso de producción, sin exigir `formula.gestionar` (derecho de edición).
   * Va antes de `GET :id`: Nest resuelve las rutas en orden de declaración.
   */
  @Get("formulas-disponibles")
  @Permisos("produccion.gestionar")
  formulasDisponibles(@UsuarioActual() usuario: UsuarioRequest): Promise<FormulaResumen[]> {
    return this.formulas.listar(usuario.empresaId, { activo: true });
  }

  @Get(":id")
  @Permisos("produccion.gestionar")
  obtener(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.ordenes.obtener(usuario.empresaId, BigInt(id));
  }

  @Post()
  @Permisos("produccion.gestionar")
  crear(@UsuarioActual() usuario: UsuarioRequest, @Body() dto: CrearOrdenProduccionDto) {
    return this.ordenes.crear(usuario, {
      formulaId: BigInt(dto.formulaId),
      cantidadPlanificada: dto.cantidadPlanificada,
      almacenInsumosId: BigInt(dto.almacenInsumosId),
      almacenDestinoId: BigInt(dto.almacenDestinoId),
      centroCostoId: BigInt(dto.centroCostoId),
      ordenTrabajoId:
        dto.ordenTrabajoId !== undefined ? BigInt(dto.ordenTrabajoId) : undefined,
      observaciones: dto.observaciones,
    });
  }

  @Post(":id/generar-vale")
  @Permisos("produccion.gestionar", "vale.crear")
  generarVale(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.ordenes.generarVale(usuario, BigInt(id));
  }

  @Post(":id/anular")
  @Permisos("produccion.gestionar")
  anular(@UsuarioActual() usuario: UsuarioRequest, @Param("id") id: string) {
    return this.ordenes.anular(usuario, BigInt(id));
  }

  @Post(":id/cerrar")
  @Permisos("produccion.cerrar")
  cerrar(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id") id: string,
    @Body() dto: CerrarOrdenProduccionDto,
  ) {
    return this.ordenes.cerrar(usuario, BigInt(id), {
      cantidadProducida: dto.cantidadProducida,
      almacenDestinoId:
        dto.almacenDestinoId !== undefined ? BigInt(dto.almacenDestinoId) : undefined,
      observaciones: dto.observaciones,
    });
  }

  /** `estado` es opcional: vacío/omitido -> undefined; fuera del enum -> 400. */
  private parsearEstado(estado?: string): EstadoOrdenProduccion | undefined {
    if (estado === undefined || estado === "") return undefined;
    if (!esEstadoOrden(estado)) {
      throw new BadRequestException("estado inválido");
    }
    return estado;
  }
}
