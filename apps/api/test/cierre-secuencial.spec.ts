import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { CierresService } from "../src/modulos/cierres/cierres.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Cierre secuencial: no se puede cerrar un periodo si hay periodos anteriores
 * con movimientos que sigan abiertos. Hay que cerrar primero el mas antiguo.
 *
 * Usa una empresa AISLADA para no interferir con el ledger de otras suites.
 */
describe("CierresService - cierre secuencial", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(
    prisma,
    new TiposCambioService(prisma),
    new AuditoriaService(prisma),
  );
  const cierres = new CierresService(prisma, new AuditoriaService(prisma));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
  const RUN = Date.now().toString().slice(-9);

  // Dos periodos distintos: uno anterior y uno posterior.
  const PERIODO_ANTERIOR = "202401";
  const PERIODO_POSTERIOR = "202402";

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.create({
      data: { ruc: `90${RUN}`, razonSocial: "Empresa Cierre Test", nombre: "Empresa Cierre" },
    });
    const sucursal = await prisma.sucursal.create({
      data: { empresaId: empresa.id, codigo: "S1", nombre: "Principal" },
    });
    const almacen = await prisma.almacen.create({
      data: { empresaId: empresa.id, sucursalId: sucursal.id, codigo: "A1", nombre: "Central" },
    });
    almacenId = almacen.id;
    const familia = await prisma.familia.create({
      data: { empresaId: empresa.id, codigo: "F1", nombre: "General" },
    });
    const unidad = await prisma.unidad.create({
      data: { empresaId: empresa.id, codigo: "UND", nombre: "Unidad" },
    });
    const producto = await prisma.producto.create({
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Cierre test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `4${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    const admin = await prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        email: `cierre${RUN}@test.com`,
        nombre: "Admin Cierre",
        hashClave: "x",
      },
    });
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [] };

    // Un movimiento en cada periodo (la fecha de emision rige el periodo SUNAT).
    await movimientos.recibirCompra(usuario, {
      skuId,
      almacenId,
      cantidad: "10",
      costoUnitario: "5",
      fechaEmisionDocumento: new Date("2024-01-15T00:00:00.000Z"),
    });
    await movimientos.recibirCompra(usuario, {
      skuId,
      almacenId,
      cantidad: "10",
      costoUnitario: "5",
      fechaEmisionDocumento: new Date("2024-02-15T00:00:00.000Z"),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rechaza cerrar un periodo con un periodo anterior aun abierto", async () => {
    await expect(cierres.cerrar(usuario, PERIODO_POSTERIOR)).rejects.toThrow(
      /periodos anteriores con movimientos sin cerrar/,
    );
  });

  it("permite cerrar en orden: primero el anterior, luego el posterior", async () => {
    const previo = await cierres.cerrar(usuario, PERIODO_ANTERIOR);
    expect(previo.estado).toBe("CERRADO");

    const posterior = await cierres.cerrar(usuario, PERIODO_POSTERIOR);
    expect(posterior.estado).toBe("CERRADO");
  });
});
