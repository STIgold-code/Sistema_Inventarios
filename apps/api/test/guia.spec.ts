import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { GuiasService } from "../src/modulos/guias/guias.service.js";
import { MOTIVO_TRASLADO } from "@bm/tipos";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion de guias de remision (registro de referencia): valida el catalogo
 * de motivo, la unicidad serie-numero y la regla de "exactamente un vinculo"
 * (traslado O orden de venta, nunca ambos ni ninguno).
 */
describe("GuiasService (integracion)", () => {
  const prisma = new PrismaService();
  const guias = new GuiasService(prisma);

  let usuario: UsuarioRequest;
  let trasladoId: bigint;
  let contador = 0;
  const RUN = Date.now().toString().slice(-9);

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacenes = await prisma.almacen.findMany({
      where: { empresaId: empresa.id },
      take: 2,
    });
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [] };

    const origen = almacenes[0]!.id;
    const destino = almacenes[1]?.id ?? origen;
    const traslado = await prisma.traslado.create({
      data: {
        empresaId: empresa.id,
        numero: `TR-GUIA-${RUN}`,
        almacenOrigenId: origen,
        almacenDestinoId: destino,
        usuarioId: admin.id,
      },
    });
    trasladoId = traslado.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function serie() {
    contador += 1;
    return `T${RUN.slice(-3)}${contador}`;
  }

  it("registra una guia para un traslado validando motivo y devuelve id", async () => {
    const s = serie();
    const res = await guias.crear(usuario, {
      serie: s,
      numero: "1",
      fechaTraslado: new Date("2026-06-15T00:00:00.000Z"),
      motivoTraslado: MOTIVO_TRASLADO.TRASLADO_ENTRE_ESTABLECIMIENTOS_MISMA_EMPRESA,
      puntoPartida: "Av. Origen 123",
      puntoLlegada: "Av. Destino 456",
      trasladoId,
    });
    expect(res.id).toBeDefined();

    const listado = await guias.listar(usuario.empresaId, { trasladoId });
    const creada = listado.find((g) => g.id === res.id);
    expect(creada).toBeDefined();
    expect(creada!.serieNumero).toBe(`${s}-1`);
    expect(creada!.motivoTraslado).toBe("04");
    expect(creada!.trasladoNumero).toBe(`TR-GUIA-${RUN}`);
  });

  it("rechaza un motivo fuera del catalogo SUNAT", async () => {
    await expect(
      guias.crear(usuario, {
        serie: serie(),
        numero: "1",
        fechaTraslado: new Date("2026-06-15T00:00:00.000Z"),
        motivoTraslado: "99",
        puntoPartida: "A",
        puntoLlegada: "B",
        trasladoId,
      }),
    ).rejects.toThrow();
  });

  it("rechaza serie-numero duplicada en la misma empresa", async () => {
    const s = serie();
    const base = {
      serie: s,
      numero: "5",
      fechaTraslado: new Date("2026-06-15T00:00:00.000Z"),
      motivoTraslado: MOTIVO_TRASLADO.TRASLADO_ENTRE_ESTABLECIMIENTOS_MISMA_EMPRESA,
      puntoPartida: "A",
      puntoLlegada: "B",
      trasladoId,
    };
    await guias.crear(usuario, base);
    await expect(guias.crear(usuario, base)).rejects.toThrow();
  });

  it("rechaza si no se pasa ni traslado ni orden de venta", async () => {
    await expect(
      guias.crear(usuario, {
        serie: serie(),
        numero: "1",
        fechaTraslado: new Date("2026-06-15T00:00:00.000Z"),
        motivoTraslado: MOTIVO_TRASLADO.VENTA,
        puntoPartida: "A",
        puntoLlegada: "B",
      }),
    ).rejects.toThrow();
  });

  it("rechaza si se pasan ambos vinculos (traslado y orden)", async () => {
    const orden = await prisma.ordenVenta.findFirst({ where: { empresaId: usuario.empresaId } });
    await expect(
      guias.crear(usuario, {
        serie: serie(),
        numero: "1",
        fechaTraslado: new Date("2026-06-15T00:00:00.000Z"),
        motivoTraslado: MOTIVO_TRASLADO.VENTA,
        puntoPartida: "A",
        puntoLlegada: "B",
        trasladoId,
        ordenVentaId: orden?.id ?? 1n,
      }),
    ).rejects.toThrow();
  });
});
