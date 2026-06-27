import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { ParametrosService } from "../src/modulos/parametros/parametros.service.js";
import { VentasService } from "../src/modulos/ventas/ventas.service.js";
import { PedidosService } from "../src/modulos/pedidos/pedidos.service.js";
import { TransferenciasCodigoService } from "../src/modulos/transferencias-codigo/transferencias-codigo.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * E2E de las features de homologacion que tocan el ledger: entrada por
 * produccion, transferencia de codigo (conservacion de valor FIFO) y
 * pedido -> generacion de orden de venta.
 */
describe("Homologacion (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(
    prisma,
    new TiposCambioService(prisma),
    new AuditoriaService(prisma),
  );
  const parametros = new ParametrosService(prisma);
  const ventas = new VentasService(prisma, movimientos, new AuditoriaService(prisma), parametros);
  const pedidos = new PedidosService(prisma, new AuditoriaService(prisma), parametros, ventas);
  const transferencias = new TransferenciasCodigoService(prisma, movimientos, new AuditoriaService(prisma));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuProd: bigint;
  let skuOrig: bigint;
  let skuDest: bigint;
  let skuPedido: bigint;
  const RUN = Date.now().toString().slice(-9);

  async function crearSku(sufijo: string): Promise<bigint> {
    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId: usuario.empresaId } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId: usuario.empresaId } });
    const producto = await prisma.producto.create({
      data: { empresaId: usuario.empresaId, familiaId: familia.id, nombre: `Homolog ${sufijo}` },
    });
    const sku = await prisma.sku.create({
      data: {
        empresaId: usuario.empresaId,
        productoId: producto.id,
        codigoParlante: `4${RUN}${sufijo}`,
        unidadId: unidad.id,
      },
    });
    return sku.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
    almacenId = almacen.id;
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [] };

    skuProd = await crearSku("01");
    skuOrig = await crearSku("02");
    skuDest = await crearSku("03");
    skuPedido = await crearSku("04");
    // Stock inicial para origen (transferencia) y pedido: 100 @ costo 5.
    await movimientos.recibirCompra(usuario, { skuId: skuOrig, almacenId, cantidad: "100", costoUnitario: "5" });
    await movimientos.recibirCompra(usuario, { skuId: skuPedido, almacenId, cantidad: "100", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function item(skuId: bigint) {
    return prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
  }

  it("entrada por produccion: ingresa producto terminado valorizado al stock", async () => {
    await movimientos.entradaPorProduccion(usuario, {
      skuId: skuProd,
      almacenId,
      cantidad: "30",
      costoUnitario: "8",
    });
    const it = await item(skuProd);
    expect(new Prisma.Decimal(it.cantidadDisponible).toNumber()).toBe(30);
    expect(new Prisma.Decimal(it.costoPromedio).toNumber()).toBe(8);

    const mov = await prisma.movimientoStock.findFirstOrThrow({
      where: { skuId: skuProd, tipo: "ENTRADA_PRODUCCION" },
    });
    expect(mov.documentoTipo).toBe("PRODUCCION");
  });

  it("transferencia de codigo: el valor FIFO del origen se conserva en el destino", async () => {
    const dispOrigAntes = new Prisma.Decimal((await item(skuOrig)).cantidadDisponible).toNumber();

    await transferencias.crear(usuario, {
      almacenId,
      numero: `TC-${RUN}`,
      lineas: [
        { skuOrigenId: skuOrig, skuDestinoId: skuDest, cantidadOrigen: "10", factorConversion: "2" },
      ],
    });

    const origen = await item(skuOrig);
    const destino = await item(skuDest);
    // Origen baja 10; destino sube 10*2 = 20.
    expect(new Prisma.Decimal(origen.cantidadDisponible).toNumber()).toBe(dispOrigAntes - 10);
    expect(new Prisma.Decimal(destino.cantidadDisponible).toNumber()).toBe(20);
    // Valor conservado: salio 10 @ 5 = 50; entra 20 u. => costo unit destino 2.5.
    expect(new Prisma.Decimal(destino.costoPromedio).toNumber()).toBeCloseTo(2.5, 6);

    const salida = await prisma.movimientoStock.findFirstOrThrow({
      where: { skuId: skuOrig, tipo: "SALIDA_TRANSFORMACION" },
    });
    const entrada = await prisma.movimientoStock.findFirstOrThrow({
      where: { skuId: skuDest, tipo: "ENTRADA_TRANSFORMACION" },
    });
    expect(new Prisma.Decimal(salida.costoTotal).toNumber()).toBe(50);
    expect(new Prisma.Decimal(entrada.costoTotal).toNumber()).toBe(50);
  });

  it("pedido -> genera la orden de venta y queda ATENDIDO", async () => {
    const creado = await pedidos.crear(usuario, {
      almacenId,
      numero: `PED-${RUN}`,
      lineas: [{ skuId: skuPedido, cantidad: "5", precioUnitario: "10" }],
    });
    await pedidos.aprobar(usuario, BigInt(creado.id));

    const dispAntes = new Prisma.Decimal((await item(skuPedido)).cantidadDisponible).toNumber();
    const compAntes = new Prisma.Decimal((await item(skuPedido)).cantidadComprometida).toNumber();

    const res = await pedidos.generarOrdenVenta(usuario, BigInt(creado.id), `OVP-${RUN}`);
    expect(res.ordenNumero).toBe(`OVP-${RUN}`);

    // La OV reserva el stock: disponible baja 5, comprometido sube 5.
    const it = await item(skuPedido);
    expect(new Prisma.Decimal(it.cantidadDisponible).toNumber()).toBe(dispAntes - 5);
    expect(new Prisma.Decimal(it.cantidadComprometida).toNumber()).toBe(compAntes + 5);

    // El pedido queda ATENDIDO con la linea totalmente atendida.
    const pedido = await prisma.pedido.findUniqueOrThrow({
      where: { id: BigInt(creado.id) },
      include: { lineas: true },
    });
    expect(pedido.estado).toBe("ATENDIDO");
    expect(new Prisma.Decimal(pedido.lineas[0]!.cantidadAtendida).toNumber()).toBe(5);
  });
});
