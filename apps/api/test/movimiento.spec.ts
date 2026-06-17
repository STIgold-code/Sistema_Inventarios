import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { StockInsuficienteError } from "../src/modulos/inventario/movimientos/errores.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Tests de integracion contra la base de datos real (seed cargado).
 * Verifican el invariante central: el ledger, las capas y la proyeccion
 * quedan coherentes, y el stock NUNCA queda negativo bajo concurrencia.
 */
describe("MovimientoService (integracion)", () => {
  const prisma = new PrismaService();
  const servicio = new MovimientoService(prisma);

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
  let contadorSku = 0;
  // Sufijo unico por ejecucion para no chocar con el unique de codigo_parlante.
  const RUN = Date.now().toString().slice(-9);

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({
      where: { empresaId: empresa.id },
    });
    const almacen = await prisma.almacen.findFirstOrThrow({
      where: { empresaId: empresa.id },
    });
    almacenId = almacen.id;
    usuario = {
      id: admin.id,
      empresaId: empresa.id,
      email: admin.email,
      nombre: admin.nombre,
      permisos: [],
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Crea un SKU nuevo y aislado para cada test. */
  async function crearSku(): Promise<bigint> {
    const empresaId = usuario.empresaId;
    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId } });
    const producto = await prisma.producto.create({
      data: { empresaId, familiaId: familia.id, nombre: `Prueba ${contadorSku}` },
    });
    contadorSku += 1;
    const codigo = `9${RUN}${contadorSku.toString().padStart(4, "0")}`;
    const sku = await prisma.sku.create({
      data: {
        empresaId,
        productoId: producto.id,
        codigoParlante: codigo,
        unidadId: unidad.id,
      },
    });
    return sku.id;
  }

  it("una entrada crea capa, proyeccion y snapshot coherentes", async () => {
    skuId = await crearSku();
    await servicio.recibirCompra(usuario, {
      skuId,
      almacenId,
      cantidad: "10",
      costoUnitario: "5",
    });

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(10);
    expect(new Prisma.Decimal(item.costoPromedio).toNumber()).toBe(5);

    const capa = await prisma.capaCosto.findFirstOrThrow({ where: { skuId } });
    expect(new Prisma.Decimal(capa.cantidadRestante).toNumber()).toBe(10);

    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { skuId } });
    expect(new Prisma.Decimal(mov.saldoCantidad).toNumber()).toBe(10);
    expect(new Prisma.Decimal(mov.saldoCostoTotal).toNumber()).toBe(50);
  });

  it("una salida consume capa FIFO y descuenta la proyeccion", async () => {
    const sku = await crearSku();
    await servicio.recibirCompra(usuario, { skuId: sku, almacenId, cantidad: "10", costoUnitario: "5" });
    const salida = await servicio.registrarSalidaVenta(usuario, { skuId: sku, almacenId, cantidad: "4" });

    expect(salida.costoSalida).toBe("20"); // 4 * 5

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId: sku } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(6);

    const capa = await prisma.capaCosto.findFirstOrThrow({ where: { skuId: sku } });
    expect(new Prisma.Decimal(capa.cantidadRestante).toNumber()).toBe(6);
  });

  it("rechaza salida mayor al stock disponible", async () => {
    const sku = await crearSku();
    await servicio.recibirCompra(usuario, { skuId: sku, almacenId, cantidad: "3", costoUnitario: "5" });
    await expect(
      servicio.registrarSalidaVenta(usuario, { skuId: sku, almacenId, cantidad: "5" }),
    ).rejects.toBeInstanceOf(StockInsuficienteError);
  });

  it("CONCURRENCIA: dos salidas simultaneas no dejan stock negativo", async () => {
    const sku = await crearSku();
    await servicio.recibirCompra(usuario, { skuId: sku, almacenId, cantidad: "10", costoUnitario: "5" });

    // Dos salidas de 7 en paralelo: solo una puede tener exito (10 - 7 = 3 < 7).
    const resultados = await Promise.allSettled([
      servicio.registrarSalidaVenta(usuario, { skuId: sku, almacenId, cantidad: "7" }),
      servicio.registrarSalidaVenta(usuario, { skuId: sku, almacenId, cantidad: "7" }),
    ]);

    const exitos = resultados.filter((r) => r.status === "fulfilled").length;
    const fallos = resultados.filter((r) => r.status === "rejected").length;
    expect(exitos).toBe(1);
    expect(fallos).toBe(1);

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId: sku } });
    const disponible = new Prisma.Decimal(item.cantidadDisponible).toNumber();
    expect(disponible).toBe(3);
    expect(disponible).toBeGreaterThanOrEqual(0); // invariante: jamas negativo
  });

  it("el ledger es inmutable: el trigger rechaza UPDATE", async () => {
    const sku = await crearSku();
    await servicio.recibirCompra(usuario, { skuId: sku, almacenId, cantidad: "1", costoUnitario: "5" });
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { skuId: sku } });
    await expect(
      prisma.$executeRaw`UPDATE movimiento_stock SET cantidad = 999 WHERE id = ${mov.id}`,
    ).rejects.toThrow();
  });
});
