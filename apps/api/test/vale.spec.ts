import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { ValesService } from "../src/modulos/vales/vales.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion del vale de salida (hoja de cargo): crear -> autorizar ->
 * despachar genera una salida REAL del ledger (consumo FIFO), descuenta el
 * stock del almacen y enlaza el movimiento al vale. Despachar un vale no
 * autorizado debe fallar.
 */
describe("ValesService (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma, new TiposCambioService(prisma));
  const correlativos = new CorrelativoService();
  const vales = new ValesService(prisma, correlativos, movimientos);

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let centroCostoId: bigint;
  let skuId: bigint;
  const RUN = Date.now().toString().slice(-9);

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
    almacenId = almacen.id;
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [] };

    const centro = await prisma.centroCosto.create({
      data: { empresaId: empresa.id, codigo: `CC${RUN}`, nombre: "Obra test" },
    });
    centroCostoId = centro.id;

    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const producto = await prisma.producto.create({
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Vale test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `8${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    // Stock inicial: 100 unidades al costo 5.
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("autoriza y despacha descontando stock real y creando el movimiento", async () => {
    const antes = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    const dispAntes = new Prisma.Decimal(antes.cantidadDisponible).toNumber();

    const vale = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      destino: "Frente 1",
      lineas: [{ skuId, cantidad: "30" }],
    });

    await vales.autorizar(usuario, BigInt(vale.id));
    await vales.despachar(usuario, BigInt(vale.id));

    // Stock disponible descontado en 30.
    const despues = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(despues.cantidadDisponible).toNumber()).toBe(dispAntes - 30);

    // El vale queda DESPACHADO con cantidadDespachada y movimiento enlazado.
    const guardado = await prisma.valeSalida.findUniqueOrThrow({
      where: { id: BigInt(vale.id) },
      include: { lineas: true },
    });
    expect(guardado.estado).toBe("DESPACHADO");
    const linea = guardado.lineas[0]!;
    expect(new Prisma.Decimal(linea.cantidadDespachada).toNumber()).toBe(30);
    expect(linea.movimientoStockId).not.toBeNull();

    // El movimiento del ledger apunta al vale (documentoTipo VALE_SALIDA, documentoId poblado).
    const mov = await prisma.movimientoStock.findUniqueOrThrow({
      where: { id: linea.movimientoStockId! },
    });
    expect(mov.documentoTipo).toBe("VALE_SALIDA");
    expect(mov.documentoId).toBe(BigInt(vale.id));
    expect(mov.tipo).toBe("SALIDA_CONSUMO");
  });

  it("despachar un vale no autorizado falla", async () => {
    const vale = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      destino: "Frente 2",
      lineas: [{ skuId, cantidad: "5" }],
    });

    // Aun en BORRADOR: no se puede despachar.
    await expect(vales.despachar(usuario, BigInt(vale.id))).rejects.toThrow();

    // El stock no se toco y el vale sigue en BORRADOR.
    const guardado = await prisma.valeSalida.findUniqueOrThrow({ where: { id: BigInt(vale.id) } });
    expect(guardado.estado).toBe("BORRADOR");
  });
});
