import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { ValesService } from "../src/modulos/vales/vales.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Integracion de las ordenes de produccion con los vales de salida: un vale se
 * crea contra una orden (hereda su orden de trabajo) y despacharlo pasa la orden
 * de PLANIFICADA a EN_PROCESO. Una orden CERRADA no admite vales ni despachos.
 */
describe("Ordenes de produccion (integracion)", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditoriaService(prisma);
  const movimientos = new MovimientoService(prisma, new TiposCambioService(prisma), auditoria);
  const vales = new ValesService(prisma, new CorrelativoService(), movimientos, auditoria);

  let usuario: UsuarioRequest;
  // Autorizador/despachador distinto del solicitante (segregacion de funciones).
  let autorizador: UsuarioRequest;
  let empresaId: bigint;
  let almacenId: bigint;
  let centroCostoId: bigint;
  let skuId: bigint;
  let formulaId: bigint;
  let ordenTrabajoId: bigint;
  let ordenAjenaId: bigint;
  const RUN = Date.now().toString().slice(-9);
  let secuenciaOrden = 0;
  // Vales que NO llegan al ledger: se pueden borrar al final.
  const valesSinDespacho: bigint[] = [];

  /** Crea una orden de produccion PLANIFICADA dedicada a un caso. */
  async function crearOrden(conOrdenTrabajo = true): Promise<bigint> {
    secuenciaOrden += 1;
    const orden = await prisma.ordenProduccion.create({
      data: {
        empresaId,
        numero: `OP-T${RUN}-${secuenciaOrden}`,
        formulaId,
        skuTerminadoId: skuId,
        cantidadPlanificada: "10",
        almacenInsumosId: almacenId,
        almacenDestinoId: almacenId,
        centroCostoId,
        ordenTrabajoId: conOrdenTrabajo ? ordenTrabajoId : null,
        usuarioId: usuario.id,
      },
    });
    return orden.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    empresaId = empresa.id;
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId } });
    almacenId = almacen.id;
    usuario = { id: admin.id, empresaId, email: admin.email, nombre: admin.nombre, permisos: [], debeCambiarClave: false };

    const segundo = await prisma.usuario.create({
      data: { empresaId, email: `autorizador-op${RUN}@test.com`, hashClave: "x", nombre: "Autorizador OP test" },
    });
    autorizador = {
      id: segundo.id,
      empresaId,
      email: segundo.email,
      nombre: segundo.nombre,
      permisos: [],
      debeCambiarClave: false,
    };

    const centro = await prisma.centroCosto.create({
      data: { empresaId, codigo: `CCOP${RUN}`, nombre: "Planta test" },
    });
    centroCostoId = centro.id;

    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId } });
    const producto = await prisma.producto.create({
      data: { empresaId, familiaId: familia.id, nombre: "Insumo produccion test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId, productoId: producto.id, codigoParlante: `4${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    // Stock inicial: 100 unidades al costo 5.
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "5" });

    const formula = await prisma.formula.create({
      data: { empresaId, codigo: `FOR-T${RUN}`, nombre: "Formula test", skuTerminadoId: skuId, cantidadBase: "1" },
    });
    formulaId = formula.id;

    const ot = await prisma.ordenTrabajo.create({
      data: { empresaId, numero: `OT-OP${RUN}`, descripcion: "OT produccion test", centroCostoId },
    });
    ordenTrabajoId = ot.id;

    // Empresa ajena con su propia orden de produccion (anti-IDOR).
    const empresaB = await prisma.empresa.create({
      data: { ruc: `23${RUN}`, razonSocial: "Empresa Ajena Produccion SAC", nombre: "Empresa Ajena OP" },
    });
    const sucursalB = await prisma.sucursal.create({
      data: { empresaId: empresaB.id, codigo: `SOP-${RUN.slice(-4)}`, nombre: "Sucursal ajena" },
    });
    const almacenB = await prisma.almacen.create({
      data: { empresaId: empresaB.id, sucursalId: sucursalB.id, codigo: `AOP-${RUN.slice(-4)}`, nombre: "Almacen ajeno" },
    });
    const centroB = await prisma.centroCosto.create({
      data: { empresaId: empresaB.id, codigo: `CCB${RUN}`, nombre: "Centro ajeno" },
    });
    const formulaB = await prisma.formula.create({
      data: { empresaId: empresaB.id, codigo: `FOR-B${RUN}`, nombre: "Formula ajena", skuTerminadoId: skuId, cantidadBase: "1" },
    });
    const ordenB = await prisma.ordenProduccion.create({
      data: {
        empresaId: empresaB.id,
        numero: `OP-B${RUN}`,
        formulaId: formulaB.id,
        skuTerminadoId: skuId,
        cantidadPlanificada: "1",
        almacenInsumosId: almacenB.id,
        almacenDestinoId: almacenB.id,
        centroCostoId: centroB.id,
        usuarioId: usuario.id,
      },
    });
    ordenAjenaId = ordenB.id;
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: { entidad: "VALE_SALIDA", entidadId: { in: valesSinDespacho } },
    });
    await prisma.valeSalida.deleteMany({ where: { id: { in: valesSinDespacho } } });
    await prisma.$disconnect();
  });

  it("crea un vale contra la orden y hereda la orden de trabajo", async () => {
    const ordenId = await crearOrden();
    const { id } = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      ordenProduccionId: ordenId,
      destino: "Planta",
      lineas: [{ skuId, cantidad: "2" }],
    });
    valesSinDespacho.push(BigInt(id));

    const guardado = await prisma.valeSalida.findUniqueOrThrow({ where: { id: BigInt(id) } });
    expect(guardado.ordenProduccionId).toBe(ordenId);
    expect(guardado.ordenTrabajoId).toBe(ordenTrabajoId);

    const detalle = await vales.obtener(empresaId, BigInt(id));
    expect(detalle.ordenProduccion).toEqual({ id: ordenId.toString(), numero: `OP-T${RUN}-${secuenciaOrden}` });
    expect(detalle.ordenTrabajoId).toBe(ordenTrabajoId.toString());
    const enLista = (await vales.listar(empresaId)).find((v) => v.id === id)!;
    expect(enLista.ordenProduccion?.id).toBe(ordenId.toString());
  });

  it("rechaza una orden de trabajo distinta a la de la orden de produccion", async () => {
    const ordenId = await crearOrden();
    const otraOt = await prisma.ordenTrabajo.create({
      data: { empresaId, numero: `OT-OP${RUN}-2`, descripcion: "Otra OT test", centroCostoId },
    });
    await expect(
      vales.crear(usuario, {
        almacenId,
        centroCostoId,
        ordenProduccionId: ordenId,
        ordenTrabajoId: otraOt.id,
        destino: "Planta",
        lineas: [{ skuId, cantidad: "1" }],
      }),
    ).rejects.toThrow(new BadRequestException("La orden de trabajo no coincide con la de la orden de producción"));
  });

  it("rechaza con 404 una orden de otra empresa o inexistente", async () => {
    const cuerpo = { almacenId, centroCostoId, destino: "Planta", lineas: [{ skuId, cantidad: "1" }] };
    await expect(vales.crear(usuario, { ...cuerpo, ordenProduccionId: ordenAjenaId })).rejects.toThrow(
      new NotFoundException("Orden de producción no encontrada"),
    );
    await expect(vales.crear(usuario, { ...cuerpo, ordenProduccionId: 999_999_999_999n })).rejects.toThrow(
      NotFoundException,
    );
  });

  it("rechaza con 400 una orden CERRADA", async () => {
    const ordenId = await crearOrden();
    await prisma.ordenProduccion.update({ where: { id: ordenId }, data: { estado: "CERRADA" } });
    await expect(
      vales.crear(usuario, {
        almacenId,
        centroCostoId,
        ordenProduccionId: ordenId,
        destino: "Planta",
        lineas: [{ skuId, cantidad: "1" }],
      }),
    ).rejects.toThrow(new BadRequestException("La orden de producción no admite nuevos vales"));
  });

  it("despachar pasa la orden de PLANIFICADA a EN_PROCESO", async () => {
    const ordenId = await crearOrden();
    const { id } = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      ordenProduccionId: ordenId,
      destino: "Planta",
      lineas: [{ skuId, cantidad: "3" }],
    });
    await vales.autorizar(autorizador, BigInt(id));
    await vales.despachar(autorizador, BigInt(id));

    const orden = await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: ordenId } });
    expect(orden.estado).toBe("EN_PROCESO");
    const vale = await prisma.valeSalida.findUniqueOrThrow({ where: { id: BigInt(id) } });
    expect(vale.estado).toBe("DESPACHADO");
  });

  it("despachar contra una orden CERRADA lanza Conflict", async () => {
    const ordenId = await crearOrden();
    const { id } = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      ordenProduccionId: ordenId,
      destino: "Planta",
      lineas: [{ skuId, cantidad: "1" }],
    });
    valesSinDespacho.push(BigInt(id));
    await vales.autorizar(autorizador, BigInt(id));
    await prisma.ordenProduccion.update({ where: { id: ordenId }, data: { estado: "CERRADA" } });

    await expect(vales.despachar(autorizador, BigInt(id))).rejects.toThrow(
      new ConflictException("La orden de producción ya no admite despachos"),
    );
    const vale = await prisma.valeSalida.findUniqueOrThrow({ where: { id: BigInt(id) }, include: { lineas: true } });
    expect(vale.estado).toBe("AUTORIZADO");
    expect(vale.lineas[0]!.movimientoStockId).toBeNull();
  });
});
