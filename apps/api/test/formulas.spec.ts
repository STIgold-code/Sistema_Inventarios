import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { CrearFormulaDto } from "../src/modulos/produccion/dto/formulas.dto.js";
import { FormulasService } from "../src/modulos/produccion/formulas.service.js";
import { validarCuerpo } from "./apoyo/validar-cuerpo.js";

/**
 * Fórmulas de producción (integración): CRUD con validaciones de composición,
 * correlativo, auditoría y aislamiento por empresa. Todo ocurre en dos empresas
 * desechables creadas aquí (sin movimientos de stock) y se borra al final.
 */
describe("Fórmulas de producción (integración)", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditoriaService(prisma);
  const formulas = new FormulasService(prisma, new CorrelativoService(), auditoria);

  const RUN = Date.now().toString().slice(-9);
  const empresas: bigint[] = [];

  let empresaA: bigint;
  let empresaB: bigint;
  let usuario: UsuarioRequest;
  let terminadoId: bigint;
  let insumo1Id: bigint;
  let insumo2Id: bigint;
  let inactivoId: bigint;
  let skuAjenoId: bigint;

  async function crearEmpresa(secuencia: number): Promise<bigint> {
    const empresa = await prisma.empresa.create({
      data: {
        ruc: `8${RUN.slice(-8)}${String(secuencia).padStart(2, "0")}`,
        razonSocial: `Empresa fórmulas ${RUN}-${secuencia}`,
        nombre: `Fórmulas ${secuencia}`,
      },
    });
    empresas.push(empresa.id);
    return empresa.id;
  }

  async function crearSku(
    empresaId: bigint,
    sufijo: string,
    nombre: string,
    activo = true,
  ): Promise<bigint> {
    const familia = await prisma.familia.upsert({
      where: { empresaId_codigo: { empresaId, codigo: "F1" } },
      update: {},
      create: { empresaId, codigo: "F1", nombre: "Familia" },
    });
    const unidad = await prisma.unidad.upsert({
      where: { empresaId_codigo: { empresaId, codigo: "KGM" } },
      update: {},
      create: { empresaId, codigo: "KGM", nombre: "Kilogramo" },
    });
    const producto = await prisma.producto.create({
      data: { empresaId, familiaId: familia.id, nombre },
    });
    const sku = await prisma.sku.create({
      data: {
        empresaId,
        productoId: producto.id,
        codigoParlante: `8${RUN}${sufijo}`,
        unidadId: unidad.id,
        activo,
      },
    });
    return sku.id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    empresaA = await crearEmpresa(1);
    empresaB = await crearEmpresa(2);
    const creado = await prisma.usuario.create({
      data: { empresaId: empresaA, email: `formulas-${RUN}@test.pe`, hashClave: "x", nombre: "Jefe de planta" },
    });
    usuario = {
      id: creado.id,
      empresaId: empresaA,
      email: creado.email,
      nombre: creado.nombre,
      permisos: [],
      debeCambiarClave: false,
    };
    terminadoId = await crearSku(empresaA, "0001", "Pintura terminada");
    insumo1Id = await crearSku(empresaA, "0002", "Resina");
    insumo2Id = await crearSku(empresaA, "0003", "Pigmento");
    inactivoId = await crearSku(empresaA, "0004", "Solvente descontinuado", false);
    skuAjenoId = await crearSku(empresaB, "0005", "Insumo de otra empresa");
  });

  afterAll(async () => {
    const enEmpresas = { in: empresas };
    await prisma.registroAuditoria.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.formulaLinea.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.formula.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.sku.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.producto.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.familia.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.unidad.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.documentoCorrelativo.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.usuario.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.empresa.deleteMany({ where: { id: enEmpresas } });
    await prisma.$disconnect();
  });

  function datosValidos() {
    return {
      nombre: "Pintura látex blanca",
      skuTerminadoId: terminadoId,
      cantidadBase: "100",
      lineas: [
        { skuInsumoId: insumo1Id, cantidad: "60.5" },
        { skuInsumoId: insumo2Id, cantidad: "2.25" },
      ],
    };
  }

  async function contarFormulas(): Promise<number> {
    return prisma.formula.count({ where: { empresaId: empresaA } });
  }

  async function ultimoCorrelativo(): Promise<number> {
    const fila = await prisma.documentoCorrelativo.findFirst({
      where: { empresaId: empresaA, tipoDocumento: "FORMULA" },
    });
    return fila?.ultimoNumero ?? 0;
  }

  it("rechaza por DTO cantidadBase cero y lineas vacías", async () => {
    const cuerpo = {
      nombre: "Pintura",
      skuTerminadoId: 1,
      cantidadBase: "10",
      lineas: [{ skuInsumoId: 2, cantidad: "1.5" }],
    };
    expect((await validarCuerpo(CrearFormulaDto, cuerpo)).valido).toBe(true);
    expect((await validarCuerpo(CrearFormulaDto, { ...cuerpo, cantidadBase: "0" })).valido).toBe(false);
    expect((await validarCuerpo(CrearFormulaDto, { ...cuerpo, cantidadBase: "0.000" })).valido).toBe(false);
    expect((await validarCuerpo(CrearFormulaDto, { ...cuerpo, lineas: [] })).valido).toBe(false);
    expect(
      (await validarCuerpo(CrearFormulaDto, { ...cuerpo, lineas: [{ skuInsumoId: 2, cantidad: "0" }] })).valido,
    ).toBe(false);
  });

  it("crea una fórmula con código correlativo y la devuelve con sus líneas", async () => {
    const { id, codigo } = await formulas.crear(usuario, {
      ...datosValidos(),
      observaciones: "Receta estándar",
    });
    expect(codigo).toBeDefined();
    expect(codigo).toMatch(/^\d{5}$/);

    const detalle = await formulas.obtener(empresaA, BigInt(id));
    expect(detalle.codigo).toBe(codigo);
    expect(detalle.activo).toBe(true);
    expect(detalle.cantidadBase).toBe("100");
    expect(detalle.observaciones).toBe("Receta estándar");
    expect(detalle.skuTerminado).toEqual({
      id: terminadoId.toString(),
      codigoParlante: `8${RUN}0001`,
      nombre: "Pintura terminada",
      unidad: "KGM",
    });
    expect(detalle.lineas).toHaveLength(2);
    expect(detalle.lineas.map((l) => [l.skuInsumo.id, l.cantidad])).toEqual(
      expect.arrayContaining([
        [insumo1Id.toString(), "60.5"],
        [insumo2Id.toString(), "2.25"],
      ]),
    );

    const resumen = (await formulas.listar(empresaA)).find((f) => f.id === id)!;
    expect(resumen.cantidadInsumos).toBe(2);
    expect(resumen.skuTerminado.id).toBe(terminadoId.toString());

    const traza = await prisma.registroAuditoria.findFirstOrThrow({
      where: { entidad: "FORMULA", entidadId: BigInt(id), accion: "CREAR" },
    });
    expect(traza.detalle).toContain(codigo);
  });

  it("rechaza un insumo igual al terminado con 400", async () => {
    const antes = await contarFormulas();
    const correlativoAntes = await ultimoCorrelativo();
    const intento = formulas.crear(usuario, {
      ...datosValidos(),
      lineas: [{ skuInsumoId: terminadoId, cantidad: "1" }],
    });
    await expect(intento).rejects.toThrow(
      new BadRequestException("Un insumo no puede ser el mismo producto terminado"),
    );
    expect(await contarFormulas()).toBe(antes);
    // Una petición rechazada no consume número del correlativo.
    expect(await ultimoCorrelativo()).toBe(correlativoAntes);
  });

  it("rechaza un insumo repetido con 400", async () => {
    const antes = await contarFormulas();
    await expect(
      formulas.crear(usuario, {
        ...datosValidos(),
        lineas: [
          { skuInsumoId: insumo1Id, cantidad: "1" },
          { skuInsumoId: insumo1Id, cantidad: "2" },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
    expect(await contarFormulas()).toBe(antes);
  });

  it("rechaza un SKU inactivo con 400", async () => {
    await expect(
      formulas.crear(usuario, {
        ...datosValidos(),
        lineas: [{ skuInsumoId: inactivoId, cantidad: "1" }],
      }),
    ).rejects.toThrow(new BadRequestException(`El SKU 8${RUN}0004 está inactivo`));
  });

  it("devuelve 404 si el SKU no es de la empresa", async () => {
    const antes = await contarFormulas();
    await expect(
      formulas.crear(usuario, { ...datosValidos(), skuTerminadoId: 999999999n }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      formulas.crear(usuario, {
        ...datosValidos(),
        lineas: [{ skuInsumoId: skuAjenoId, cantidad: "1" }],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(await contarFormulas()).toBe(antes);
  });

  it("actualizar reemplaza el conjunto de líneas", async () => {
    const { id } = await formulas.crear(usuario, datosValidos());
    await formulas.actualizar(usuario, BigInt(id), {
      nombre: "Pintura látex blanca v2",
      lineas: [{ skuInsumoId: insumo2Id, cantidad: "3" }],
    });

    const detalle = await formulas.obtener(empresaA, BigInt(id));
    expect(detalle.nombre).toBe("Pintura látex blanca v2");
    expect(detalle.lineas).toHaveLength(1);
    expect(detalle.lineas[0]!.skuInsumo.id).toBe(insumo2Id.toString());
    expect(detalle.lineas[0]!.cantidad).toBe("3");

    // Cambiar el terminado a uno de los insumos guardados se rechaza.
    await expect(
      formulas.actualizar(usuario, BigInt(id), { skuTerminadoId: insumo2Id }),
    ).rejects.toThrow(new BadRequestException("Un insumo no puede ser el mismo producto terminado"));

    // Otra empresa no puede ver ni modificar la fórmula.
    await expect(formulas.obtener(empresaB, BigInt(id))).rejects.toThrow(NotFoundException);
    await expect(
      formulas.actualizar({ ...usuario, empresaId: empresaB }, BigInt(id), { nombre: "Ajena" }),
    ).rejects.toThrow(NotFoundException);

    await prisma.registroAuditoria.findFirstOrThrow({
      where: { entidad: "FORMULA", entidadId: BigInt(id), accion: "ACTUALIZAR" },
    });
  });

  it("actualizar reemplaza las líneas aunque el terminado guardado se haya desactivado", async () => {
    // Terminado desechable para no afectar a los demás casos.
    const terminadoDesechable = await crearSku(empresaA, "0006", "Barniz descontinuado");
    const { id } = await formulas.crear(usuario, {
      ...datosValidos(),
      skuTerminadoId: terminadoDesechable,
    });
    await prisma.sku.update({ where: { id: terminadoDesechable }, data: { activo: false } });

    await formulas.actualizar(usuario, BigInt(id), {
      lineas: [{ skuInsumoId: insumo1Id, cantidad: "5" }],
    });

    const detalle = await formulas.obtener(empresaA, BigInt(id));
    expect(detalle.lineas).toHaveLength(1);
    expect(detalle.lineas[0]!.skuInsumo.id).toBe(insumo1Id.toString());
  });

  it("actualizar rechaza con 400 un nuevo terminado inactivo", async () => {
    const terminadoInactivo = await crearSku(empresaA, "0007", "Esmalte descontinuado", false);
    const { id } = await formulas.crear(usuario, datosValidos());

    await expect(
      formulas.actualizar(usuario, BigInt(id), { skuTerminadoId: terminadoInactivo }),
    ).rejects.toThrow(new BadRequestException(`El SKU 8${RUN}0007 está inactivo`));
    await expect(
      formulas.actualizar(usuario, BigInt(id), {
        skuTerminadoId: terminadoInactivo,
        lineas: [{ skuInsumoId: insumo1Id, cantidad: "1" }],
      }),
    ).rejects.toThrow(new BadRequestException(`El SKU 8${RUN}0007 está inactivo`));
    expect((await formulas.obtener(empresaA, BigInt(id))).skuTerminado.id).toBe(terminadoId.toString());
  });

  it("actualizar sin cambios responde 400 y no registra auditoría", async () => {
    const { id } = await formulas.crear(usuario, datosValidos());

    await expect(formulas.actualizar(usuario, BigInt(id), {})).rejects.toThrow(
      new BadRequestException("No hay cambios que aplicar"),
    );
    await expect(
      formulas.actualizar(usuario, BigInt(id), { nombre: undefined, lineas: undefined }),
    ).rejects.toThrow(new BadRequestException("No hay cambios que aplicar"));
    expect(
      await prisma.registroAuditoria.count({
        where: { entidad: "FORMULA", entidadId: BigInt(id), accion: "ACTUALIZAR" },
      }),
    ).toBe(0);
  });

  it("dar de baja y reactivar cambian activo", async () => {
    const { id } = await formulas.crear(usuario, datosValidos());
    const formulaId = BigInt(id);

    await formulas.darDeBaja(usuario, formulaId);
    expect((await formulas.obtener(empresaA, formulaId)).activo).toBe(false);
    await expect(formulas.darDeBaja(usuario, formulaId)).rejects.toThrow(ConflictException);
    expect((await formulas.listar(empresaA, { activo: true })).some((f) => f.id === id)).toBe(false);
    expect((await formulas.listar(empresaA, { activo: false })).some((f) => f.id === id)).toBe(true);

    await formulas.reactivar(usuario, formulaId);
    expect((await formulas.obtener(empresaA, formulaId)).activo).toBe(true);
    await expect(formulas.reactivar(usuario, formulaId)).rejects.toThrow(ConflictException);
    await expect(
      formulas.darDeBaja({ ...usuario, empresaId: empresaB }, formulaId),
    ).rejects.toThrow(NotFoundException);

    const acciones = await prisma.registroAuditoria.findMany({
      where: { entidad: "FORMULA", entidadId: formulaId, accion: { in: ["BAJA", "REACTIVAR"] } },
      select: { accion: true },
    });
    expect(acciones.map((a) => a.accion).sort()).toEqual(["BAJA", "REACTIVAR"]);
  });
});
