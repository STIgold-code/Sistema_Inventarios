import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { VentasService } from "../src/modulos/ventas/ventas.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion de ventas: la orden RESERVA (mueve disponible a comprometido)
 * y el despacho descuenta del comprometido generando salidas en el ledger.
 */
describe("VentasService (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma);
  const ventas = new VentasService(prisma, movimientos);

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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Venta test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `7${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    // Stock inicial: 100 unidades.
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reserva al crear la orden y despacha desde el comprometido", async () => {
    contador += 1;
    const orden = await ventas.crearOrdenVenta(usuario, {
      almacenId,
      numero: `OV-${RUN}-${contador}`,
      cliente: "Cliente Test",
      lineas: [{ skuId, cantidad: "30", precioUnitario: "12" }],
    });

    // Tras reservar: disponible 70, comprometido 30 (fisico sigue 100).
    let item = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(70);
    expect(new Prisma.Decimal(item.cantidadComprometida).toNumber()).toBe(30);

    const ov = await prisma.ordenVenta.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });

    // Despacho parcial de 20.
    await ventas.despachar(usuario, {
      ordenVentaId: BigInt(orden.id),
      lineas: [{ ordenVentaLineaId: ov.lineas[0]!.id, cantidad: "20" }],
    });

    item = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    // disponible 70 (sin cambio), comprometido 10 (30-20), fisico 80.
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(70);
    expect(new Prisma.Decimal(item.cantidadComprometida).toNumber()).toBe(10);

    const estado = (await prisma.ordenVenta.findUniqueOrThrow({ where: { id: BigInt(orden.id) } })).estado;
    expect(estado).toBe("PARCIAL");
  });

  it("anular libera la reserva pendiente", async () => {
    contador += 1;
    const orden = await ventas.crearOrdenVenta(usuario, {
      almacenId,
      numero: `OV-${RUN}-${contador}`,
      lineas: [{ skuId, cantidad: "10" }],
    });
    const antes = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    const compAntes = new Prisma.Decimal(antes.cantidadComprometida).toNumber();

    await ventas.anular(usuario, BigInt(orden.id));

    const despues = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(despues.cantidadComprometida).toNumber()).toBe(compAntes - 10);
    const estado = (await prisma.ordenVenta.findUniqueOrThrow({ where: { id: BigInt(orden.id) } })).estado;
    expect(estado).toBe("ANULADA");
  });
});
