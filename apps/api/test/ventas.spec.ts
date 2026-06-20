import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { VentasService } from "../src/modulos/ventas/ventas.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion de ventas: la orden RESERVA (mueve disponible a comprometido)
 * y el despacho descuenta del comprometido generando salidas en el ledger.
 */
describe("VentasService (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma, new TiposCambioService(prisma), new AuditoriaService(prisma));
  const ventas = new VentasService(prisma, movimientos, new AuditoriaService(prisma));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
  let clienteId: bigint;
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
    const cliente = await prisma.cliente.create({
      data: {
        empresaId: empresa.id,
        tipoDocIdentidad: "6",
        numeroDoc: `2${RUN}01`,
        razonSocial: "Cliente Test SAC",
      },
    });
    clienteId = cliente.id;
    // Stock inicial: 100 unidades.
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("reserva al crear la orden y despacha desde el comprometido con comprobante", async () => {
    contador += 1;
    const orden = await ventas.crearOrdenVenta(usuario, {
      almacenId,
      numero: `OV-${RUN}-${contador}`,
      clienteId,
      lineas: [{ skuId, cantidad: "30", precioUnitario: "12" }],
    });

    // IGV 18%: subtotal 360, igv 64.8, total 424.8.
    expect(orden.subtotal).toBe("360");
    expect(orden.igv).toBe("64.8");
    expect(orden.total).toBe("424.8");

    // Tras reservar: disponible 70, comprometido 30 (fisico sigue 100).
    let item = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(70);
    expect(new Prisma.Decimal(item.cantidadComprometida).toNumber()).toBe(30);

    const ov = await prisma.ordenVenta.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });

    // Despacho parcial de 20 con comprobante (sustento SUNAT) obligatorio.
    const serie = `F${RUN.slice(-3)}`;
    const numeroComp = `${contador}001`;
    const despacho = await ventas.despachar(usuario, {
      ordenVentaId: BigInt(orden.id),
      comprobante: {
        tipoDocumentoSunat: "01",
        serie,
        numero: numeroComp,
        fechaEmision: new Date("2026-06-15T00:00:00.000Z"),
        subtotal: "240",
        igv: "43.2",
        total: "283.2",
      },
      lineas: [{ ordenVentaLineaId: ov.lineas[0]!.id, cantidad: "20" }],
    });

    item = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    // disponible 70 (sin cambio), comprometido 10 (30-20), fisico 80.
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(70);
    expect(new Prisma.Decimal(item.cantidadComprometida).toNumber()).toBe(10);

    const estado = (await prisma.ordenVenta.findUniqueOrThrow({ where: { id: BigInt(orden.id) } })).estado;
    expect(estado).toBe("PARCIAL");

    // El movimiento de venta lleva la serie/numero REALES del comprobante (no "0")
    // y queda enlazado al comprobante via documentoId.
    const comprobanteId = BigInt(despacho.comprobanteId);
    const mov = await prisma.movimientoStock.findFirstOrThrow({
      where: { empresaId: usuario.empresaId, skuId, tipo: "SALIDA_VENTA", documentoId: comprobanteId },
      orderBy: { id: "desc" },
    });
    expect(mov.serieComprobante).toBe(serie);
    expect(mov.numeroComprobante).toBe(numeroComp);
    expect(mov.tipoDocumentoSunat).toBe("01");
    expect(mov.documentoTipo).toBe("VENTA");
    expect(mov.documentoId).toBe(comprobanteId);
    // El periodo SUNAT se rige por la fecha de emision del comprobante.
    expect(mov.periodo).toBe("202606");
  });

  it("rechaza el despacho si la orden no tiene cliente identificado", async () => {
    contador += 1;
    const orden = await ventas.crearOrdenVenta(usuario, {
      almacenId,
      numero: `OV-${RUN}-${contador}`,
      cliente: "Texto libre legacy",
      lineas: [{ skuId, cantidad: "5", precioUnitario: "10" }],
    });
    const ov = await prisma.ordenVenta.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });
    await expect(
      ventas.despachar(usuario, {
        ordenVentaId: BigInt(orden.id),
        comprobante: {
          tipoDocumentoSunat: "03",
          serie: "B001",
          numero: "1",
          fechaEmision: new Date("2026-06-15T00:00:00.000Z"),
          subtotal: "50",
          igv: "9",
          total: "59",
        },
        lineas: [{ ordenVentaLineaId: ov.lineas[0]!.id, cantidad: "5" }],
      }),
    ).rejects.toThrow();
    // Limpieza: liberar la reserva creada para no contaminar otros tests.
    await ventas.anular(usuario, BigInt(orden.id));
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
