import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { PATH_METADATA } from "@nestjs/common/constants.js";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { ValesService } from "../src/modulos/vales/vales.service.js";
import { FormulasService } from "../src/modulos/produccion/formulas.service.js";
import { OrdenesProduccionService } from "../src/modulos/produccion/ordenes-produccion.service.js";
import { OrdenesProduccionController } from "../src/modulos/produccion/ordenes-produccion.controller.js";
import { CLAVE_PERMISOS } from "../src/comun/decoradores/permisos.decorator.js";
import {
  CerrarOrdenProduccionDto,
  CrearOrdenProduccionDto,
} from "../src/modulos/produccion/dto/ordenes-produccion.dto.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";
import { validarCuerpo } from "./apoyo/validar-cuerpo.js";

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
  let formulaAjenaId: bigint;
  let almacenAjenoId: bigint;
  let ordenTrabajoAjenaId: bigint;
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
    // Producto, SKU y usuario propios de la empresa ajena: sus fixtures no
    // referencian datos de la empresa principal.
    const familiaB = await prisma.familia.create({
      data: { empresaId: empresaB.id, codigo: `FOP${RUN.slice(-4)}`, nombre: "Familia ajena" },
    });
    const unidadB = await prisma.unidad.create({
      data: { empresaId: empresaB.id, codigo: "NIU", nombre: "Unidad" },
    });
    const productoB = await prisma.producto.create({
      data: { empresaId: empresaB.id, familiaId: familiaB.id, nombre: "Terminado ajeno test" },
    });
    const skuB = await prisma.sku.create({
      data: { empresaId: empresaB.id, productoId: productoB.id, codigoParlante: `4${RUN}0201`, unidadId: unidadB.id },
    });
    const usuarioB = await prisma.usuario.create({
      data: { empresaId: empresaB.id, email: `ajeno-op${RUN}@test.com`, hashClave: "x", nombre: "Usuario ajeno OP test" },
    });
    const formulaB = await prisma.formula.create({
      data: { empresaId: empresaB.id, codigo: `FOR-B${RUN}`, nombre: "Formula ajena", skuTerminadoId: skuB.id, cantidadBase: "1" },
    });
    const ordenB = await prisma.ordenProduccion.create({
      data: {
        empresaId: empresaB.id,
        numero: `OP-B${RUN}`,
        formulaId: formulaB.id,
        skuTerminadoId: skuB.id,
        cantidadPlanificada: "1",
        almacenInsumosId: almacenB.id,
        almacenDestinoId: almacenB.id,
        centroCostoId: centroB.id,
        usuarioId: usuarioB.id,
      },
    });
    const otB = await prisma.ordenTrabajo.create({
      data: { empresaId: empresaB.id, numero: `OT-B${RUN}`, descripcion: "OT ajena test", centroCostoId: centroB.id },
    });
    ordenAjenaId = ordenB.id;
    formulaAjenaId = formulaB.id;
    almacenAjenoId = almacenB.id;
    ordenTrabajoAjenaId = otB.id;
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

  it("orden sin OT y DTO con OT: el vale toma la OT del DTO", async () => {
    const ordenId = await crearOrden(false);
    const { id } = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      ordenProduccionId: ordenId,
      ordenTrabajoId,
      destino: "Planta",
      lineas: [{ skuId, cantidad: "1" }],
    });
    valesSinDespacho.push(BigInt(id));

    const guardado = await prisma.valeSalida.findUniqueOrThrow({ where: { id: BigInt(id) } });
    expect(guardado.ordenProduccionId).toBe(ordenId);
    expect(guardado.ordenTrabajoId).toBe(ordenTrabajoId);
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

  it("rechaza heredar una orden de trabajo cerrada despues de crear la orden", async () => {
    const otCerrable = await prisma.ordenTrabajo.create({
      data: { empresaId, numero: `OT-OP${RUN}-3`, descripcion: "OT que se cierra test", centroCostoId },
    });
    const ordenId = await crearOrden();
    await prisma.ordenProduccion.update({ where: { id: ordenId }, data: { ordenTrabajoId: otCerrable.id } });
    await prisma.ordenTrabajo.update({ where: { id: otCerrable.id }, data: { estado: "CERRADA" } });

    await expect(
      vales.crear(usuario, {
        almacenId,
        centroCostoId,
        ordenProduccionId: ordenId,
        destino: "Planta",
        lineas: [{ skuId, cantidad: "1" }],
      }),
    ).rejects.toThrow(new BadRequestException("No se puede imputar un vale a una orden de trabajo cerrada"));
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

  it("un segundo vale despachado sobre una orden EN_PROCESO se completa y la orden sigue EN_PROCESO", async () => {
    const ordenId = await crearOrden();
    const valeIds: bigint[] = [];
    for (const cantidad of ["1", "2"]) {
      const { id } = await vales.crear(usuario, {
        almacenId,
        centroCostoId,
        ordenProduccionId: ordenId,
        destino: "Planta",
        lineas: [{ skuId, cantidad }],
      });
      await vales.autorizar(autorizador, BigInt(id));
      await vales.despachar(autorizador, BigInt(id));
      valeIds.push(BigInt(id));
    }

    const orden = await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: ordenId } });
    expect(orden.estado).toBe("EN_PROCESO");
    const despachados = await prisma.valeSalida.findMany({ where: { id: { in: valeIds } } });
    expect(despachados.map((v) => v.estado)).toEqual(["DESPACHADO", "DESPACHADO"]);
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

  /**
   * Servicio de ordenes de produccion: crea la orden explotando y congelando la
   * formula, consulta el consumo desde el ledger, genera el vale de los insumos
   * pendientes y anula. Insumos A (100 a 5) y B (100 a 2), terminado T y una
   * formula base "10" con A "25" y B "10".
   */
  describe("servicio de ordenes de produccion", () => {
    const formulas = new FormulasService(prisma, new CorrelativoService(), auditoria);
    const ordenes = new OrdenesProduccionService(
      prisma,
      new CorrelativoService(),
      auditoria,
      vales,
      movimientos,
    );

    let insumoA: bigint;
    let insumoB: bigint;
    let terminadoT: bigint;
    let formulaBaseId: bigint;

    async function crearSkuProduccion(sufijo: string, nombre: string): Promise<bigint> {
      const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId } });
      const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId } });
      const producto = await prisma.producto.create({
        data: { empresaId, familiaId: familia.id, nombre },
      });
      const sku = await prisma.sku.create({
        data: { empresaId, productoId: producto.id, codigoParlante: `4${RUN}${sufijo}`, unidadId: unidad.id },
      });
      return sku.id;
    }

    async function crearFormula(
      cantidadBase: string,
      lineas: Array<{ skuInsumoId: bigint; cantidad: string }>,
    ): Promise<bigint> {
      const { id } = await formulas.crear(usuario, {
        nombre: `Formula OP ${RUN}`,
        skuTerminadoId: terminadoT,
        cantidadBase,
        lineas,
      });
      return BigInt(id);
    }

    function datosOrden(cantidadPlanificada: string, formulaId = formulaBaseId) {
      return {
        formulaId,
        cantidadPlanificada,
        almacenInsumosId: almacenId,
        almacenDestinoId: almacenId,
        centroCostoId,
      };
    }

    function lineaDe<T extends { skuInsumo: { id: string } }>(lineas: T[], id: bigint): T {
      const linea = lineas.find((l) => l.skuInsumo.id === id.toString());
      if (!linea) throw new Error(`Linea del SKU ${id} no encontrada`);
      return linea;
    }

    beforeAll(async () => {
      insumoA = await crearSkuProduccion("0101", "Insumo A produccion test");
      insumoB = await crearSkuProduccion("0102", "Insumo B produccion test");
      terminadoT = await crearSkuProduccion("0103", "Terminado T produccion test");
      await movimientos.recibirCompra(usuario, { skuId: insumoA, almacenId, cantidad: "100", costoUnitario: "5" });
      await movimientos.recibirCompra(usuario, { skuId: insumoB, almacenId, cantidad: "100", costoUnitario: "2" });
      formulaBaseId = await crearFormula("10", [
        { skuInsumoId: insumoA, cantidad: "25" },
        { skuInsumoId: insumoB, cantidad: "10" },
      ]);
    });

    it("explota la formula y congela las lineas", async () => {
      const { id, numero } = await ordenes.crear(usuario, datosOrden("4"));

      const detalle = await ordenes.obtener(empresaId, BigInt(id));
      expect(detalle.numero).toBe(numero);
      expect(detalle.estado).toBe("PLANIFICADA");
      expect(detalle.skuTerminado.id).toBe(terminadoT.toString());
      expect(detalle.cantidadPlanificada).toBe("4");
      expect(detalle.consumo.lineas).toHaveLength(2);
      expect(lineaDe(detalle.consumo.lineas, insumoA).cantidadPlanificada).toBe("10");
      expect(lineaDe(detalle.consumo.lineas, insumoB).cantidadPlanificada).toBe("4");
      expect(lineaDe(detalle.consumo.lineas, insumoA).cantidadPendiente).toBe("10");
      expect(detalle.consumo.costoTotalConsumido).toBe("0.00");
      expect(detalle.vales).toEqual([]);

      const guardadas = await prisma.ordenProduccionLinea.findMany({ where: { ordenProduccionId: BigInt(id) } });
      expect(guardadas.every((l) => l.empresaId === empresaId)).toBe(true);

      const enLista = (await ordenes.listar(empresaId, { estado: "PLANIFICADA" })).find((o) => o.id === id);
      expect(enLista?.cantidadLineas).toBe(2);
      const traza = await prisma.registroAuditoria.findFirst({
        where: { entidad: "ORDEN_PRODUCCION", entidadId: BigInt(id), accion: "CREAR" },
      });
      expect(traza).not.toBeNull();
    });

    it("redondea a 8 decimales un periodico", async () => {
      const formulaId = await crearFormula("3", [{ skuInsumoId: insumoA, cantidad: "1" }]);
      const { id } = await ordenes.crear(usuario, datosOrden("1", formulaId));

      const detalle = await ordenes.obtener(empresaId, BigInt(id));
      expect(lineaDe(detalle.consumo.lineas, insumoA).cantidadPlanificada).toBe("0.33333333");
    });

    it("rechaza formula inactiva y OT cerrada con 400", async () => {
      const formulaId = await crearFormula("1", [{ skuInsumoId: insumoA, cantidad: "1" }]);
      await formulas.darDeBaja(usuario, formulaId);
      await expect(ordenes.crear(usuario, datosOrden("1", formulaId))).rejects.toThrow(
        new BadRequestException("La fórmula está dada de baja"),
      );

      const otCerrada = await prisma.ordenTrabajo.create({
        data: { empresaId, numero: `OT-OP${RUN}-4`, descripcion: "OT cerrada test", centroCostoId, estado: "CERRADA" },
      });
      await expect(
        ordenes.crear(usuario, { ...datosOrden("1"), ordenTrabajoId: otCerrada.id }),
      ).rejects.toThrow(
        new BadRequestException("No se puede vincular la orden de producción a una orden de trabajo cerrada"),
      );
    });

    it("rechaza con 400 una formula cuyo SKU terminado esta inactivo", async () => {
      const terminadoInactivo = await crearSkuProduccion("0104", "Terminado inactivo test");
      const { id } = await formulas.crear(usuario, {
        nombre: `Formula terminado inactivo ${RUN}`,
        skuTerminadoId: terminadoInactivo,
        cantidadBase: "1",
        lineas: [{ skuInsumoId: insumoA, cantidad: "1" }],
      });
      await prisma.sku.update({ where: { id: terminadoInactivo }, data: { activo: false } });

      await expect(ordenes.crear(usuario, datosOrden("1", BigInt(id)))).rejects.toThrow(
        new BadRequestException(`El SKU 4${RUN}0104 está inactivo`),
      );
    });

    it("formulas disponibles devuelve solo las formulas activas de la empresa", async () => {
      const controlador = new OrdenesProduccionController(ordenes, formulas);
      const activaId = await crearFormula("1", [{ skuInsumoId: insumoA, cantidad: "1" }]);
      const inactivaId = await crearFormula("1", [{ skuInsumoId: insumoB, cantidad: "1" }]);
      await formulas.darDeBaja(usuario, inactivaId);

      const disponibles = await controlador.formulasDisponibles(usuario);
      const ids = disponibles.map((f) => f.id);
      expect(ids).toContain(activaId.toString());
      expect(ids).not.toContain(inactivaId.toString());
      expect(ids).not.toContain(formulaAjenaId.toString());
      expect(disponibles.every((f) => f.activo)).toBe(true);
      const deOtraEmpresa = await prisma.formula.count({
        where: { id: { in: ids.map((id) => BigInt(id)) }, empresaId: { not: empresaId } },
      });
      expect(deOtraEmpresa).toBe(0);

      // Solo exige el permiso de produccion y se declara antes de GET :id, que
      // de lo contrario capturaria "formulas-disponibles" como id.
      const prototipo = OrdenesProduccionController.prototype;
      expect(Reflect.getMetadata(PATH_METADATA, prototipo.formulasDisponibles)).toBe("formulas-disponibles");
      expect(Reflect.getMetadata(CLAVE_PERMISOS, prototipo.formulasDisponibles)).toEqual(["produccion.gestionar"]);
      const metodos = Object.getOwnPropertyNames(prototipo);
      expect(metodos.indexOf("formulasDisponibles")).toBeLessThan(metodos.indexOf("obtener"));
    });

    it("valida el DTO de creacion de la orden", async () => {
      const base = {
        formulaId: 1,
        cantidadPlanificada: "10",
        almacenInsumosId: 1,
        almacenDestinoId: 1,
        centroCostoId: 1,
      };
      expect((await validarCuerpo(CrearOrdenProduccionDto, { ...base, cantidadPlanificada: "0" })).valido).toBe(false);
      expect((await validarCuerpo(CrearOrdenProduccionDto, { ...base, formulaId: "abc" })).valido).toBe(false);
      expect((await validarCuerpo(CrearOrdenProduccionDto, base)).valido).toBe(true);
    });

    it("rechaza una linea que redondea a cero sin crear la orden", async () => {
      const formulaId = await crearFormula("1000000000", [{ skuInsumoId: insumoA, cantidad: "1" }]);
      await expect(ordenes.crear(usuario, datosOrden("1", formulaId))).rejects.toThrow(
        new BadRequestException(`La cantidad planificada es demasiado pequeña para el insumo 4${RUN}0101`),
      );
      const creadas = await prisma.ordenProduccion.count({ where: { empresaId, formulaId } });
      expect(creadas).toBe(0);
    });

    it("rechaza con 404 formula, almacen, OT y orden de otra empresa", async () => {
      await expect(ordenes.crear(usuario, datosOrden("1", formulaAjenaId))).rejects.toThrow(NotFoundException);
      await expect(
        ordenes.crear(usuario, { ...datosOrden("1"), almacenInsumosId: almacenAjenoId }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        ordenes.crear(usuario, { ...datosOrden("1"), almacenDestinoId: almacenAjenoId }),
      ).rejects.toThrow(NotFoundException);
      await expect(
        ordenes.crear(usuario, { ...datosOrden("1"), ordenTrabajoId: ordenTrabajoAjenaId }),
      ).rejects.toThrow(NotFoundException);
      await expect(ordenes.obtener(empresaId, ordenAjenaId)).rejects.toThrow(NotFoundException);
      await expect(ordenes.generarVale(usuario, ordenAjenaId)).rejects.toThrow(NotFoundException);
      await expect(ordenes.anular(usuario, ordenAjenaId)).rejects.toThrow(NotFoundException);
      await expect(
        ordenes.cerrar(usuario, ordenAjenaId, { cantidadProducida: "1" }),
      ).rejects.toThrow(NotFoundException);
    });

    it("generar vale crea un BORRADOR con las lineas pendientes", async () => {
      const { id, numero } = await ordenes.crear(usuario, datosOrden("4"));
      const { valeId } = await ordenes.generarVale(usuario, BigInt(id));
      valesSinDespacho.push(BigInt(valeId));

      const vale = await prisma.valeSalida.findUniqueOrThrow({
        where: { id: BigInt(valeId) },
        include: { lineas: true },
      });
      expect(vale.estado).toBe("BORRADOR");
      expect(vale.ordenProduccionId).toBe(BigInt(id));
      expect(vale.destino).toBe(`Orden de producción ${numero}`);
      expect(vale.lineas).toHaveLength(2);
      const cantidades = new Map(vale.lineas.map((l) => [l.skuId.toString(), l.cantidad.toString()]));
      expect(cantidades.get(insumoA.toString())).toBe("10");
      expect(cantidades.get(insumoB.toString())).toBe("4");

      const traza = await prisma.registroAuditoria.findFirst({
        where: { entidad: "ORDEN_PRODUCCION", entidadId: BigInt(id), accion: "GENERAR_VALE" },
      });
      expect(traza).not.toBeNull();
    });

    it("un segundo generar vale sin pendiente responde 400", async () => {
      const { id } = await ordenes.crear(usuario, datosOrden("4"));
      const { valeId } = await ordenes.generarVale(usuario, BigInt(id));
      valesSinDespacho.push(BigInt(valeId));

      const detalle = await ordenes.obtener(empresaId, BigInt(id));
      expect(lineaDe(detalle.consumo.lineas, insumoA).cantidadEnCurso).toBe("10");
      expect(lineaDe(detalle.consumo.lineas, insumoA).cantidadPendiente).toBe("0");

      await expect(ordenes.generarVale(usuario, BigInt(id))).rejects.toThrow(
        new BadRequestException("No hay insumos pendientes de entregar"),
      );
    });

    it("tras despachar, obtener muestra consumido, costo y EN_PROCESO", async () => {
      const { id } = await ordenes.crear(usuario, datosOrden("4"));
      const { valeId } = await ordenes.generarVale(usuario, BigInt(id));
      await vales.autorizar(autorizador, BigInt(valeId));
      await vales.despachar(autorizador, BigInt(valeId));

      const detalle = await ordenes.obtener(empresaId, BigInt(id));
      expect(detalle.estado).toBe("EN_PROCESO");
      const lineaA = lineaDe(detalle.consumo.lineas, insumoA);
      expect(lineaA.cantidadConsumida).toBe("10");
      expect(lineaA.costoConsumido).toBe("50.00");
      expect(lineaA.cantidadEnCurso).toBe("0");
      expect(lineaA.cantidadPendiente).toBe("0");
      const lineaB = lineaDe(detalle.consumo.lineas, insumoB);
      expect(lineaB.cantidadConsumida).toBe("4");
      expect(lineaB.costoConsumido).toBe("8.00");
      expect(detalle.consumo.fueraDeFormula).toEqual([]);
      expect(detalle.consumo.costoTotalConsumido).toBe("58.00");
      expect(detalle.vales).toEqual([expect.objectContaining({ id: valeId, estado: "DESPACHADO" })]);

      // Un insumo fuera de la formula despachado contra la orden se informa aparte
      // y suma al costo total consumido.
      const { id: valeExtraId } = await vales.crear(usuario, {
        almacenId,
        centroCostoId,
        ordenProduccionId: BigInt(id),
        destino: "Planta",
        lineas: [{ skuId, cantidad: "1" }],
      });
      await vales.autorizar(autorizador, BigInt(valeExtraId));
      await vales.despachar(autorizador, BigInt(valeExtraId));

      const conExtra = await ordenes.obtener(empresaId, BigInt(id));
      expect(conExtra.consumo.fueraDeFormula).toEqual([
        expect.objectContaining({ cantidadConsumida: "1", costoConsumido: "5.00" }),
      ]);
      expect(conExtra.consumo.fueraDeFormula[0]!.skuInsumo.id).toBe(skuId.toString());
      expect(conExtra.consumo.costoTotalConsumido).toBe("63.00");
    });

    it("editar la formula no cambia las lineas de la orden", async () => {
      const formulaId = await crearFormula("10", [
        { skuInsumoId: insumoA, cantidad: "25" },
        { skuInsumoId: insumoB, cantidad: "10" },
      ]);
      const { id } = await ordenes.crear(usuario, datosOrden("4", formulaId));
      await formulas.actualizar(usuario, formulaId, {
        cantidadBase: "1",
        lineas: [{ skuInsumoId: insumoA, cantidad: "7" }],
      });

      const detalle = await ordenes.obtener(empresaId, BigInt(id));
      expect(detalle.consumo.lineas).toHaveLength(2);
      expect(lineaDe(detalle.consumo.lineas, insumoA).cantidadPlanificada).toBe("10");
      expect(lineaDe(detalle.consumo.lineas, insumoB).cantidadPlanificada).toBe("4");
    });

    it("anular solo desde PLANIFICADA sin vales", async () => {
      const libre = await ordenes.crear(usuario, datosOrden("1"));
      await expect(ordenes.anular(usuario, BigInt(libre.id))).resolves.toEqual({ id: libre.id });
      const anulada = await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: BigInt(libre.id) } });
      expect(anulada.estado).toBe("ANULADA");
      const traza = await prisma.registroAuditoria.findFirst({
        where: { entidad: "ORDEN_PRODUCCION", entidadId: BigInt(libre.id), accion: "ANULAR" },
      });
      expect(traza).not.toBeNull();
      await expect(ordenes.anular(usuario, BigInt(libre.id))).rejects.toThrow(ConflictException);
      await expect(ordenes.generarVale(usuario, BigInt(libre.id))).rejects.toThrow(
        new BadRequestException("La orden de producción no admite nuevos vales"),
      );

      const enProceso = await ordenes.crear(usuario, datosOrden("1"));
      await prisma.ordenProduccion.update({ where: { id: BigInt(enProceso.id) }, data: { estado: "EN_PROCESO" } });
      await expect(ordenes.anular(usuario, BigInt(enProceso.id))).rejects.toThrow(
        new ConflictException("Solo se puede anular una orden planificada"),
      );

      const conVale = await ordenes.crear(usuario, datosOrden("1"));
      const { valeId } = await ordenes.generarVale(usuario, BigInt(conVale.id));
      valesSinDespacho.push(BigInt(valeId));
      await expect(ordenes.anular(usuario, BigInt(conVale.id))).rejects.toThrow(
        new BadRequestException("La orden tiene vales vinculados"),
      );
    });

    /**
     * Cierre: el costo del terminado es la suma de las salidas del ledger de los
     * vales despachados (promedio movil tal como se registro). Insumos propios
     * A (200 a 5) y B (200 a 2), terminado propio y una formula base "1" con
     * A "2" y B "1": una orden de "10" consume A 20 (100) y B 10 (20).
     */
    describe("cierre de la orden", () => {
      let insumoCierreA: bigint;
      let insumoCierreB: bigint;
      let terminadoCierre: bigint;
      let formulaCierreId: bigint;

      async function crearFormulaCierre(
        skuTerminadoId: bigint,
        lineas: Array<{ skuInsumoId: bigint; cantidad: string }>,
      ): Promise<bigint> {
        const { id } = await formulas.crear(usuario, {
          nombre: `Formula cierre ${RUN}`,
          skuTerminadoId,
          cantidadBase: "1",
          lineas,
        });
        return BigInt(id);
      }

      /** Autoriza y despacha un vale con un usuario distinto del solicitante. */
      async function despacharVale(valeId: string): Promise<void> {
        await vales.autorizar(autorizador, BigInt(valeId));
        await vales.despachar(autorizador, BigInt(valeId));
      }

      /** Crea la orden "10", genera su vale y lo despacha: queda EN_PROCESO. */
      async function ordenConConsumo(formula = formulaCierreId): Promise<bigint> {
        const { id } = await ordenes.crear(usuario, datosOrden("10", formula));
        const { valeId } = await ordenes.generarVale(usuario, BigInt(id));
        await despacharVale(valeId);
        return BigInt(id);
      }

      async function entradasDeProduccion(ordenId: bigint): Promise<number> {
        return prisma.movimientoStock.count({
          where: { empresaId, tipo: "ENTRADA_PRODUCCION", documentoTipo: "ORDEN_PRODUCCION", documentoId: ordenId },
        });
      }

      beforeAll(async () => {
        insumoCierreA = await crearSkuProduccion("0111", "Insumo A cierre test");
        insumoCierreB = await crearSkuProduccion("0112", "Insumo B cierre test");
        terminadoCierre = await crearSkuProduccion("0113", "Terminado cierre test");
        await movimientos.recibirCompra(usuario, { skuId: insumoCierreA, almacenId, cantidad: "200", costoUnitario: "5" });
        await movimientos.recibirCompra(usuario, { skuId: insumoCierreB, almacenId, cantidad: "200", costoUnitario: "2" });
        formulaCierreId = await crearFormulaCierre(terminadoCierre, [
          { skuInsumoId: insumoCierreA, cantidad: "2" },
          { skuInsumoId: insumoCierreB, cantidad: "1" },
        ]);
      });

      it("cierra con costo = suma del ledger y crea la entrada del terminado", async () => {
        const ordenId = await ordenConConsumo();

        const res = await ordenes.cerrar(usuario, ordenId, { cantidadProducida: "8" });
        expect(res.costoTotalInsumos).toBe("120.00");
        expect(res.costoUnitarioTerminado).toBe("15");

        const mov = await prisma.movimientoStock.findUniqueOrThrow({ where: { id: BigInt(res.movimientoId) } });
        expect(mov.tipo).toBe("ENTRADA_PRODUCCION");
        expect(mov.documentoTipo).toBe("ORDEN_PRODUCCION");
        expect(mov.documentoId).toBe(ordenId);
        expect(mov.skuId).toBe(terminadoCierre);
        expect(mov.cantidad.toString()).toBe("8");
        expect(mov.costoTotal.toString()).toBe("120");

        const capa = await prisma.capaCosto.findFirstOrThrow({ where: { movimientoEntradaId: mov.id } });
        expect(capa.cantidadInicial.toString()).toBe("8");
        expect(capa.costoUnitario.toString()).toBe("15");

        const stock = await prisma.itemStock.findFirstOrThrow({ where: { skuId: terminadoCierre, almacenId } });
        expect(stock.cantidadDisponible.toString()).toBe("8");

        const orden = await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: ordenId } });
        expect(orden.estado).toBe("CERRADA");
        expect(orden.cantidadProducida?.toString()).toBe("8");
        expect(orden.costoTotalInsumos?.toString()).toBe("120");
        expect(orden.costoUnitarioTerminado?.toString()).toBe("15");
        expect(orden.movimientoEntradaId).toBe(mov.id);
        expect(orden.fechaCierre).not.toBeNull();

        const detalle = await ordenes.obtener(empresaId, ordenId);
        expect(detalle.costoTotalInsumos).toBe("120.00");
        expect(detalle.movimientoEntradaId).toBe(res.movimientoId);

        const traza = await prisma.registroAuditoria.findFirst({
          where: { entidad: "ORDEN_PRODUCCION", entidadId: ordenId, accion: "CERRAR" },
        });
        expect(traza).not.toBeNull();
      });

      it("usa el promedio del ledger, no FIFO", async () => {
        const insumoC = await crearSkuProduccion("0114", "Insumo C cierre test");
        const terminadoC = await crearSkuProduccion("0116", "Terminado C cierre test");
        await movimientos.recibirCompra(usuario, { skuId: insumoC, almacenId, cantidad: "50", costoUnitario: "4" });
        await movimientos.recibirCompra(usuario, { skuId: insumoC, almacenId, cantidad: "50", costoUnitario: "6" });
        const formulaC = await crearFormulaCierre(terminadoC, [{ skuInsumoId: insumoC, cantidad: "2" }]);
        const ordenId = await ordenConConsumo(formulaC);

        // La salida de 20 se registro al promedio movil 5 (FIFO daria 80).
        const detalle = await ordenes.obtener(empresaId, ordenId);
        expect(lineaDe(detalle.consumo.lineas, insumoC).costoConsumido).toBe("100.00");

        const res = await ordenes.cerrar(usuario, ordenId, { cantidadProducida: "10" });
        expect(res.costoTotalInsumos).toBe("100.00");
        expect(res.costoUnitarioTerminado).toBe("10");
      });

      it("incluye en el costo un vale manual con un SKU fuera de formula", async () => {
        const insumoD = await crearSkuProduccion("0115", "Insumo D cierre test");
        await movimientos.recibirCompra(usuario, { skuId: insumoD, almacenId, cantidad: "10", costoUnitario: "3" });
        const ordenId = await ordenConConsumo();

        const { id: valeManualId } = await vales.crear(usuario, {
          almacenId,
          centroCostoId,
          ordenProduccionId: ordenId,
          destino: "Planta",
          lineas: [{ skuId: insumoD, cantidad: "10" }],
        });
        await despacharVale(valeManualId);

        const detalle = await ordenes.obtener(empresaId, ordenId);
        expect(detalle.consumo.fueraDeFormula).toEqual([
          expect.objectContaining({ cantidadConsumida: "10", costoConsumido: "30.00" }),
        ]);
        expect(detalle.consumo.fueraDeFormula[0]!.skuInsumo.id).toBe(insumoD.toString());

        const res = await ordenes.cerrar(usuario, ordenId, { cantidadProducida: "10" });
        expect(res.costoTotalInsumos).toBe("150.00");
        expect(res.costoUnitarioTerminado).toBe("15");
      });

      it("rechaza el cierre con un vale AUTORIZADO pendiente", async () => {
        const ordenId = await ordenConConsumo();
        const { id: pendienteId } = await vales.crear(usuario, {
          almacenId,
          centroCostoId,
          ordenProduccionId: ordenId,
          destino: "Planta",
          lineas: [{ skuId: insumoCierreA, cantidad: "1" }],
        });
        valesSinDespacho.push(BigInt(pendienteId));
        await vales.autorizar(autorizador, BigInt(pendienteId));

        await expect(ordenes.cerrar(usuario, ordenId, { cantidadProducida: "8" })).rejects.toThrow(
          new BadRequestException("Hay vales pendientes de despachar o anular"),
        );
        expect(await entradasDeProduccion(ordenId)).toBe(0);
        const orden = await prisma.ordenProduccion.findUniqueOrThrow({ where: { id: ordenId } });
        expect(orden.estado).toBe("EN_PROCESO");
      });

      it("rechaza el cierre en PLANIFICADA y repetido en CERRADA", async () => {
        const { id } = await ordenes.crear(usuario, datosOrden("10", formulaCierreId));
        const ordenId = BigInt(id);
        await expect(ordenes.cerrar(usuario, ordenId, { cantidadProducida: "8" })).rejects.toThrow(
          new BadRequestException("La orden no tiene consumo registrado"),
        );

        const { valeId } = await ordenes.generarVale(usuario, ordenId);
        await despacharVale(valeId);
        await ordenes.cerrar(usuario, ordenId, { cantidadProducida: "8" });

        await expect(ordenes.cerrar(usuario, ordenId, { cantidadProducida: "8" })).rejects.toThrow(
          new ConflictException("La orden de producción ya está cerrada o anulada"),
        );
        expect(await entradasDeProduccion(ordenId)).toBe(1);
      });

      it("rechaza por DTO cantidadProducida cero", async () => {
        const resultado = await validarCuerpo(CerrarOrdenProduccionDto, { cantidadProducida: "0" });
        expect(resultado.valido).toBe(false);
        const valido = await validarCuerpo(CerrarOrdenProduccionDto, { cantidadProducida: "8", almacenDestinoId: 1 });
        expect(valido.valido).toBe(true);
      });
    });
  });
});
