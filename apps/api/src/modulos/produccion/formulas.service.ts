import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { CorrelativoService } from "../comun/correlativo/correlativo.service.js";

const D = Prisma.Decimal;

const ENTIDAD_AUDITORIA = "FORMULA";

export interface NuevaFormula {
  nombre: string;
  skuTerminadoId: bigint;
  cantidadBase: string;
  observaciones?: string;
  lineas: Array<{ skuInsumoId: bigint; cantidad: string }>;
}

/** Referencia a un SKU en las respuestas de la API. */
export interface SkuRef {
  id: string;
  codigoParlante: string;
  nombre: string;
  /** Código de la unidad de control (Tabla 6 SUNAT). */
  unidad: string;
}

interface FormulaCabecera {
  id: string;
  codigo: string;
  nombre: string;
  cantidadBase: string;
  activo: boolean;
  observaciones: string | null;
  skuTerminado: SkuRef;
}

export interface FormulaResumen extends FormulaCabecera {
  cantidadInsumos: number;
}

export interface FormulaDetalle extends FormulaCabecera {
  lineas: Array<{ id: string; cantidad: string; skuInsumo: SkuRef }>;
}

export interface FiltroFormulas {
  activo?: boolean;
  skuTerminadoId?: bigint;
}

@Injectable()
export class FormulasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly correlativos: CorrelativoService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Lista las fórmulas de la empresa por código. `activo` omitido = todas. */
  async listar(empresaId: bigint, filtro: FiltroFormulas = {}): Promise<FormulaResumen[]> {
    const filas = await this.prisma.formula.findMany({
      where: {
        empresaId,
        ...(filtro.activo !== undefined ? { activo: filtro.activo } : {}),
        ...(filtro.skuTerminadoId !== undefined
          ? { skuTerminadoId: filtro.skuTerminadoId }
          : {}),
      },
      include: { _count: { select: { lineas: true } } },
      orderBy: { codigo: "asc" },
    });
    const skus = await this.cargarSkus(
      empresaId,
      filas.map((f) => f.skuTerminadoId),
    );
    return filas.map((f) => ({
      ...this.mapearCabecera(f, skus),
      cantidadInsumos: f._count.lineas,
    }));
  }

  /** Obtiene una fórmula con sus insumos. 404 si no pertenece a la empresa. */
  async obtener(empresaId: bigint, id: bigint): Promise<FormulaDetalle> {
    const formula = await this.prisma.formula.findFirst({
      where: { id, empresaId },
      include: { lineas: { orderBy: { id: "asc" } } },
    });
    if (!formula) throw new NotFoundException("Fórmula no encontrada");
    const skus = await this.cargarSkus(empresaId, [
      formula.skuTerminadoId,
      ...formula.lineas.map((l) => l.skuInsumoId),
    ]);
    return {
      ...this.mapearCabecera(formula, skus),
      lineas: formula.lineas.map((l) => ({
        id: l.id.toString(),
        cantidad: l.cantidad.toString(),
        skuInsumo: this.referenciaSku(l.skuInsumoId, skus),
      })),
    };
  }

  /**
   * Crea la fórmula con sus insumos. Validación, correlativo, fórmula y
   * auditoría van en una sola transacción: la validación corre dentro de ella
   * (sin ventana entre validar y escribir) y ANTES de tomar el correlativo; si
   * falla, el rollback revierte todo y no se consume ningún número.
   */
  async crear(
    usuario: UsuarioRequest,
    datos: NuevaFormula,
  ): Promise<{ id: string; codigo: string }> {
    const insumos = datos.lineas.map((l) => l.skuInsumoId);

    const formula = await this.prisma.$transaction(async (tx) => {
      await this.validarSkus(tx, usuario.empresaId, [datos.skuTerminadoId, ...insumos]);
      this.validarComposicion(datos.skuTerminadoId, insumos);

      const correlativo = await this.correlativos.siguiente(
        tx,
        usuario.empresaId,
        "FORMULA",
      );
      const creada = await tx.formula.create({
        data: {
          empresaId: usuario.empresaId,
          codigo: correlativo.formateado,
          nombre: datos.nombre,
          skuTerminadoId: datos.skuTerminadoId,
          cantidadBase: new D(datos.cantidadBase),
          observaciones: datos.observaciones ?? null,
          lineas: { create: this.datosLineas(usuario.empresaId, datos.lineas) },
        },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "CREAR",
          entidad: ENTIDAD_AUDITORIA,
          entidadId: creada.id,
          detalle: `Fórmula ${creada.codigo} creada`,
        },
        tx,
      );
      return creada;
    });

    return { id: formula.id.toString(), codigo: formula.codigo };
  }

  /**
   * Actualiza los campos enviados. Pertenencia y estado activo se validan solo
   * para los SKU recibidos en la petición: el terminado guardado no se
   * revalida (ya se validó al asignarlo), pero sigue siendo el terminado
   * efectivo para la regla insumo ≠ terminado. Si llega `lineas`, reemplaza el
   * conjunto completo de insumos; si solo cambia el terminado, se valida contra
   * los insumos guardados. Una fórmula inactiva también se puede editar.
   * Validación y escritura van en la misma transacción.
   */
  async actualizar(
    usuario: UsuarioRequest,
    id: bigint,
    datos: Partial<NuevaFormula>,
  ): Promise<{ id: string }> {
    if (Object.values(datos).every((valor) => valor === undefined)) {
      throw new BadRequestException("No hay cambios que aplicar");
    }

    const lineas = datos.lineas;
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.formula.findFirst({
        where: { id, empresaId: usuario.empresaId },
        include: { lineas: true },
      });
      if (!actual) throw new NotFoundException("Fórmula no encontrada");

      const terminado = datos.skuTerminadoId ?? actual.skuTerminadoId;
      if (lineas !== undefined) {
        const insumos = lineas.map((l) => l.skuInsumoId);
        const recibidos =
          datos.skuTerminadoId !== undefined ? [datos.skuTerminadoId, ...insumos] : insumos;
        await this.validarSkus(tx, usuario.empresaId, recibidos);
        this.validarComposicion(terminado, insumos);
      } else if (terminado !== actual.skuTerminadoId) {
        await this.validarSkus(tx, usuario.empresaId, [terminado]);
        this.validarComposicion(
          terminado,
          actual.lineas.map((l) => l.skuInsumoId),
        );
      }

      if (lineas !== undefined) {
        await tx.formulaLinea.deleteMany({
          where: { formulaId: actual.id, empresaId: usuario.empresaId },
        });
      }
      await tx.formula.update({
        where: { id: actual.id },
        data: {
          nombre: datos.nombre,
          skuTerminadoId: datos.skuTerminadoId,
          cantidadBase:
            datos.cantidadBase !== undefined ? new D(datos.cantidadBase) : undefined,
          observaciones: datos.observaciones,
          ...(lineas !== undefined
            ? { lineas: { create: this.datosLineas(usuario.empresaId, lineas) } }
            : {}),
        },
      });
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "ACTUALIZAR",
          entidad: ENTIDAD_AUDITORIA,
          entidadId: actual.id,
          detalle: `Fórmula ${actual.codigo} actualizada`,
        },
        tx,
      );
    });

    return { id: id.toString() };
  }

  /** activo -> inactivo. Una fórmula inactiva no se puede elegir en órdenes nuevas. */
  async darDeBaja(usuario: UsuarioRequest, id: bigint): Promise<{ id: string }> {
    return this.cambiarActivo(usuario, id, false);
  }

  /** inactivo -> activo. */
  async reactivar(usuario: UsuarioRequest, id: bigint): Promise<{ id: string }> {
    return this.cambiarActivo(usuario, id, true);
  }

  /**
   * CAS sobre `activo` + auditoría en UNA transacción. Si el CAS no afecta
   * filas, distingue entre fórmula inexistente (404) y estado ya aplicado (409).
   */
  private async cambiarActivo(
    usuario: UsuarioRequest,
    id: bigint,
    activo: boolean,
  ): Promise<{ id: string }> {
    await this.prisma.$transaction(async (tx) => {
      const actualizadas = await tx.formula.updateMany({
        where: { id, empresaId: usuario.empresaId, activo: !activo },
        data: { activo },
      });
      const formula = await tx.formula.findFirst({
        where: { id, empresaId: usuario.empresaId },
        select: { codigo: true },
      });
      if (!formula) throw new NotFoundException("Fórmula no encontrada");
      if (actualizadas.count === 0) {
        throw new ConflictException(
          activo ? "La fórmula ya está activa" : "La fórmula ya está dada de baja",
        );
      }
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: activo ? "REACTIVAR" : "BAJA",
          entidad: ENTIDAD_AUDITORIA,
          entidadId: id,
          detalle: activo
            ? `Fórmula ${formula.codigo} reactivada`
            : `Fórmula ${formula.codigo} dada de baja`,
        },
        tx,
      );
    });
    return { id: id.toString() };
  }

  /**
   * Todos los SKU deben pertenecer a la empresa (anti-IDOR: 404 si alguno no)
   * y estar activos (400).
   */
  private async validarSkus(
    tx: Prisma.TransactionClient,
    empresaId: bigint,
    ids: bigint[],
  ): Promise<void> {
    const unicos = [...new Set(ids)];
    const skus = await tx.sku.findMany({
      where: { id: { in: unicos }, empresaId },
      select: { id: true, codigoParlante: true, activo: true },
    });
    if (skus.length !== unicos.length) {
      throw new NotFoundException("SKU no encontrado");
    }
    const inactivo = skus.find((s) => !s.activo);
    if (inactivo) {
      throw new BadRequestException(`El SKU ${inactivo.codigoParlante} está inactivo`);
    }
  }

  /** Reglas de la receta: al menos un insumo, distinto del terminado y sin repetir. */
  private validarComposicion(skuTerminadoId: bigint, insumos: bigint[]): void {
    if (insumos.length === 0) {
      throw new BadRequestException("La fórmula debe tener al menos un insumo");
    }
    if (insumos.some((insumo) => insumo === skuTerminadoId)) {
      throw new BadRequestException("Un insumo no puede ser el mismo producto terminado");
    }
    if (new Set(insumos).size !== insumos.length) {
      throw new BadRequestException("Un insumo no puede repetirse en la fórmula");
    }
  }

  private datosLineas(
    empresaId: bigint,
    lineas: NuevaFormula["lineas"],
  ): Prisma.FormulaLineaCreateWithoutFormulaInput[] {
    return lineas.map((l) => ({
      empresaId,
      skuInsumoId: l.skuInsumoId,
      cantidad: new D(l.cantidad),
    }));
  }

  private mapearCabecera(
    f: {
      id: bigint;
      codigo: string;
      nombre: string;
      cantidadBase: Prisma.Decimal;
      activo: boolean;
      observaciones: string | null;
      skuTerminadoId: bigint;
    },
    skus: Map<string, SkuRef>,
  ): FormulaCabecera {
    return {
      id: f.id.toString(),
      codigo: f.codigo,
      nombre: f.nombre,
      cantidadBase: f.cantidadBase.toString(),
      activo: f.activo,
      observaciones: f.observaciones,
      skuTerminado: this.referenciaSku(f.skuTerminadoId, skus),
    };
  }

  /** Mismo criterio de respaldo que `mapearVale` si el SKU no se encuentra. */
  private referenciaSku(skuId: bigint, skus: Map<string, SkuRef>): SkuRef {
    return (
      skus.get(skuId.toString()) ?? {
        id: skuId.toString(),
        codigoParlante: "",
        nombre: `SKU ${skuId}`,
        unidad: "",
      }
    );
  }

  /** Mapa skuId -> SkuRef para enriquecer cabeceras y líneas (patrón de vales). */
  private async cargarSkus(
    empresaId: bigint,
    ids: bigint[],
  ): Promise<Map<string, SkuRef>> {
    if (ids.length === 0) return new Map();
    const skus = await this.prisma.sku.findMany({
      where: { empresaId, id: { in: [...new Set(ids)] } },
      include: { producto: true, unidad: true },
    });
    return new Map(
      skus.map((s) => [
        s.id.toString(),
        {
          id: s.id.toString(),
          codigoParlante: s.codigoParlante,
          nombre: s.nombre ?? s.producto.nombre,
          unidad: s.unidad.codigo,
        },
      ]),
    );
  }
}
