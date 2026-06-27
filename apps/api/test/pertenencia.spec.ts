import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { ParametrosService } from "../src/modulos/parametros/parametros.service.js";
import { ComprasService } from "../src/modulos/compras/compras.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Aislamiento por empresa (anti-IDOR): crear una orden de compra que referencie
 * un SKU o un almacen de OTRA empresa debe ser rechazado ANTES de tocar la OC o
 * el ledger. La validacion de pertenencia no debe depender de la unidad de
 * referencia: cualquier SKU ajeno (incluso enUnidadReferencia=false) se rechaza.
 */
describe("Pertenencia por empresa en orden de compra (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(
    prisma,
    new TiposCambioService(prisma),
    new AuditoriaService(prisma),
  );
  const compras = new ComprasService(
    prisma,
    movimientos,
    new CorrelativoService(),
    new AuditoriaService(prisma),
    new ParametrosService(prisma),
  );

  let usuario: UsuarioRequest;
  let almacenPropio: bigint;
  let skuPropio: bigint;
  let proveedorPropio: bigint;
  let almacenAjeno: bigint;
  let skuAjeno: bigint;
  const RUN = Date.now().toString().slice(-9);

  beforeAll(async () => {
    await prisma.$connect();
    // Empresa A (propia): toma una existente con datos sembrados.
    const empresaA = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresaA.id } });
    const almacenA = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresaA.id } });
    almacenPropio = almacenA.id;
    usuario = { id: admin.id, empresaId: empresaA.id, email: admin.email, nombre: admin.nombre, permisos: [] };

    const familiaA = await prisma.familia.findFirstOrThrow({ where: { empresaId: empresaA.id } });
    const unidadA = await prisma.unidad.findFirstOrThrow({ where: { empresaId: empresaA.id } });
    const productoA = await prisma.producto.create({
      data: { empresaId: empresaA.id, familiaId: familiaA.id, nombre: "Pertenencia test A" },
    });
    const skuA = await prisma.sku.create({
      data: { empresaId: empresaA.id, productoId: productoA.id, codigoParlante: `8${RUN}A`, unidadId: unidadA.id },
    });
    skuPropio = skuA.id;
    const proveedor = await prisma.proveedor.create({
      data: { empresaId: empresaA.id, ruc: `80${RUN}`, razonSocial: "Proveedor Pertenencia SAC" },
    });
    proveedorPropio = proveedor.id;

    // Empresa B (ajena): se crea aislada con su propia sucursal, almacen y SKU.
    const empresaB = await prisma.empresa.create({
      data: { ruc: `20${RUN}`, razonSocial: "Empresa Ajena Pertenencia SAC", nombre: "Empresa Ajena" },
    });
    const sucursalB = await prisma.sucursal.create({
      data: { empresaId: empresaB.id, codigo: `SUC-${RUN.slice(-4)}`, nombre: "Sucursal ajena" },
    });
    almacenAjeno = (
      await prisma.almacen.create({
        data: { empresaId: empresaB.id, sucursalId: sucursalB.id, codigo: `ALM-${RUN.slice(-4)}`, nombre: "Almacen ajeno" },
      })
    ).id;
    const familiaB = await prisma.familia.create({
      data: { empresaId: empresaB.id, codigo: `F${RUN.slice(-4)}`, nombre: "Familia ajena" },
    });
    const unidadB = await prisma.unidad.create({
      data: { empresaId: empresaB.id, codigo: `U${RUN.slice(-3)}`, nombre: "Unidad ajena" },
    });
    const productoB = await prisma.producto.create({
      data: { empresaId: empresaB.id, familiaId: familiaB.id, nombre: "Pertenencia test B" },
    });
    skuAjeno = (
      await prisma.sku.create({
        data: { empresaId: empresaB.id, productoId: productoB.id, codigoParlante: `8${RUN}B`, unidadId: unidadB.id },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rechaza una OC con un skuId de otra empresa (sin depender de unidad de referencia)", async () => {
    await expect(
      compras.crearOrdenCompra(usuario, {
        proveedorId: proveedorPropio,
        almacenId: almacenPropio,
        lineas: [
          { skuId: skuPropio, cantidad: "5", costoUnitario: "10" },
          { skuId: skuAjeno, cantidad: "5", costoUnitario: "10" },
        ],
      }),
    ).rejects.toThrow(/no pertenece a la empresa/);

    // No quedo OC huerfana: la validacion corre antes de crear nada.
    const ordenes = await prisma.ordenCompra.count({
      where: { empresaId: usuario.empresaId, proveedorId: proveedorPropio },
    });
    expect(ordenes).toBe(0);
  });

  it("rechaza una OC con un almacenId de otra empresa", async () => {
    await expect(
      compras.crearOrdenCompra(usuario, {
        proveedorId: proveedorPropio,
        almacenId: almacenAjeno,
        lineas: [{ skuId: skuPropio, cantidad: "5", costoUnitario: "10" }],
      }),
    ).rejects.toThrow(/Almacén no encontrado/);

    const ordenes = await prisma.ordenCompra.count({
      where: { empresaId: usuario.empresaId, proveedorId: proveedorPropio },
    });
    expect(ordenes).toBe(0);
  });
});
