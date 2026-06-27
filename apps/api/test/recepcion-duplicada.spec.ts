import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { ComprasService } from "../src/modulos/compras/compras.service.js";
import { ProveedoresService } from "../src/modulos/proveedores/proveedores.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { ParametrosService } from "../src/modulos/parametros/parametros.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Recepcion unica: no se puede registrar dos veces la misma factura del proveedor
 * (mismo tipoDoc + serie + numero) para una empresa.
 */
describe("ComprasService - recepcion duplicada", () => {
  const prisma = new PrismaService();
  const compras = new ComprasService(
    prisma,
    new MovimientoService(prisma, new TiposCambioService(prisma), new AuditoriaService(prisma)),
    new CorrelativoService(),
    new AuditoriaService(prisma),
    new ParametrosService(prisma),
  );
  const proveedores = new ProveedoresService(prisma);

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
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Recepcion dup test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `5${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rechaza una segunda recepcion con el mismo comprobante", async () => {
    const proveedor = await proveedores.crearProveedor(usuario.empresaId, {
      ruc: `2${RUN}9`,
      razonSocial: "Proveedor Dup SAC",
    });
    const orden = await compras.crearOrdenCompra(usuario, {
      proveedorId: BigInt(proveedor.id),
      almacenId,
      lineas: [{ skuId, cantidad: "100", costoUnitario: "10" }],
    });
    await compras.aprobarOrden(usuario, BigInt(orden.id));
    const oc = await prisma.ordenCompra.findUniqueOrThrow({
      where: { id: BigInt(orden.id) },
      include: { lineas: true },
    });
    const lineaId = oc.lineas[0]!.id;

    const comprobante = {
      tipoDocumentoSunat: "01",
      serieComprobante: "F999",
      numeroComprobante: `${RUN}900`,
      fechaEmisionDocumento: new Date(),
      subtotal: "400",
      igv: "72",
      total: "472",
    };

    // Primera recepcion: ok.
    await compras.recibir(usuario, {
      ordenCompraId: BigInt(orden.id),
      ...comprobante,
      lineas: [{ ordenCompraLineaId: lineaId, cantidad: "40" }],
    });

    // Segunda recepcion con el MISMO comprobante: rechazada.
    await expect(
      compras.recibir(usuario, {
        ordenCompraId: BigInt(orden.id),
        ...comprobante,
        lineas: [{ ordenCompraLineaId: lineaId, cantidad: "10" }],
      }),
    ).rejects.toThrow(/Ya existe una recepcion con el comprobante/);
  });
});
