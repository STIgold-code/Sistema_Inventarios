import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { ReportesService } from "../reportes/reportes.service.js";
import type { ClasificarAbcDto } from "./dto/clasificar-abc.dto.js";
import type {
  ActualizarPreciosSkuDto,
  CrearProductoDto,
} from "./dto/crear-producto.dto.js";

const D = Prisma.Decimal;

export interface FamiliaResumen {
  id: string;
  codigo: string;
  nombre: string;
}

export interface UnidadResumen {
  id: string;
  codigo: string;
  nombre: string;
}

export interface SkuListado {
  id: string;
  codigoParlante: string;
  codigoUnspsc: string | null;
  codigoBarras: string | null;
  nombre: string | null;
  tipoExistencia: string;
  metodoValuacion: string;
  stockMinimo: string | null;
  // Precios de venta por nivel (null = sin configurar para ese nivel).
  precioPublico: string | null;
  precioDistribuidor: string | null;
  precioVenta3: string | null;
  precioVenta4: string | null;
  monedaVenta: string | null;
  activo: boolean;
  /** Si true, el SKU exige captura de numeros de serie en entradas y salidas. */
  controlaSerie: boolean;
  /** Renovabilidad: true = se repone/consume; false = no; null = sin clasificar. */
  esRenovable: boolean | null;
  producto: {
    id: string;
    nombre: string;
    activo: boolean;
  };
  familia: {
    id: string;
    codigo: string;
    nombre: string;
  };
  unidad: {
    id: string;
    codigo: string;
    nombre: string;
  };
  /** Unidad de referencia para multi-unidad (null si el SKU no la tiene). */
  unidadReferencia: {
    id: string;
    codigo: string;
    nombre: string;
  } | null;
  /** Cuantas unidades de control equivalen a UNA de referencia (null si no aplica). */
  factorConversion: string | null;
}

export interface DetalleStockPorAlmacen {
  almacenId: string;
  almacen: string;
  disponible: string;
  comprometida: string;
  deteriorada: string;
  costoPromedio: string;
  valor: string;
}

export interface DetalleMovimiento {
  fecha: string;
  tipo: string;
  signo: string;
  cantidad: string;
  almacen: string;
  documento: string | null;
}

export interface DetalleSku {
  id: string;
  codigoParlante: string;
  codigoBarras: string | null;
  codigoUnspsc: string | null;
  nombre: string | null;
  producto: { id: string; nombre: string; activo: boolean };
  familia: { id: string; codigo: string; nombre: string };
  unidad: { id: string; codigo: string; nombre: string };
  unidadReferencia: { id: string; codigo: string; nombre: string } | null;
  factorConversion: string | null;
  tipoExistencia: string;
  metodoValuacion: string;
  activo: boolean;
  creadoEn: string;
  esRenovable: boolean | null;
  clasificacionAbc: string | null;
  controlaSerie: boolean;
  controlaLote: boolean;
  controlaVencimiento: boolean;
  precios: {
    publico: string | null;
    distribuidor: string | null;
    venta3: string | null;
    venta4: string | null;
    moneda: string | null;
  };
  reposicion: {
    stockMinimo: string | null;
    stockMaximo: string | null;
    puntoReposicion: string | null;
    semanasReposicion: number | null;
  };
  stock: {
    totales: {
      disponible: string;
      comprometida: string;
      deteriorada: string;
      valorTotal: string;
    };
    porAlmacen: DetalleStockPorAlmacen[];
  };
  movimientos: DetalleMovimiento[];
}

export interface FiltroSkus {
  pagina?: number;
  porPagina?: number;
  busqueda?: string;
  /** Filtra por renovabilidad. Omitido = todos. */
  esRenovable?: boolean;
}

export interface PaginaSkus {
  datos: SkuListado[];
  pagina: number;
  porPagina: number;
  total: number;
}

const POR_PAGINA_DEFECTO = 20;
const POR_PAGINA_MAXIMO = 100;
const TIPO_EXISTENCIA_DEFECTO = "01";
const METODO_VALUACION_DEFECTO = "2";

/**
 * Catalogo de productos. Un Producto agrupa SKUs (presentaciones vendibles);
 * el primer SKU se crea junto con el producto. El codigo parlante de 14 digitos
 * codifica en sus 3 primeros la familia a la que pertenece (regla de negocio BM).
 */
@Injectable()
export class ProductoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportes: ReportesService,
  ) {}

  /**
   * Calcula la clasificacion ABC por valor de consumo y, si dto.persistir es
   * true, escribe clasificacionAbc en cada SKU clasificado dentro de una sola
   * transaccion. Devuelve el resultado del calculo mas el conteo persistido.
   */
  async clasificarAbc(empresaId: bigint, dto: ClasificarAbcDto) {
    if (dto.hasta < dto.desde) {
      throw new BadRequestException("hasta no puede ser anterior a desde");
    }
    const resultado = await this.reportes.clasificacionAbc(
      empresaId,
      dto.desde,
      dto.hasta,
    );

    let persistidos = 0;
    if (dto.persistir && resultado.filas.length > 0) {
      await this.prisma.$transaction(
        resultado.filas.map((f) =>
          this.prisma.sku.update({
            where: { id: BigInt(f.skuId) },
            data: { clasificacionAbc: f.clasificacion },
          }),
        ),
      );
      persistidos = resultado.filas.length;
    }

    return { ...resultado, persistir: dto.persistir ?? false, persistidos };
  }

  /**
   * Actualiza los precios de venta por nivel de un SKU. Valida pertenencia a la
   * empresa (anti-IDOR). Solo modifica los campos enviados en el DTO.
   */
  async actualizarPrecios(
    empresaId: bigint,
    skuId: bigint,
    dto: ActualizarPreciosSkuDto,
  ): Promise<{ id: string }> {
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, empresaId } });
    if (!sku) throw new BadRequestException("El SKU no pertenece a la empresa");

    const data: Prisma.SkuUpdateInput = {};
    if (dto.precioPublico !== undefined) data.precioPublico = new D(dto.precioPublico);
    if (dto.precioDistribuidor !== undefined) {
      data.precioDistribuidor = new D(dto.precioDistribuidor);
    }
    if (dto.precioVenta3 !== undefined) data.precioVenta3 = new D(dto.precioVenta3);
    if (dto.precioVenta4 !== undefined) data.precioVenta4 = new D(dto.precioVenta4);
    if (dto.monedaVenta !== undefined) data.monedaVenta = dto.monedaVenta;
    if (dto.esRenovable !== undefined) data.esRenovable = dto.esRenovable;

    await this.prisma.sku.update({ where: { id: skuId }, data });
    return { id: skuId.toString() };
  }

  /** Familias de la empresa, ordenadas por codigo para navegacion estable. */
  async listarFamilias(empresaId: bigint): Promise<FamiliaResumen[]> {
    const familias = await this.prisma.familia.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return familias.map((f) => ({
      id: f.id.toString(),
      codigo: f.codigo,
      nombre: f.nombre,
    }));
  }

  /** Unidades de medida de la empresa, ordenadas por codigo. */
  async listarUnidades(empresaId: bigint): Promise<UnidadResumen[]> {
    const unidades = await this.prisma.unidad.findMany({
      where: { empresaId },
      orderBy: { codigo: "asc" },
    });
    return unidades.map((u) => ({
      id: u.id.toString(),
      codigo: u.codigo,
      nombre: u.nombre,
    }));
  }

  /**
   * Crea un Producto y su primer SKU en una sola transaccion atomica.
   * Valida pertenencia de familia y unidad a la empresa, y que el prefijo
   * del codigo parlante (3 primeros digitos) coincida con el codigo de la familia.
   */
  async crearProductoConSku(
    empresaId: bigint,
    dto: CrearProductoDto,
  ): Promise<{ productoId: string; skuId: string }> {
    const familiaId = BigInt(dto.familiaId);
    const unidadId = BigInt(dto.unidadId);

    const familia = await this.prisma.familia.findFirst({
      where: { id: familiaId, empresaId },
    });
    if (!familia) {
      throw new BadRequestException("La familia indicada no pertenece a la empresa");
    }

    const unidad = await this.prisma.unidad.findFirst({
      where: { id: unidadId, empresaId },
    });
    if (!unidad) {
      throw new BadRequestException("La unidad indicada no pertenece a la empresa");
    }

    // Multi-unidad: unidad de referencia y factor van juntos o ninguno.
    let unidadReferenciaId: bigint | null = null;
    let factorConversion: Prisma.Decimal | null = null;
    if (dto.unidadReferenciaId !== undefined || dto.factorConversion !== undefined) {
      if (dto.unidadReferenciaId === undefined || dto.factorConversion === undefined) {
        throw new BadRequestException(
          "unidadReferenciaId y factorConversion deben enviarse juntos",
        );
      }
      unidadReferenciaId = BigInt(dto.unidadReferenciaId);
      const unidadRef = await this.prisma.unidad.findFirst({
        where: { id: unidadReferenciaId, empresaId },
      });
      if (!unidadRef) {
        throw new BadRequestException(
          "La unidad de referencia indicada no pertenece a la empresa",
        );
      }
      factorConversion = new D(dto.factorConversion);
      if (factorConversion.lessThanOrEqualTo(0)) {
        throw new BadRequestException("factorConversion debe ser mayor que cero");
      }
    }

    // Regla de negocio BM: los 3 primeros digitos del codigo parlante
    // codifican la familia y deben coincidir con su codigo.
    const prefijoFamilia = dto.codigoParlante.slice(0, 3);
    if (prefijoFamilia !== familia.codigo) {
      throw new BadRequestException(
        `Los 3 primeros digitos del codigo parlante (${prefijoFamilia}) deben coincidir con el codigo de la familia (${familia.codigo})`,
      );
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const producto = await tx.producto.create({
        data: {
          empresaId,
          familiaId,
          nombre: dto.nombre,
          descripcion: dto.descripcion ?? null,
        },
      });

      const sku = await tx.sku.create({
        data: {
          empresaId,
          productoId: producto.id,
          codigoParlante: dto.codigoParlante,
          codigoUnspsc: dto.codigoUnspsc ?? null,
          codigoBarras: dto.codigoBarras ?? null,
          unidadId,
          nombre: dto.nombreSku ?? null,
          tipoExistencia: dto.tipoExistencia ?? TIPO_EXISTENCIA_DEFECTO,
          metodoValuacion: dto.metodoValuacion ?? METODO_VALUACION_DEFECTO,
          stockMinimo: dto.stockMinimo ? new D(dto.stockMinimo) : null,
          stockMaximo: dto.stockMaximo ? new D(dto.stockMaximo) : null,
          puntoReposicion: dto.puntoReposicion ? new D(dto.puntoReposicion) : null,
          semanasReposicion: dto.semanasReposicion ?? null,
          unidadReferenciaId,
          factorConversion,
          precioPublico: dto.precioPublico ? new D(dto.precioPublico) : null,
          precioDistribuidor: dto.precioDistribuidor
            ? new D(dto.precioDistribuidor)
            : null,
          precioVenta3: dto.precioVenta3 ? new D(dto.precioVenta3) : null,
          precioVenta4: dto.precioVenta4 ? new D(dto.precioVenta4) : null,
          monedaVenta: dto.monedaVenta ?? null,
          esRenovable: dto.esRenovable ?? null,
        },
      });

      return { productoId: producto.id, skuId: sku.id };
    });

    return {
      productoId: resultado.productoId.toString(),
      skuId: resultado.skuId.toString(),
    };
  }

  /** Lista SKUs con su producto, familia y unidad. Paginacion simple por offset. */
  async listarSkus(empresaId: bigint, filtro: FiltroSkus = {}): Promise<PaginaSkus> {
    const pagina = filtro.pagina && filtro.pagina > 0 ? filtro.pagina : 1;
    const porPagina = this.normalizarPorPagina(filtro.porPagina);
    const busqueda = filtro.busqueda?.trim();

    const where: Prisma.SkuWhereInput = {
      empresaId,
      ...(filtro.esRenovable !== undefined ? { esRenovable: filtro.esRenovable } : {}),
      ...(busqueda
        ? {
            OR: [
              { codigoParlante: { contains: busqueda, mode: "insensitive" } },
              { nombre: { contains: busqueda, mode: "insensitive" } },
              { producto: { nombre: { contains: busqueda, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [total, skus] = await this.prisma.$transaction([
      this.prisma.sku.count({ where }),
      this.prisma.sku.findMany({
        where,
        include: {
          producto: { include: { familia: true } },
          unidad: true,
          unidadReferencia: true,
        },
        orderBy: { codigoParlante: "asc" },
        skip: (pagina - 1) * porPagina,
        take: porPagina,
      }),
    ]);

    return {
      datos: skus.map((s) => ({
        id: s.id.toString(),
        codigoParlante: s.codigoParlante,
        codigoUnspsc: s.codigoUnspsc,
        codigoBarras: s.codigoBarras,
        nombre: s.nombre,
        tipoExistencia: s.tipoExistencia,
        metodoValuacion: s.metodoValuacion,
        stockMinimo: s.stockMinimo ? s.stockMinimo.toString() : null,
        precioPublico: s.precioPublico ? s.precioPublico.toString() : null,
        precioDistribuidor: s.precioDistribuidor
          ? s.precioDistribuidor.toString()
          : null,
        precioVenta3: s.precioVenta3 ? s.precioVenta3.toString() : null,
        precioVenta4: s.precioVenta4 ? s.precioVenta4.toString() : null,
        monedaVenta: s.monedaVenta,
        activo: s.activo,
        controlaSerie: s.controlaSerie,
        esRenovable: s.esRenovable,
        producto: {
          id: s.producto.id.toString(),
          nombre: s.producto.nombre,
          activo: s.producto.activo,
        },
        familia: {
          id: s.producto.familia.id.toString(),
          codigo: s.producto.familia.codigo,
          nombre: s.producto.familia.nombre,
        },
        unidad: {
          id: s.unidad.id.toString(),
          codigo: s.unidad.codigo,
          nombre: s.unidad.nombre,
        },
        unidadReferencia: s.unidadReferencia
          ? {
              id: s.unidadReferencia.id.toString(),
              codigo: s.unidadReferencia.codigo,
              nombre: s.unidadReferencia.nombre,
            }
          : null,
        factorConversion: s.factorConversion
          ? s.factorConversion.toString()
          : null,
      })),
      pagina,
      porPagina,
      total,
    };
  }

  /**
   * Detalle completo de un SKU: identificacion, precios, reposicion, stock
   * agregado por almacen y ultimos movimientos. Cada posicion de stock se
   * agrega por almacen (suma de disponible/comprometida/deteriorada y costo
   * promedio derivado como valor/disponible). Lanza NotFoundException si el
   * SKU no existe o no pertenece a la empresa.
   */
  async obtenerDetalleSku(empresaId: bigint, skuId: bigint): Promise<DetalleSku> {
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, empresaId },
      include: {
        producto: { include: { familia: true } },
        unidad: true,
        unidadReferencia: true,
      },
    });
    if (!sku) throw new NotFoundException("SKU no encontrado");

    const [items, movimientos, almacenes] = await this.prisma.$transaction([
      this.prisma.itemStock.findMany({ where: { empresaId, skuId } }),
      this.prisma.movimientoStock.findMany({
        where: { empresaId, skuId },
        orderBy: [{ fechaMovimiento: "desc" }, { secuencia: "desc" }],
        take: 12,
      }),
      this.prisma.almacen.findMany({ where: { empresaId } }),
    ]);

    const nombreAlmacen = new Map<string, string>(
      almacenes.map((a) => [a.id.toString(), a.nombre]),
    );

    // Agregacion de stock por almacen. El valor se acumula por posicion
    // (disponible * costoPromedio de esa fila) y el costo promedio del almacen
    // se deriva como valor / disponible.
    const porAlmacen = new Map<
      string,
      {
        disp: Prisma.Decimal;
        comp: Prisma.Decimal;
        det: Prisma.Decimal;
        valor: Prisma.Decimal;
      }
    >();
    let totalDisp = new D(0);
    let totalComp = new D(0);
    let totalDet = new D(0);
    let totalValor = new D(0);
    for (const item of items) {
      const clave = item.almacenId.toString();
      const acum =
        porAlmacen.get(clave) ??
        { disp: new D(0), comp: new D(0), det: new D(0), valor: new D(0) };
      const valorItem = item.cantidadDisponible.mul(item.costoPromedio);
      acum.disp = acum.disp.plus(item.cantidadDisponible);
      acum.comp = acum.comp.plus(item.cantidadComprometida);
      acum.det = acum.det.plus(item.cantidadDeteriorada);
      acum.valor = acum.valor.plus(valorItem);
      porAlmacen.set(clave, acum);
      totalDisp = totalDisp.plus(item.cantidadDisponible);
      totalComp = totalComp.plus(item.cantidadComprometida);
      totalDet = totalDet.plus(item.cantidadDeteriorada);
      totalValor = totalValor.plus(valorItem);
    }

    return {
      id: sku.id.toString(),
      codigoParlante: sku.codigoParlante,
      codigoBarras: sku.codigoBarras,
      codigoUnspsc: sku.codigoUnspsc,
      nombre: sku.nombre,
      producto: {
        id: sku.producto.id.toString(),
        nombre: sku.producto.nombre,
        activo: sku.producto.activo,
      },
      familia: {
        id: sku.producto.familia.id.toString(),
        codigo: sku.producto.familia.codigo,
        nombre: sku.producto.familia.nombre,
      },
      unidad: {
        id: sku.unidad.id.toString(),
        codigo: sku.unidad.codigo,
        nombre: sku.unidad.nombre,
      },
      unidadReferencia: sku.unidadReferencia
        ? {
            id: sku.unidadReferencia.id.toString(),
            codigo: sku.unidadReferencia.codigo,
            nombre: sku.unidadReferencia.nombre,
          }
        : null,
      factorConversion: sku.factorConversion
        ? sku.factorConversion.toString()
        : null,
      tipoExistencia: sku.tipoExistencia,
      metodoValuacion: sku.metodoValuacion,
      activo: sku.activo,
      creadoEn: sku.creadoEn.toISOString(),
      esRenovable: sku.esRenovable,
      clasificacionAbc: sku.clasificacionAbc,
      controlaSerie: sku.controlaSerie,
      controlaLote: sku.controlaLote,
      controlaVencimiento: sku.controlaVencimiento,
      precios: {
        publico: sku.precioPublico ? sku.precioPublico.toString() : null,
        distribuidor: sku.precioDistribuidor
          ? sku.precioDistribuidor.toString()
          : null,
        venta3: sku.precioVenta3 ? sku.precioVenta3.toString() : null,
        venta4: sku.precioVenta4 ? sku.precioVenta4.toString() : null,
        moneda: sku.monedaVenta,
      },
      reposicion: {
        stockMinimo: sku.stockMinimo ? sku.stockMinimo.toString() : null,
        stockMaximo: sku.stockMaximo ? sku.stockMaximo.toString() : null,
        puntoReposicion: sku.puntoReposicion
          ? sku.puntoReposicion.toString()
          : null,
        semanasReposicion: sku.semanasReposicion,
      },
      stock: {
        totales: {
          disponible: totalDisp.toString(),
          comprometida: totalComp.toString(),
          deteriorada: totalDet.toString(),
          valorTotal: totalValor.toString(),
        },
        porAlmacen: [...porAlmacen.entries()].map(([almId, v]) => ({
          almacenId: almId,
          almacen: nombreAlmacen.get(almId) ?? "—",
          disponible: v.disp.toString(),
          comprometida: v.comp.toString(),
          deteriorada: v.det.toString(),
          costoPromedio: v.disp.isZero() ? "0" : v.valor.div(v.disp).toString(),
          valor: v.valor.toString(),
        })),
      },
      movimientos: movimientos.map((m) => {
        const documento = `${m.documentoTipo} ${m.serieComprobante ?? ""}${
          m.numeroComprobante ? "-" + m.numeroComprobante : ""
        }`.trim();
        return {
          fecha: m.fechaMovimiento.toISOString(),
          tipo: m.tipo,
          signo: m.signo,
          cantidad: m.cantidad.toString(),
          almacen: nombreAlmacen.get(m.almacenId.toString()) ?? "—",
          documento: documento.length > 0 ? documento : null,
        };
      }),
    };
  }

  private normalizarPorPagina(valor?: number): number {
    if (!valor || valor <= 0) return POR_PAGINA_DEFECTO;
    return Math.min(valor, POR_PAGINA_MAXIMO);
  }
}
