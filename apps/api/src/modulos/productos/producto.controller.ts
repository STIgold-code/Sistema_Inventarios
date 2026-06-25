import {
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
import { ParseBigIntPipe } from "../../comun/pipes/parse-bigint.pipe.js";
import { ClasificarAbcDto } from "./dto/clasificar-abc.dto.js";
import {
  ActualizarPreciosSkuDto,
  CrearProductoDto,
} from "./dto/crear-producto.dto.js";
import {
  DetalleSku,
  FamiliaResumen,
  PaginaSkus,
  ProductoService,
  UnidadResumen,
} from "./producto.service.js";

@Controller("productos")
@UseGuards(JwtGuard, PermisosGuard)
export class ProductoController {
  constructor(private readonly productos: ProductoService) {}

  @Get("familias")
  @Permisos("producto.ver")
  listarFamilias(
    @UsuarioActual() usuario: UsuarioRequest,
  ): Promise<FamiliaResumen[]> {
    return this.productos.listarFamilias(usuario.empresaId);
  }

  @Get("unidades")
  @Permisos("producto.ver")
  listarUnidades(
    @UsuarioActual() usuario: UsuarioRequest,
  ): Promise<UnidadResumen[]> {
    return this.productos.listarUnidades(usuario.empresaId);
  }

  @Get("skus")
  @Permisos("producto.ver")
  listarSkus(
    @UsuarioActual() usuario: UsuarioRequest,
    @Query("pagina") pagina?: string,
    @Query("porPagina") porPagina?: string,
    @Query("busqueda") busqueda?: string,
    @Query("esRenovable") esRenovable?: string,
  ): Promise<PaginaSkus> {
    return this.productos.listarSkus(usuario.empresaId, {
      pagina: pagina ? Number(pagina) : undefined,
      porPagina: porPagina ? Number(porPagina) : undefined,
      busqueda,
      esRenovable:
        esRenovable === undefined ? undefined : esRenovable === "true",
    });
  }

  @Get("skus/:id")
  @Permisos("producto.ver")
  obtenerDetalleSku(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
  ): Promise<DetalleSku> {
    return this.productos.obtenerDetalleSku(usuario.empresaId, id);
  }

  @Post()
  @Permisos("producto.crear")
  crear(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: CrearProductoDto,
  ): Promise<{ productoId: string; skuId: string }> {
    return this.productos.crearProductoConSku(usuario.empresaId, dto);
  }

  @Patch("skus/:id/precios")
  @Permisos("producto.editar")
  actualizarPrecios(
    @UsuarioActual() usuario: UsuarioRequest,
    @Param("id", ParseBigIntPipe) id: bigint,
    @Body() dto: ActualizarPreciosSkuDto,
  ): Promise<{ id: string }> {
    return this.productos.actualizarPrecios(usuario.empresaId, id, dto);
  }

  @Post("clasificar-abc")
  @Permisos("producto.editar")
  clasificarAbc(
    @UsuarioActual() usuario: UsuarioRequest,
    @Body() dto: ClasificarAbcDto,
  ) {
    return this.productos.clasificarAbc(usuario.empresaId, dto);
  }
}
