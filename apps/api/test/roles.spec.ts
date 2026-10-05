import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants.js";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "../src/auth/auth.service.js";
import { hashearClave } from "../src/auth/clave.js";
import { JwtGuard } from "../src/auth/jwt.guard.js";
import { PermisosGuard } from "../src/auth/permisos.guard.js";
import { CLAVE_PERMISOS } from "../src/comun/decoradores/permisos.decorator.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { CODIGO_ROL_SISTEMA } from "../src/modulos/roles/reglas-rol.js";
import { PermisosController } from "../src/modulos/roles/permisos.controller.js";
import { RolesController } from "../src/modulos/roles/roles.controller.js";
import { RolesService } from "../src/modulos/roles/roles.service.js";
import { UsuariosService } from "../src/modulos/usuarios/usuarios.service.js";
import {
  contarAdministradoresActivos,
  PERMISO_ADMINISTRAR_USUARIOS,
} from "../src/modulos/usuarios/administracion-usuarios.js";
import { AuditoriaConBarrera, crearBarrera } from "./apoyo/auditoria-con-barrera.js";

/** Repeticiones de cada carrera (cada una en una empresa nueva). */
const INTENTOS_CARRERA = 3;

interface EmpresaPrueba {
  id: bigint;
  /** Rol del sistema (ADMIN) con el permiso de administracion. */
  rolSistema: bigint;
}

/**
 * Roles y catalogo de permisos (integracion). Todo ocurre en empresas
 * desechables creadas aqui y se borra al final.
 */
describe("Administracion de roles (integracion)", () => {
  const prisma = new PrismaService();
  const auditoria = new AuditoriaService(prisma);
  const auth = new AuthService(
    prisma,
    new JwtService({ secret: "clave-jwt-test", signOptions: { expiresIn: "1h" } }),
    new ConfigService(),
    auditoria,
  );
  const servicio = new RolesService(prisma, auditoria);

  const RUN = Date.now().toString().slice(-8);
  const empresas: bigint[] = [];
  let secuencia = 0;
  /** Permisos del catalogo usados en las pruebas, por codigo. */
  const permisos = new Map<string, bigint>();

  function idPermiso(codigo: string): bigint {
    const id = permisos.get(codigo);
    if (id === undefined) throw new Error(`Permiso de prueba no preparado: ${codigo}`);
    return id;
  }

  let a: EmpresaPrueba;
  let b: EmpresaPrueba;
  let adminA: UsuarioRequest;

  async function asegurarPermiso(codigo: string, nombre: string): Promise<void> {
    const fila = await prisma.permiso.upsert({
      where: { codigo },
      update: {},
      create: { codigo, nombre },
    });
    permisos.set(codigo, fila.id);
  }

  async function crearEmpresa(): Promise<EmpresaPrueba> {
    secuencia++;
    const empresa = await prisma.empresa.create({
      data: {
        ruc: `7${RUN}${String(secuencia).padStart(2, "0")}`,
        razonSocial: `Empresa roles test ${RUN}-${secuencia}`,
        nombre: `Roles test ${secuencia}`,
      },
    });
    empresas.push(empresa.id);
    const sistema = await crearRol(empresa.id, CODIGO_ROL_SISTEMA, [
      PERMISO_ADMINISTRAR_USUARIOS,
    ]);
    return { id: empresa.id, rolSistema: sistema };
  }

  /** Inserta un rol directamente (sin pasar por el servicio). */
  async function crearRol(empresaId: bigint, codigo: string, codigos: string[]): Promise<bigint> {
    const rol = await prisma.rol.create({
      data: {
        empresaId,
        codigo,
        nombre: `Rol ${codigo}`,
        permisos: { create: codigos.map((c) => ({ permisoId: idPermiso(c) })) },
      },
    });
    return rol.id;
  }

  async function crearUsuario(
    empresaId: bigint,
    sufijo: string,
    rolIds: bigint[],
    activo = true,
  ): Promise<UsuarioRequest> {
    const email = `rol-${sufijo}-${RUN}@test.pe`;
    const usuario = await prisma.usuario.create({
      data: {
        empresaId,
        email,
        nombre: `Usuario ${sufijo}`,
        activo,
        hashClave: await hashearClave("Inicial-Segura-2026"),
        roles: { create: rolIds.map((rolId) => ({ rolId })) },
      },
    });
    return {
      id: usuario.id,
      empresaId,
      email,
      nombre: usuario.nombre,
      permisos: [PERMISO_ADMINISTRAR_USUARIOS],
      debeCambiarClave: false,
    };
  }

  function trazas(entidadId: bigint, accion: string): Promise<number> {
    return prisma.registroAuditoria.count({ where: { entidad: "ROL", entidadId, accion } });
  }

  function idsDe(...codigos: string[]): bigint[] {
    return codigos.map(idPermiso);
  }

  beforeAll(async () => {
    await prisma.$connect();
    await asegurarPermiso(PERMISO_ADMINISTRAR_USUARIOS, "Administrar usuarios y roles");
    await asegurarPermiso("producto.ver", "Ver productos");
    await asegurarPermiso("inventario.ver", "Ver inventario y kardex");
    await asegurarPermiso("reporte.ver", "Ver reportes");
    a = await crearEmpresa();
    b = await crearEmpresa();
    adminA = await crearUsuario(a.id, "admin-a", [a.rolSistema]);
  });

  afterAll(async () => {
    const enEmpresas = { in: empresas };
    await prisma.registroAuditoria.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.usuarioRol.deleteMany({ where: { usuario: { empresaId: enEmpresas } } });
    await prisma.rolPermiso.deleteMany({ where: { rol: { empresaId: enEmpresas } } });
    await prisma.rol.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.usuario.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.empresa.deleteMany({ where: { id: enEmpresas } });
    await prisma.$disconnect();
  });

  describe("consultas", () => {
    it("el catalogo de permisos es global, ordenado por codigo y con forma { id, codigo, nombre }", async () => {
      const catalogo = await servicio.listarPermisos();

      const codigos = catalogo.map((p) => p.codigo);
      expect(codigos).toEqual([...codigos].sort((x, y) => x.localeCompare(y)));
      expect(catalogo.find((p) => p.codigo === PERMISO_ADMINISTRAR_USUARIOS)).toEqual({
        id: idPermiso(PERMISO_ADMINISTRAR_USUARIOS).toString(),
        codigo: PERMISO_ADMINISTRAR_USUARIOS,
        nombre: expect.any(String),
      });
      expect(catalogo.every((p) => Object.keys(p).sort().join() === "codigo,id,nombre")).toBe(true);
    });

    it("lista los roles de la empresa con soloLectura, cantidadUsuarios (incluye inactivos) y permisos ordenados", async () => {
      const empresa = await crearEmpresa();
      const lector = await crearRol(empresa.id, "LECTOR", ["reporte.ver", "producto.ver"]);
      await crearUsuario(empresa.id, "lista-admin", [empresa.rolSistema]);
      await crearUsuario(empresa.id, "lista-activo", [lector]);
      await crearUsuario(empresa.id, "lista-inactivo", [lector], false);

      const roles = await servicio.listar(empresa.id);

      expect(roles).toEqual([
        {
          id: empresa.rolSistema.toString(),
          codigo: CODIGO_ROL_SISTEMA,
          nombre: `Rol ${CODIGO_ROL_SISTEMA}`,
          soloLectura: true,
          cantidadUsuarios: 1,
          permisos: [expect.objectContaining({ codigo: PERMISO_ADMINISTRAR_USUARIOS })],
        },
        {
          id: lector.toString(),
          codigo: "LECTOR",
          nombre: "Rol LECTOR",
          soloLectura: false,
          cantidadUsuarios: 2,
          permisos: [
            {
              id: idPermiso("producto.ver").toString(),
              codigo: "producto.ver",
              nombre: expect.any(String),
            },
            {
              id: idPermiso("reporte.ver").toString(),
              codigo: "reporte.ver",
              nombre: expect.any(String),
            },
          ],
        },
      ]);
    });
  });

  describe("crear", () => {
    it("crea el rol con sus permisos y audita; el mismo codigo se permite en otra empresa", async () => {
      const creado = await servicio.crear(adminA, {
        codigo: "  ALMACEN_2 ",
        nombre: "  Almacen secundario ",
        permisoIds: idsDe("producto.ver", "inventario.ver", "producto.ver"),
      });

      expect(creado).toEqual({
        id: expect.any(String),
        codigo: "ALMACEN_2",
        nombre: "Almacen secundario",
        soloLectura: false,
        cantidadUsuarios: 0,
        permisos: [
          expect.objectContaining({ codigo: "inventario.ver" }),
          expect.objectContaining({ codigo: "producto.ver" }),
        ],
      });
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "ROL", entidadId: BigInt(creado.id), accion: "CREAR" },
      });
      expect(traza.detalle).toContain("inventario.ver, producto.ver");

      const adminB = await crearUsuario(b.id, "admin-b-crear", [b.rolSistema]);
      await expect(
        servicio.crear(adminB, {
          codigo: "ALMACEN_2",
          nombre: "Otro",
          permisoIds: idsDe("producto.ver"),
        }),
      ).resolves.toEqual(expect.objectContaining({ codigo: "ALMACEN_2" }));
    });

    it("rechaza un codigo repetido en la misma empresa (409) y el codigo reservado del sistema (409)", async () => {
      const base = { nombre: "Repetido", permisoIds: idsDe("producto.ver") };
      await servicio.crear(adminA, { ...base, codigo: "REPETIDO" });

      await expect(servicio.crear(adminA, { ...base, codigo: "REPETIDO" })).rejects.toThrow(
        new ConflictException("Ya existe un rol con ese codigo en la empresa"),
      );
      await expect(
        servicio.crear(adminA, { ...base, codigo: CODIGO_ROL_SISTEMA }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it.each(["minusculas", "A", "X".repeat(31), "CON-GUION", "CON ESPACIO"])(
      "rechaza el codigo %j con 400",
      async (codigo) => {
        await expect(
          servicio.crear(adminA, { codigo, nombre: "Malo", permisoIds: idsDe("producto.ver") }),
        ).rejects.toBeInstanceOf(BadRequestException);
      },
    );

    it("rechaza una lista de permisos vacia (400) y un permiso desconocido (404)", async () => {
      await expect(
        servicio.crear(adminA, { codigo: "SIN_PERMISOS", nombre: "Sin", permisoIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        servicio.crear(adminA, {
          codigo: "DESCONOCIDO",
          nombre: "Malo",
          permisoIds: [999_999_999n],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      const creados = await prisma.rol.count({
        where: { empresaId: a.id, codigo: { in: ["SIN_PERMISOS", "DESCONOCIDO"] } },
      });
      expect(creados).toBe(0);
    });
  });

  describe("editar", () => {
    it("cambia nombre y reemplaza permisos, conserva el codigo y audita antes y despues", async () => {
      const rol = await crearRol(a.id, "EDITABLE", ["producto.ver"]);

      const editado = await servicio.actualizar(adminA, rol, {
        nombre: "Editado",
        permisoIds: idsDe("inventario.ver", "reporte.ver"),
      });

      expect(editado.codigo).toBe("EDITABLE");
      expect(editado.nombre).toBe("Editado");
      expect(editado.permisos.map((p) => p.codigo)).toEqual(["inventario.ver", "reporte.ver"]);
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "ROL", entidadId: rol, accion: "ACTUALIZAR" },
      });
      expect(traza.detalle).toContain('nombre: "Rol EDITABLE" -> "Editado"');
      expect(traza.detalle).toContain("permisos: producto.ver -> inventario.ver, reporte.ver");
      expect(await prisma.rolPermiso.count({ where: { rolId: rol } })).toBe(2);
    });

    it("rechaza permisos vacios y una peticion sin datos", async () => {
      const rol = await crearRol(a.id, "EDITABLE_MAL", ["producto.ver"]);

      await expect(servicio.actualizar(adminA, rol, { permisoIds: [] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(servicio.actualizar(adminA, rol, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it("un cambio de permisos surte efecto en la siguiente carga del usuario", async () => {
      const rol = await crearRol(a.id, "EFECTO", ["producto.ver", "inventario.ver"]);
      const usuario = await crearUsuario(a.id, "efecto", [rol]);
      const { versionSesion } = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } });

      const antes = await auth.cargarUsuario(usuario.id, versionSesion);
      expect(antes.permisos).toContain("inventario.ver");

      await servicio.actualizar(adminA, rol, { permisoIds: idsDe("producto.ver") });

      const despues = await auth.cargarUsuario(usuario.id, versionSesion);
      expect(despues.permisos).toEqual(["producto.ver"]);
    });
  });

  describe("rol del sistema", () => {
    it("no se puede editar ni eliminar (409)", async () => {
      await expect(
        servicio.actualizar(adminA, a.rolSistema, { nombre: "Otro nombre" }),
      ).rejects.toThrow(new ConflictException("El rol ADMIN es del sistema y no se puede modificar"));
      await expect(servicio.eliminar(adminA, a.rolSistema)).rejects.toThrow(
        new ConflictException("El rol ADMIN es del sistema y no se puede eliminar"),
      );
      expect(await prisma.rol.count({ where: { id: a.rolSistema } })).toBe(1);
    });
  });

  describe("eliminar", () => {
    it("se rechaza mientras un usuario (incluso inactivo) tenga el rol; despues elimina el rol y sus vinculos", async () => {
      const rol = await crearRol(a.id, "TEMPORAL", ["producto.ver", "reporte.ver"]);
      const inactivo = await crearUsuario(a.id, "con-rol-inactivo", [rol], false);

      await expect(servicio.eliminar(adminA, rol)).rejects.toBeInstanceOf(ConflictException);
      expect(await prisma.rol.count({ where: { id: rol } })).toBe(1);

      await prisma.usuarioRol.deleteMany({ where: { usuarioId: inactivo.id } });
      await expect(servicio.eliminar(adminA, rol)).resolves.toEqual({
        id: rol.toString(),
        eliminado: true,
      });
      expect(await prisma.rol.count({ where: { id: rol } })).toBe(0);
      expect(await prisma.rolPermiso.count({ where: { rolId: rol } })).toBe(0);
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "ROL", entidadId: rol, accion: "ELIMINAR" },
      });
      expect(traza.detalle).toContain("producto.ver, reporte.ver");
    });
  });

  describe("invariante: al menos un administrador activo", () => {
    it("quitar usuario.administrar del unico rol que lo otorga responde 409 y revierte", async () => {
      const empresa = await crearEmpresa();
      // El rol del sistema no se edita: la administracion la otorga aqui un rol propio.
      const gestor = await crearRol(empresa.id, "GESTOR", [
        PERMISO_ADMINISTRAR_USUARIOS,
        "producto.ver",
      ]);
      const actor = await crearUsuario(empresa.id, "unico-gestor", [gestor]);

      await expect(
        servicio.actualizar(actor, gestor, { permisoIds: idsDe("producto.ver") }),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(await prisma.rolPermiso.count({ where: { rolId: gestor } })).toBe(2);
      expect(await trazas(gestor, "ACTUALIZAR")).toBe(0);
      expect(await contarAdministradoresActivos(prisma, empresa.id)).toBe(1);
    });

    it("dos retiros concurrentes del permiso en los dos roles que lo otorgan dejan uno", async () => {
      for (let intento = 0; intento < INTENTOS_CARRERA; intento++) {
        const empresa = await crearEmpresa();
        const g1 = await crearRol(empresa.id, "GESTOR_1", [PERMISO_ADMINISTRAR_USUARIOS]);
        const g2 = await crearRol(empresa.id, "GESTOR_2", [PERMISO_ADMINISTRAR_USUARIOS]);
        const x = await crearUsuario(empresa.id, `carrera-x-${intento}`, [g1]);
        const y = await crearUsuario(empresa.id, `carrera-y-${intento}`, [g2]);
        const solapado = new RolesService(prisma, new AuditoriaConBarrera(prisma, crearBarrera(2)));

        const resultados = await Promise.allSettled([
          solapado.actualizar(x, g2, { permisoIds: idsDe("producto.ver") }),
          solapado.actualizar(y, g1, { permisoIds: idsDe("producto.ver") }),
        ]);

        // La perdedora espera el bloqueo y, al obtenerlo, su actor ya no
        // administra (su rol perdio el permiso): 403 por la re-verificacion.
        expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
        const rechazo = resultados.find((r) => r.status === "rejected");
        expect(rechazo?.status === "rejected" ? rechazo.reason : null).toBeInstanceOf(
          ForbiddenException,
        );
        expect(await contarAdministradoresActivos(prisma, empresa.id)).toBe(1);
      }
    });
  });

  describe("concurrencia con la administracion de usuarios", () => {
    it("eliminar un rol mientras se asigna: una se rechaza y nunca queda una asignacion huerfana", async () => {
      for (let intento = 0; intento < INTENTOS_CARRERA; intento++) {
        const empresa = await crearEmpresa();
        const actor = await crearUsuario(empresa.id, `asignar-actor-${intento}`, [
          empresa.rolSistema,
        ]);
        const rol = await crearRol(empresa.id, "EFIMERO", ["producto.ver"]);
        const objetivo = await crearUsuario(empresa.id, `asignar-objetivo-${intento}`, [
          empresa.rolSistema,
        ]);
        // Ambos servicios comparten la barrera: sus transacciones se solapan
        // si nada las serializa.
        const conBarrera = new AuditoriaConBarrera(prisma, crearBarrera(2));
        const roles = new RolesService(prisma, conBarrera);
        const usuarios = new UsuariosService(prisma, auth, conBarrera);

        const [eliminacion, asignacion] = await Promise.allSettled([
          roles.eliminar(actor, rol),
          usuarios.actualizar(actor, objetivo.id, { rolIds: [empresa.rolSistema, rol] }),
        ]);

        const existeRol = (await prisma.rol.count({ where: { id: rol } })) === 1;
        const asignaciones = await prisma.usuarioRol.count({ where: { rolId: rol } });
        if (eliminacion.status === "fulfilled") {
          // Gano la eliminacion: la asignacion vio el rol inexistente (404).
          expect(asignacion.status === "rejected" ? asignacion.reason : null).toBeInstanceOf(
            NotFoundException,
          );
          expect(existeRol).toBe(false);
        } else {
          // Gano la asignacion: la eliminacion vio un usuario asignado (409).
          expect(eliminacion.reason).toBeInstanceOf(ConflictException);
          expect(asignacion.status).toBe("fulfilled");
          expect(existeRol).toBe(true);
          expect(asignaciones).toBe(1);
        }
        expect(existeRol || asignaciones === 0).toBe(true);
      }
    });
  });

  describe("proteccion de los endpoints", () => {
    it("todo handler de RolesController y PermisosController exige JwtGuard, PermisosGuard y usuario.administrar", () => {
      const reflector = new Reflector();
      const controladores = [RolesController, PermisosController];
      let handlers = 0;

      for (const controlador of controladores) {
        expect(reflector.get(GUARDS_METADATA, controlador)).toEqual([JwtGuard, PermisosGuard]);
        const prototipo: object = controlador.prototype;
        for (const nombre of Object.getOwnPropertyNames(prototipo)) {
          const handler: unknown = Object.getOwnPropertyDescriptor(prototipo, nombre)?.value;
          if (nombre === "constructor" || typeof handler !== "function") continue;
          handlers++;
          const etiqueta = `${controlador.name}.${nombre}`;
          const permisos: unknown = reflector.get(CLAVE_PERMISOS, handler);
          expect({ etiqueta, permisos }).toEqual({
            etiqueta,
            permisos: [PERMISO_ADMINISTRAR_USUARIOS],
          });
        }
      }
      // listar, crear, actualizar, eliminar + listar del catalogo.
      expect(handlers).toBe(5);
    });
  });

  describe("aislamiento por empresa", () => {
    it("un rol de otra empresa responde 'no encontrado' y no aparece en el listado", async () => {
      const ajeno = await crearRol(b.id, "AJENO", ["producto.ver"]);
      const intentos: Array<() => Promise<unknown>> = [
        () => servicio.actualizar(adminA, ajeno, { nombre: "Intruso" }),
        () => servicio.eliminar(adminA, ajeno),
      ];

      for (const intento of intentos) {
        await expect(intento()).rejects.toBeInstanceOf(NotFoundException);
      }
      expect((await servicio.listar(a.id)).some((r) => r.id === ajeno.toString())).toBe(false);
      expect(await prisma.rol.findUniqueOrThrow({ where: { id: ajeno } })).toEqual(
        expect.objectContaining({ nombre: "Rol AJENO" }),
      );
    });
  });
});
