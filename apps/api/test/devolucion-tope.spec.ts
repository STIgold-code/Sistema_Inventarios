import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { VentasService } from "../src/modulos/ventas/ventas.service.js";
import { DevolucionesService } from "../src/modulos/devoluciones/devoluciones.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Tope devolvible: la suma de devoluciones de un SKU en una orden no puede
 * superar lo despachado. El tope es NETO: descuenta las devoluciones previas.
 */
describe("DevolucionesService - tope con devoluciones previas", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(
    prisma,
    new TiposCambioService(prisma),
    new AuditoriaService(prisma),
  );
  const ventas = new VentasService(prisma, movimientos, new AuditoriaService(prisma));
  const devoluciones = new DevolucionesService(
    prisma,
    movimientos,
    new CorrelativoService(),
    new AuditoriaService(prisma),
  );

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Devolucion tope test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `6${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    const cliente = await prisma.cliente.create({
      data: { empresaId: empresa.id, tipoDocIdentidad: "6", numeroDoc: `3${RUN}01`, razonSocial: "Cliente Dev SAC" },
    });
    clienteId = cliente.id;
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("acumula devoluciones previas: la segunda que excede el saldo se rechaza", async () => {
    const orden = await ventas.crearOrdenVenta(usuario, {
      almacenId,
      numero: `OV-DEV-${RUN}`,
      clienteId,
      lineas: [{ skuId, cantidad: "20", precioUnitario: "10" }],
    });
    const ov = await prisma.ordenVenta.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });
    const lineaId = ov.lineas[0]!.id;

    // Despacha los 20 (subtotal 200, igv 36, total 236).
    await ventas.despachar(usuario, {
      ordenVentaId: BigInt(orden.id),
      comprobante: {
        tipoDocumentoSunat: "01",
        serie: `F${RUN.slice(-3)}`,
        numero: `${RUN}1`,
        fechaEmision: new Date("2026-06-15T00:00:00.000Z"),
        subtotal: "200",
        igv: "36",
        total: "236",
      },
      lineas: [{ ordenVentaLineaId: lineaId, cantidad: "20" }],
    });

    // Primera devolucion de 15: ok (saldo 20 - 0).
    await devoluciones.registrar(usuario, {
      ordenVentaId: BigInt(orden.id),
      lineas: [{ ordenVentaLineaId: lineaId, skuId, cantidad: "15" }],
    });

    // Segunda devolucion de 10: previo 15 + nuevo 10 = 25 > 20 despachado -> rechazo.
    await expect(
      devoluciones.registrar(usuario, {
        ordenVentaId: BigInt(orden.id),
        lineas: [{ ordenVentaLineaId: lineaId, skuId, cantidad: "10" }],
      }),
    ).rejects.toThrow(/excede lo pendiente de devolver/);

    // Una devolucion de 5 (15 + 5 = 20) si entra justo en el tope.
    const ok = await devoluciones.registrar(usuario, {
      ordenVentaId: BigInt(orden.id),
      lineas: [{ ordenVentaLineaId: lineaId, skuId, cantidad: "5" }],
    });
    expect(ok.numero).toMatch(/^DEV-/);

    // Solo se registraron las dos devoluciones validas (no la rechazada).
    const totalDevuelto = await prisma.devolucionVentaLinea.aggregate({
      where: { empresaId: usuario.empresaId, skuId, devolucion: { ordenVentaId: BigInt(orden.id) } },
      _sum: { cantidad: true },
    });
    expect(Number(totalDevuelto._sum.cantidad ?? 0)).toBe(20);
  });
});
