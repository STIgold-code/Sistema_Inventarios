import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../comun/prisma/prisma.service.js";

interface NuevoProveedor {
  ruc: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  condicionPago?: string;
  monedaHabitual?: string;
  cci?: string;
  contactoNombre?: string;
  tipoDocIdentidad?: string;
}

interface CambioProveedor {
  razonSocial?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  condicionPago?: string;
  monedaHabitual?: string;
  cci?: string;
  contactoNombre?: string;
  tipoDocIdentidad?: string;
}

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  async crearProveedor(empresaId: bigint, dto: NuevoProveedor) {
    const proveedor = await this.prisma.proveedor.create({
      data: { empresaId, ...dto },
    });
    return { id: proveedor.id.toString() };
  }

  /** Edita un proveedor. Valida pertenencia a la empresa (anti-IDOR). */
  async actualizarProveedor(empresaId: bigint, id: bigint, dto: CambioProveedor) {
    const proveedor = await this.prisma.proveedor.findFirst({ where: { id, empresaId } });
    if (!proveedor) throw new NotFoundException("Proveedor no encontrado");
    await this.prisma.proveedor.update({ where: { id }, data: { ...dto } });
    return { id: id.toString() };
  }

  /** Baja logica del proveedor. Valida pertenencia a la empresa. */
  async desactivarProveedor(empresaId: bigint, id: bigint) {
    const proveedor = await this.prisma.proveedor.findFirst({ where: { id, empresaId } });
    if (!proveedor) throw new NotFoundException("Proveedor no encontrado");
    await this.prisma.proveedor.update({ where: { id }, data: { activo: false } });
    return { id: id.toString(), activo: false };
  }

  async listarProveedores(empresaId: bigint) {
    const filas = await this.prisma.proveedor.findMany({
      where: { empresaId, activo: true },
      orderBy: { razonSocial: "asc" },
    });
    return filas.map((p) => ({
      id: p.id.toString(),
      ruc: p.ruc,
      razonSocial: p.razonSocial,
      direccion: p.direccion,
      telefono: p.telefono,
      email: p.email,
      condicionPago: p.condicionPago,
      monedaHabitual: p.monedaHabitual,
      cci: p.cci,
      contactoNombre: p.contactoNombre,
      tipoDocIdentidad: p.tipoDocIdentidad,
    }));
  }
}
