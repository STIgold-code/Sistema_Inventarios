import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion de la entrada de producto terminado por orden de produccion:
 * opera dentro de una transaccion externa y valoriza al costo total de los
 * insumos consumidos (costo unitario = costo total / cantidad producida).
 */
describe("Entrada por produccion en transaccion (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(
    prisma,
    new TiposCambioService(prisma),
    new AuditoriaService(prisma),
  );

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
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [], debeCambiarClave: false };

    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const producto = await prisma.producto.create({
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: `Produccion entrada ${RUN}` },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `6${RUN}01`, unidadId: unidad.id },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function disponible(): Promise<number> {
    const item = await prisma.itemStock.findFirst({ where: { skuId, almacenId } });
    return item ? new Prisma.Decimal(item.cantidadDisponible).toNumber() : 0;
  }

  it("crea la entrada con costo unitario = costoTotal / cantidad y su capa", async () => {
    const antes = await disponible();

    const res = await prisma.$transaction((tx) =>
      movimientos.entradaPorProduccionEnTx(usuario, tx, {
        skuId,
        almacenId,
        cantidad: "40",
        costoTotal: "150",
        documentoId: 999999n,
      }),
    );

    expect(res.costoUnitario.toNumber()).toBe(3.75);

    const mov = await prisma.movimientoStock.findUniqueOrThrow({ where: { id: res.movimientoId } });
    expect(mov.tipo).toBe("ENTRADA_PRODUCCION");
    expect(mov.documentoTipo).toBe("ORDEN_PRODUCCION");
    expect(mov.documentoId).toBe(999999n);
    expect(new Prisma.Decimal(mov.costoUnitario).toNumber()).toBe(3.75);
    expect(mov.observaciones).toBe("Ingreso de producción por orden");

    const capa = await prisma.capaCosto.findFirstOrThrow({ where: { movimientoEntradaId: res.movimientoId } });
    expect(new Prisma.Decimal(capa.cantidadRestante).toNumber()).toBe(40);
    expect(new Prisma.Decimal(capa.costoUnitario).toNumber()).toBe(3.75);

    expect(await disponible()).toBe(antes + 40);
  });

  it("rechaza cantidad cero", async () => {
    await expect(
      prisma.$transaction((tx) =>
        movimientos.entradaPorProduccionEnTx(usuario, tx, {
          skuId,
          almacenId,
          cantidad: "0",
          costoTotal: "150",
          documentoId: 999999n,
        }),
      ),
    ).rejects.toThrow(new BadRequestException("La cantidad producida debe ser mayor que cero"));
  });
});
