import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { ConteoService } from "../src/modulos/inventario/conteos/conteo.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/** Integracion del cuadre: un conteo con diferencia genera el ajuste en el ledger. */
describe("ConteoService (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma);
  const conteos = new ConteoService(prisma, movimientos);

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Conteo test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `6${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "50", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("un conteo con faltante genera ajuste de salida y cuadra el stock", async () => {
    const conteo = await conteos.abrir(usuario, almacenId);
    // Se contaron 45 fisicos contra 50 en sistema (faltan 5).
    const res = await conteos.registrarLinea(usuario, {
      conteoId: BigInt(conteo.id),
      skuId,
      cantidadContada: "45",
    });
    expect(res.diferencia).toBe("-5");

    const aplicado = await conteos.aplicar(usuario, BigInt(conteo.id));
    expect(aplicado.ajustes).toBe(1);

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(45);

    const ajuste = await prisma.movimientoStock.findFirst({
      where: { skuId, tipo: "SALIDA_AJUSTE" },
      orderBy: { id: "desc" },
    });
    expect(ajuste).not.toBeNull();
    expect(new Prisma.Decimal(ajuste!.cantidad).toNumber()).toBe(5);
  });
});
