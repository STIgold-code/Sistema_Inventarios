import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { VentasService } from "../src/modulos/ventas/ventas.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Atomicidad transaccional del despacho multi-linea: si la SEGUNDA linea falla
 * por stock insuficiente, la PRIMERA (ya escrita en el ledger inmutable dentro
 * de la misma transaccion) NO debe quedar commiteada. Sin movimientos huerfanos,
 * sin comprobante, sin stock comprometido alterado.
 */
describe("Atomicidad despacho multi-linea (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(
    prisma,
    new TiposCambioService(prisma),
    new AuditoriaService(prisma),
  );
  const ventas = new VentasService(prisma, movimientos, new AuditoriaService(prisma));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuA: bigint;
  let skuB: bigint;
  let clienteId: bigint;
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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Atomicidad test" },
    });
    const crearSku = async (sufijo: string) => {
      const sku = await prisma.sku.create({
        data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `9${RUN}${sufijo}`, unidadId: unidad.id },
      });
      return sku.id;
    };
    skuA = await crearSku("A");
    skuB = await crearSku("B");
    const cliente = await prisma.cliente.create({
      data: { empresaId: empresa.id, tipoDocIdentidad: "6", numeroDoc: `9${RUN}9`, razonSocial: "Cliente Atomicidad SAC" },
    });
    clienteId = cliente.id;

    // Stock inicial para ambos SKUs.
    await movimientos.recibirCompra(usuario, { skuId: skuA, almacenId, cantidad: "50", costoUnitario: "5" });
    await movimientos.recibirCompra(usuario, { skuId: skuB, almacenId, cantidad: "50", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("si la 2da linea falla, la 1ra NO queda commiteada (sin movimiento huerfano, stock intacto)", async () => {
    // La orden RESERVA 10 de A y 10 de B (disponible -> comprometido).
    const orden = await ventas.crearOrdenVenta(usuario, {
      almacenId,
      numero: `OV-ATOM-${RUN}`,
      clienteId,
      lineas: [
        { skuId: skuA, cantidad: "10" },
        { skuId: skuB, cantidad: "10" },
      ],
    });
    const ov = await prisma.ordenVenta.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });
    const lineaA = ov.lineas.find((l) => l.skuId === skuA)!;
    const lineaB = ov.lineas.find((l) => l.skuId === skuB)!;

    // Inyectar el fallo: liberamos la reserva de B (su comprometido vuelve a 0).
    // El despacho pasa la validacion de pendiente (la orden sigue diciendo 10),
    // pero la salida del ledger DESDE reserva de B fallara por stock insuficiente.
    await movimientos.liberarReserva(usuario, { skuId: skuB, almacenId, cantidad: "10" });

    // Snapshot ANTES del despacho que va a fallar.
    const itemA0 = await prisma.itemStock.findFirstOrThrow({ where: { skuId: skuA, almacenId } });
    const movsA0 = await prisma.movimientoStock.count({
      where: { empresaId: usuario.empresaId, skuId: skuA, tipo: "SALIDA_VENTA" },
    });

    // Despacho multi-linea: linea A (ok) seguida de linea B (falla).
    await expect(
      ventas.despachar(usuario, {
        ordenVentaId: BigInt(orden.id),
        comprobante: {
          tipoDocumentoSunat: "01",
          serie: `F${RUN.slice(-3)}`,
          numero: "9001",
          fechaEmision: new Date("2026-06-15T00:00:00.000Z"),
          subtotal: "100",
          igv: "18",
          total: "118",
        },
        lineas: [
          { ordenVentaLineaId: lineaA.id, cantidad: "10" },
          { ordenVentaLineaId: lineaB.id, cantidad: "10" },
        ],
      }),
    ).rejects.toThrow();

    // La transaccion entera revirtio: la salida de A NO se commiteo.
    const movsA1 = await prisma.movimientoStock.count({
      where: { empresaId: usuario.empresaId, skuId: skuA, tipo: "SALIDA_VENTA" },
    });
    expect(movsA1).toBe(movsA0);

    // El stock de A quedo intacto (comprometido sin cambios, sin descuento).
    const itemA1 = await prisma.itemStock.findFirstOrThrow({ where: { skuId: skuA, almacenId } });
    expect(new Prisma.Decimal(itemA1.cantidadComprometida).toNumber()).toBe(
      new Prisma.Decimal(itemA0.cantidadComprometida).toNumber(),
    );
    expect(new Prisma.Decimal(itemA1.cantidadDisponible).toNumber()).toBe(
      new Prisma.Decimal(itemA0.cantidadDisponible).toNumber(),
    );

    // No quedo comprobante huerfano de la orden.
    const comprobantes = await prisma.comprobanteVenta.count({
      where: { empresaId: usuario.empresaId, ordenVentaId: ov.id },
    });
    expect(comprobantes).toBe(0);

    // La linea A no avanzo su cantidadDespachada.
    const lineaADespues = await prisma.ordenVentaLinea.findUniqueOrThrow({ where: { id: lineaA.id } });
    expect(new Prisma.Decimal(lineaADespues.cantidadDespachada).toNumber()).toBe(0);
  });
});
