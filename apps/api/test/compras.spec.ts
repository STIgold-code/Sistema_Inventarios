import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { ComprasService } from "../src/modulos/compras/compras.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion del modulo de compras: la recepcion parcial genera entradas en
 * el ledger y mueve el estado de la orden (EMITIDA -> PARCIAL -> COMPLETA).
 */
describe("ComprasService (integracion)", () => {
  const prisma = new PrismaService();
  const compras = new ComprasService(prisma, new MovimientoService(prisma));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
  let contador = 0;
  const RUN = Date.now().toString().slice(-9);

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
    almacenId = almacen.id;
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [] };

    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const producto = await prisma.producto.create({
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Compra test" },
    });
    const sku = await prisma.sku.create({
      data: {
        empresaId: empresa.id,
        productoId: producto.id,
        codigoParlante: `8${RUN}0001`,
        unidadId: unidad.id,
      },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("recepcion parcial genera entrada en ledger y deja la OC en PARCIAL, luego COMPLETA", async () => {
    const proveedor = await compras.crearProveedor(usuario.empresaId, {
      ruc: `2${RUN}1`,
      razonSocial: "Proveedor Test SAC",
    });

    contador += 1;
    const orden = await compras.crearOrdenCompra(usuario, {
      proveedorId: BigInt(proveedor.id),
      almacenId,
      numero: `OC-${RUN}-${contador}`,
      lineas: [{ skuId, cantidad: "100", costoUnitario: "10" }],
    });
    const oc = await prisma.ordenCompra.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });
    const lineaId = oc.lineas[0]!.id;

    // Recepcion parcial de 40 de 100.
    await compras.recibir(usuario, {
      ordenCompraId: BigInt(orden.id),
      lineas: [{ ordenCompraLineaId: lineaId, cantidad: "40" }],
    });

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(40);

    let estado = (await prisma.ordenCompra.findUniqueOrThrow({ where: { id: BigInt(orden.id) } })).estado;
    expect(estado).toBe("PARCIAL");

    // Recepcion del resto (60).
    await compras.recibir(usuario, {
      ordenCompraId: BigInt(orden.id),
      lineas: [{ ordenCompraLineaId: lineaId, cantidad: "60" }],
    });

    const item2 = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(item2.cantidadDisponible).toNumber()).toBe(100);

    estado = (await prisma.ordenCompra.findUniqueOrThrow({ where: { id: BigInt(orden.id) } })).estado;
    expect(estado).toBe("COMPLETA");
  });

  it("rechaza recibir mas de lo pendiente", async () => {
    const proveedor = await compras.crearProveedor(usuario.empresaId, {
      ruc: `2${RUN}2`,
      razonSocial: "Otro Proveedor SAC",
    });
    contador += 1;
    const orden = await compras.crearOrdenCompra(usuario, {
      proveedorId: BigInt(proveedor.id),
      almacenId,
      numero: `OC-${RUN}-${contador}`,
      lineas: [{ skuId, cantidad: "5", costoUnitario: "10" }],
    });
    const oc = await prisma.ordenCompra.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });
    await expect(
      compras.recibir(usuario, {
        ordenCompraId: BigInt(orden.id),
        lineas: [{ ordenCompraLineaId: oc.lineas[0]!.id, cantidad: "9" }],
      }),
    ).rejects.toThrow();
  });
});
