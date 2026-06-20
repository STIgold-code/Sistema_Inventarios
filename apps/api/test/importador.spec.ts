import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { ImportadorService } from "../src/modulos/importador/importador.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

describe("ImportadorService (integracion)", () => {
  const prisma = new PrismaService();
  const importador = new ImportadorService(prisma, new MovimientoService(prisma, new TiposCambioService(prisma)));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let familiaCodigo: string;
  const RUN = Date.now().toString().slice(-7);

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
    almacenId = almacen.id;
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [] };
    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId: empresa.id } });
    familiaCodigo = familia.codigo; // ej "001"
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("importa una fila valida creando producto, sku y stock inicial", async () => {
    const codigo = `${familiaCodigo}${RUN}0001`.padEnd(14, "0").slice(0, 14);
    const res = await importador.importar(
      usuario,
      almacenId,
      [{ codigoParlante: codigo, descripcion: "ELECTRODO IMPORT", unidadCodigo: "KGM", stockFisico: "25" }],
      false,
    );
    expect(res.creados).toBe(1);
    expect(res.conStock).toBe(1);
    expect(res.errores).toHaveLength(0);

    const sku = await prisma.sku.findFirstOrThrow({ where: { codigoParlante: codigo } });
    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId: sku.id, almacenId } });
    expect(new Prisma.Decimal(item.cantidadDisponible).toNumber()).toBe(25);
  });

  it("es idempotente: reimportar el mismo codigo lo cuenta como actualizado", async () => {
    const codigo = `${familiaCodigo}${RUN}0002`.padEnd(14, "0").slice(0, 14);
    const fila = [{ codigoParlante: codigo, descripcion: "X", unidadCodigo: "KGM", stockFisico: "5" }];
    await importador.importar(usuario, almacenId, fila, false);
    const segunda = await importador.importar(usuario, almacenId, fila, false);
    expect(segunda.actualizados).toBe(1);
    expect(segunda.creados).toBe(0);
  });

  it("reporta error por fila sin abortar el lote", async () => {
    const ok = `${familiaCodigo}${RUN}0003`.padEnd(14, "0").slice(0, 14);
    const res = await importador.importar(
      usuario,
      almacenId,
      [
        { codigoParlante: "123", descripcion: "malo", unidadCodigo: "KGM", stockFisico: "1" },
        { codigoParlante: ok, descripcion: "bueno", unidadCodigo: "KGM", stockFisico: "1" },
      ],
      false,
    );
    expect(res.errores).toHaveLength(1);
    expect(res.creados).toBe(1);
  });
});
