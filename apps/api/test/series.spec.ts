import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { SeriesService } from "../src/modulos/series/series.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Trazabilidad por numero de serie. Una entrada de un SKU con controlaSerie
 * registra las series como DISPONIBLE enlazadas al movimiento de entrada; una
 * salida las marca DESPACHADO enlazando el movimiento de salida. Las reglas de
 * cantidad/duplicados/estado/almacen deben fallar cuando corresponde.
 */
describe("SerieArticulo (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma, new TiposCambioService(prisma));
  const series = new SeriesService(prisma);

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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Serie test" },
    });
    const sku = await prisma.sku.create({
      data: {
        empresaId: empresa.id,
        productoId: producto.id,
        codigoParlante: `9${RUN}0001`,
        unidadId: unidad.id,
        controlaSerie: true,
      },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registra series al ingresar y las marca DESPACHADO al salir", async () => {
    const s1 = `SN-${RUN}-A`;
    const s2 = `SN-${RUN}-B`;
    const s3 = `SN-${RUN}-C`;

    await movimientos.recibirCompra(usuario, {
      skuId,
      almacenId,
      cantidad: "3",
      costoUnitario: "100",
      numerosSerie: [s1, s2, s3],
    });

    const disponibles = await series.listar(usuario.empresaId, { skuId, estado: "DISPONIBLE" });
    expect(disponibles).toHaveLength(3);
    expect(disponibles.map((s) => s.numeroSerie).sort()).toEqual([s1, s2, s3].sort());
    expect(disponibles.every((s) => s.movimientoEntradaId !== null)).toBe(true);

    await movimientos.registrarSalidaVenta(usuario, {
      skuId,
      almacenId,
      cantidad: "1",
      numerosSerie: [s2],
    });

    const todas = await series.listar(usuario.empresaId, { skuId });
    const despachada = todas.find((s) => s.numeroSerie === s2)!;
    expect(despachada.estado).toBe("DESPACHADO");
    expect(despachada.movimientoSalidaId).not.toBeNull();
    expect(todas.filter((s) => s.estado === "DISPONIBLE")).toHaveLength(2);
  });

  it("falla si la cantidad de series no coincide con la cantidad", async () => {
    await expect(
      movimientos.recibirCompra(usuario, {
        skuId,
        almacenId,
        cantidad: "2",
        costoUnitario: "100",
        numerosSerie: [`SN-${RUN}-X`],
      }),
    ).rejects.toThrow();
  });

  it("falla al despachar una serie inexistente o ya despachada", async () => {
    await expect(
      movimientos.registrarSalidaVenta(usuario, {
        skuId,
        almacenId,
        cantidad: "1",
        numerosSerie: ["SN-NO-EXISTE"],
      }),
    ).rejects.toThrow();
  });

  it("rechaza series en un SKU que no controla serie", async () => {
    const empresaId = usuario.empresaId;
    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId } });
    const producto = await prisma.producto.create({
      data: { empresaId, familiaId: familia.id, nombre: "Sin serie test" },
    });
    const sku = await prisma.sku.create({
      data: {
        empresaId,
        productoId: producto.id,
        codigoParlante: `9${RUN}0002`,
        unidadId: unidad.id,
        controlaSerie: false,
      },
    });
    await expect(
      movimientos.recibirCompra(usuario, {
        skuId: sku.id,
        almacenId,
        cantidad: "1",
        costoUnitario: "10",
        numerosSerie: ["SN-INVALIDA"],
      }),
    ).rejects.toThrow();
  });
});
