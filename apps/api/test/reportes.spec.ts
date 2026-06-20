import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { ReportesService } from "../src/modulos/reportes/reportes.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/** Integracion del exportador PLE SUNAT (Formatos 12.1 y 13.1). */
describe("ReportesService PLE (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma, new TiposCambioService(prisma));
  const reportes = new ReportesService(prisma);

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let skuId: bigint;
  let periodo: string;
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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "PLE test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `5${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;

    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "8.50" });
    await movimientos.registrarSalidaVenta(usuario, { skuId, almacenId, cantidad: "30" });

    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { skuId } });
    periodo = mov.periodo;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("Formato 12.1 produce lineas con pipe de cierre y entrada/salida correctas", async () => {
    const txt = await reportes.generarPle121(usuario.empresaId, periodo);
    const lineas = txt.split("\r\n").filter((l) => l.includes(`5${RUN}`));
    expect(lineas.length).toBeGreaterThanOrEqual(2);
    for (const linea of lineas) {
      expect(linea.endsWith("|")).toBe(true);
      expect(linea.startsWith(`${periodo}00|`)).toBe(true);
    }
  });

  it("Formato 13.1 cumple costo_total = cantidad x costo_unit (validacion SUNAT)", async () => {
    const txt = await reportes.generarPle131(usuario.empresaId, periodo);
    const lineas = txt.split("\r\n").filter((l) => l.includes(`5${RUN}`));
    expect(lineas.length).toBeGreaterThanOrEqual(2);

    for (const linea of lineas) {
      const c = linea.split("|");
      // entradas: 14 cant, 15 costo unit, 16 costo total
      const entCant = Number(c[13]);
      const entUnit = Number(c[14]);
      const entTotal = Number(c[15]);
      if (entCant > 0) {
        expect(entTotal).toBeCloseTo(entCant * entUnit, 2);
      }
      // salidas: 17 cant, 18 costo unit, 19 costo total
      const salCant = Number(c[16]);
      const salUnit = Number(c[17]);
      const salTotal = Number(c[18]);
      if (salCant > 0) {
        expect(salTotal).toBeCloseTo(salCant * salUnit, 2);
      }
    }
  });

  it("el nombre de archivo sigue la nomenclatura SUNAT", async () => {
    const nombre = await reportes.nombreArchivoPle(usuario.empresaId, periodo, "131");
    expect(nombre).toMatch(/^LE\d{11}\d{8}130100001111\.txt$/);
  });
});
