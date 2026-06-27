import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { MOTIVO_TRASLADO } from "@bm/tipos";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";

/** Mapa codigo SUNAT -> clave legible del catalogo Motivo de traslado (Catalogo 20). */
const ETIQUETA_MOTIVO: Record<string, string> = Object.fromEntries(
  Object.entries(MOTIVO_TRASLADO).map(([clave, codigo]) => [codigo, clave]),
);

const CODIGOS_MOTIVO = new Set<string>(Object.values(MOTIVO_TRASLADO));

interface NuevaGuia {
  serie: string;
  numero: string;
  fechaTraslado: Date;
  motivoTraslado: string;
  transportistaId?: bigint;
  transportistaDoc?: string;
  transportistaNombre?: string;
  puntoPartida: string;
  puntoLlegada: string;
  pesoBruto?: string;
  observaciones?: string;
  trasladoId?: bigint;
  ordenVentaId?: bigint;
}

interface FiltroGuias {
  trasladoId?: bigint;
  ordenVentaId?: bigint;
}

@Injectable()
export class GuiasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra la referencia de una guia de remision. NO emite la GRE electronica;
   * solo persiste el documento y lo asocia a un Traslado O al despacho de una
   * OrdenVenta (exactamente uno de los dos).
   */
  async crear(usuario: UsuarioRequest, dto: NuevaGuia) {
    const tieneTraslado = dto.trasladoId !== undefined;
    const tieneOrden = dto.ordenVentaId !== undefined;
    if (tieneTraslado === tieneOrden) {
      throw new BadRequestException(
        "Debes asociar la guia exactamente a un traslado o a una orden de venta.",
      );
    }

    if (!CODIGOS_MOTIVO.has(dto.motivoTraslado)) {
      throw new BadRequestException("El motivo de traslado no pertenece al catalogo SUNAT.");
    }

    // Aislamiento por empresa: el documento referido debe pertenecer al tenant.
    if (tieneTraslado) {
      const traslado = await this.prisma.traslado.findFirst({
        where: { id: dto.trasladoId, empresaId: usuario.empresaId },
        select: { id: true },
      });
      if (!traslado) throw new NotFoundException("Traslado no encontrado.");
    } else {
      const orden = await this.prisma.ordenVenta.findFirst({
        where: { id: dto.ordenVentaId, empresaId: usuario.empresaId },
        select: { id: true },
      });
      if (!orden) throw new NotFoundException("Orden de venta no encontrada.");
    }

    const duplicada = await this.prisma.guiaRemision.findUnique({
      where: {
        empresaId_serie_numero: {
          empresaId: usuario.empresaId,
          serie: dto.serie,
          numero: dto.numero,
        },
      },
      select: { id: true },
    });
    if (duplicada) {
      throw new BadRequestException(`Ya existe la guia ${dto.serie}-${dto.numero}.`);
    }

    // Transportista del maestro (opcional): valida pertenencia y deja un snapshot
    // denormalizado de RUC/nombre en el documento (las capturas manuales siguen
    // pudiendo enviar transportistaDoc/Nombre directamente).
    let transportistaDoc = dto.transportistaDoc ?? null;
    let transportistaNombre = dto.transportistaNombre ?? null;
    if (dto.transportistaId !== undefined) {
      const transportista = await this.prisma.transportista.findFirst({
        where: { id: dto.transportistaId, empresaId: usuario.empresaId },
        select: { ruc: true, nombre: true },
      });
      if (!transportista) throw new NotFoundException("Transportista no encontrado.");
      transportistaDoc = dto.transportistaDoc ?? transportista.ruc;
      transportistaNombre = dto.transportistaNombre ?? transportista.nombre;
    }

    const guia = await this.prisma.guiaRemision.create({
      data: {
        empresaId: usuario.empresaId,
        serie: dto.serie,
        numero: dto.numero,
        fechaTraslado: dto.fechaTraslado,
        motivoTraslado: dto.motivoTraslado,
        transportistaId: dto.transportistaId ?? null,
        transportistaDoc,
        transportistaNombre,
        puntoPartida: dto.puntoPartida,
        puntoLlegada: dto.puntoLlegada,
        pesoBruto: dto.pesoBruto ?? null,
        observaciones: dto.observaciones ?? null,
        trasladoId: dto.trasladoId ?? null,
        ordenVentaId: dto.ordenVentaId ?? null,
      },
    });
    return { id: guia.id.toString() };
  }

  async listar(empresaId: bigint, filtro: FiltroGuias = {}) {
    const guias = await this.prisma.guiaRemision.findMany({
      where: {
        empresaId,
        ...(filtro.trasladoId !== undefined ? { trasladoId: filtro.trasladoId } : {}),
        ...(filtro.ordenVentaId !== undefined ? { ordenVentaId: filtro.ordenVentaId } : {}),
      },
      include: {
        traslado: { select: { numero: true } },
        ordenVenta: { select: { numero: true } },
      },
      orderBy: { creadoEn: "desc" },
    });
    return guias.map((g) => this.serializar(g));
  }

  async obtener(empresaId: bigint, id: bigint) {
    const guia = await this.prisma.guiaRemision.findFirst({
      where: { id, empresaId },
      include: {
        traslado: { select: { numero: true } },
        ordenVenta: { select: { numero: true } },
      },
    });
    if (!guia) throw new NotFoundException("Guia de remision no encontrada.");
    return this.serializar(guia);
  }

  private serializar(g: {
    id: bigint;
    serie: string;
    numero: string;
    fechaTraslado: Date;
    motivoTraslado: string;
    transportistaDoc: string | null;
    transportistaNombre: string | null;
    puntoPartida: string;
    puntoLlegada: string;
    pesoBruto: { toString(): string } | null;
    observaciones: string | null;
    trasladoId: bigint | null;
    ordenVentaId: bigint | null;
    traslado: { numero: string } | null;
    ordenVenta: { numero: string } | null;
  }) {
    return {
      id: g.id.toString(),
      serie: g.serie,
      numero: g.numero,
      serieNumero: `${g.serie}-${g.numero}`,
      fechaTraslado: g.fechaTraslado.toISOString(),
      motivoTraslado: g.motivoTraslado,
      motivoLabel: ETIQUETA_MOTIVO[g.motivoTraslado] ?? g.motivoTraslado,
      transportistaDoc: g.transportistaDoc,
      transportistaNombre: g.transportistaNombre,
      puntoPartida: g.puntoPartida,
      puntoLlegada: g.puntoLlegada,
      pesoBruto: g.pesoBruto ? g.pesoBruto.toString() : null,
      observaciones: g.observaciones,
      trasladoId: g.trasladoId ? g.trasladoId.toString() : null,
      trasladoNumero: g.traslado?.numero ?? null,
      ordenVentaId: g.ordenVentaId ? g.ordenVentaId.toString() : null,
      ordenVentaNumero: g.ordenVenta?.numero ?? null,
    };
  }
}
