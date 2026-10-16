import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { CrearRequerimientoDto } from "../src/modulos/requerimientos/dto/requerimientos.dto.js";
import { RequerimientosService } from "../src/modulos/requerimientos/requerimientos.service.js";
import { validarCuerpo } from "./apoyo/validar-cuerpo.js";

interface EmpresaPrueba {
  id: bigint;
  centroCostoId: bigint;
  otAbierta: { id: bigint; numero: string };
  otCerrada: { id: bigint; numero: string };
  proveedorId: bigint;
}

/**
 * Requerimiento de compra con los datos del "Pedido de Materiales" en papel
 * (integracion): orden de trabajo ("O/T"), marca o referencia y proveedor
 * sugerido por linea. Todo ocurre en dos empresas desechables creadas aqui
 * (sin movimientos de stock) y se borra al final.
 */
describe("Requerimiento con OT, referencia y proveedor sugerido (integracion)", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditoriaService(prisma);
  const requerimientos = new RequerimientosService(prisma, new CorrelativoService(), auditoria);

  const RUN = Date.now().toString().slice(-9);
  const empresas: bigint[] = [];
  let secuencia = 0;

  let a: EmpresaPrueba;
  let b: EmpresaPrueba;
  let solicitante: UsuarioRequest;
  let skuId: bigint;

  async function crearEmpresa(): Promise<EmpresaPrueba> {
    secuencia++;
    const sufijo = `${RUN.slice(-8)}${String(secuencia).padStart(2, "0")}`;
    const empresa = await prisma.empresa.create({
      data: {
        ruc: `7${sufijo}`,
        razonSocial: `Empresa requerimiento OT ${RUN}-${secuencia}`,
        nombre: `Requerimiento OT ${secuencia}`,
      },
    });
    empresas.push(empresa.id);
    const centro = await prisma.centroCosto.create({
      data: { empresaId: empresa.id, codigo: `CC${secuencia}`, nombre: "Obra test" },
    });
    const otAbierta = await prisma.ordenTrabajo.create({
      data: {
        empresaId: empresa.id,
        numero: `OT-${secuencia}-A`,
        descripcion: "Montaje de tablero",
        centroCostoId: centro.id,
      },
    });
    const otCerrada = await prisma.ordenTrabajo.create({
      data: {
        empresaId: empresa.id,
        numero: `OT-${secuencia}-C`,
        descripcion: "Trabajo terminado",
        centroCostoId: centro.id,
        estado: "CERRADA",
        fechaCierre: new Date(),
      },
    });
    const proveedor = await prisma.proveedor.create({
      data: { empresaId: empresa.id, ruc: `2${sufijo}`, razonSocial: `Proveedor test ${secuencia} SAC` },
    });
    return {
      id: empresa.id,
      centroCostoId: centro.id,
      otAbierta: { id: otAbierta.id, numero: otAbierta.numero },
      otCerrada: { id: otCerrada.id, numero: otCerrada.numero },
      proveedorId: proveedor.id,
    };
  }

  beforeAll(async () => {
    await prisma.$connect();
    a = await crearEmpresa();
    b = await crearEmpresa();
    const usuario = await prisma.usuario.create({
      data: { empresaId: a.id, email: `req-ot-${RUN}@test.pe`, hashClave: "x", nombre: "Solicitante" },
    });
    solicitante = {
      id: usuario.id,
      empresaId: a.id,
      email: usuario.email,
      nombre: usuario.nombre,
      permisos: [],
      debeCambiarClave: false,
    };
    const familia = await prisma.familia.create({ data: { empresaId: a.id, codigo: "F1", nombre: "Familia" } });
    const unidad = await prisma.unidad.create({ data: { empresaId: a.id, codigo: "UND", nombre: "Unidad" } });
    const producto = await prisma.producto.create({
      data: { empresaId: a.id, familiaId: familia.id, nombre: "Cable test" },
    });
    skuId = (
      await prisma.sku.create({
        data: { empresaId: a.id, productoId: producto.id, codigoParlante: `7${RUN}0001`, unidadId: unidad.id },
      })
    ).id;
  });

  afterAll(async () => {
    const enEmpresas = { in: empresas };
    await prisma.registroAuditoria.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.requerimientoCompraLinea.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.requerimientoCompra.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.sku.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.producto.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.familia.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.unidad.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.ordenTrabajo.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.proveedor.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.centroCosto.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.documentoCorrelativo.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.usuario.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.empresa.deleteMany({ where: { id: enEmpresas } });
    await prisma.$disconnect();
  });

  /** Cuerpo valido; `extra` y `linea` agregan o pisan campos de cabecera y linea. */
  function cuerpo(extra: object = {}, linea: object = {}): object {
    return {
      centroCostoId: Number(a.centroCostoId),
      lineas: [{ skuId: Number(skuId), cantidad: "4", ...linea }],
      ...extra,
    };
  }

  async function contarRequerimientos(): Promise<number> {
    return prisma.requerimientoCompra.count({ where: { empresaId: a.id } });
  }

  it("guarda y devuelve la OT, la referencia recortada y el proveedor sugerido", async () => {
    const validado = await validarCuerpo(
      CrearRequerimientoDto,
      cuerpo(
        { ordenTrabajoId: Number(a.otAbierta.id) },
        { referencia: "  Indeco 2.5 mm  ", proveedorSugeridoId: Number(a.proveedorId) },
      ),
    );
    if (!validado.valido) throw new Error(validado.mensajes.join("; "));
    const linea = validado.valor.lineas[0]!;
    expect(linea.referencia).toBe("Indeco 2.5 mm");

    const { id } = await requerimientos.crear(solicitante, {
      centroCostoId: a.centroCostoId,
      ordenTrabajoId: a.otAbierta.id,
      lineas: [
        { skuId, cantidad: linea.cantidad, referencia: linea.referencia, proveedorSugeridoId: a.proveedorId },
        // Linea sin datos opcionales: ambos quedan en null.
        { skuId, cantidad: "1" },
      ],
    });

    const otEsperada = {
      id: a.otAbierta.id.toString(),
      numero: a.otAbierta.numero,
      descripcion: "Montaje de tablero",
    };
    const detalle = await requerimientos.obtener(a.id, BigInt(id));
    expect(detalle.ordenTrabajo).toEqual(otEsperada);
    expect(detalle.lineas).toHaveLength(2);
    const conDatos = detalle.lineas.find((l) => l.referencia !== null)!;
    const sinDatos = detalle.lineas.find((l) => l.referencia === null)!;
    expect(conDatos.referencia).toBe("Indeco 2.5 mm");
    expect(conDatos.proveedorSugerido).toEqual({
      id: a.proveedorId.toString(),
      razonSocial: "Proveedor test 1 SAC",
    });
    expect(sinDatos.proveedorSugerido).toBeNull();

    const enLista = (await requerimientos.listar(a.id)).find((r) => r.id === id)!;
    expect(enLista.ordenTrabajo).toEqual(otEsperada);
    expect(enLista.lineas.map((l) => l.proveedorSugerido?.id ?? null)).toEqual(
      expect.arrayContaining([a.proveedorId.toString(), null]),
    );

    const traza = await prisma.registroAuditoria.findFirstOrThrow({
      where: { entidad: "REQUERIMIENTO", entidadId: BigInt(id), accion: "CREAR" },
    });
    expect(traza.detalle).toContain(a.otAbierta.numero);
  });

  it("rechaza con 404 una orden de trabajo de otra empresa", async () => {
    const antes = await contarRequerimientos();
    await expect(
      requerimientos.crear(solicitante, {
        centroCostoId: a.centroCostoId,
        ordenTrabajoId: b.otAbierta.id,
        lineas: [{ skuId, cantidad: "1" }],
      }),
    ).rejects.toThrow(new NotFoundException("Orden de trabajo no encontrada"));
    expect(await contarRequerimientos()).toBe(antes);
  });

  it("rechaza con 404 un proveedor sugerido de otra empresa", async () => {
    const antes = await contarRequerimientos();
    await expect(
      requerimientos.crear(solicitante, {
        centroCostoId: a.centroCostoId,
        lineas: [
          { skuId, cantidad: "1", proveedorSugeridoId: a.proveedorId },
          { skuId, cantidad: "1", proveedorSugeridoId: b.proveedorId },
        ],
      }),
    ).rejects.toThrow(new NotFoundException("Proveedor no encontrado"));
    expect(await contarRequerimientos()).toBe(antes);
  });

  it("rechaza con 400 una orden de trabajo cerrada, como hace el vale", async () => {
    const antes = await contarRequerimientos();
    const intento = requerimientos.crear(solicitante, {
      centroCostoId: a.centroCostoId,
      ordenTrabajoId: a.otCerrada.id,
      lineas: [{ skuId, cantidad: "1" }],
    });
    await expect(intento).rejects.toThrow(BadRequestException);
    await expect(intento).rejects.toThrow(/esta cerrada/);
    expect(await contarRequerimientos()).toBe(antes);
  });

  it("el DTO rechaza null en los campos nuevos y una referencia de mas de 200 caracteres", async () => {
    expect((await validarCuerpo(CrearRequerimientoDto, cuerpo({ ordenTrabajoId: null }))).valido).toBe(false);
    expect((await validarCuerpo(CrearRequerimientoDto, cuerpo({}, { proveedorSugeridoId: null }))).valido).toBe(false);
    expect((await validarCuerpo(CrearRequerimientoDto, cuerpo({}, { referencia: null }))).valido).toBe(false);
    expect((await validarCuerpo(CrearRequerimientoDto, cuerpo({}, { referencia: "x".repeat(201) }))).valido).toBe(false);
    expect((await validarCuerpo(CrearRequerimientoDto, cuerpo({}, { referencia: "x".repeat(200) }))).valido).toBe(true);
  });
});
