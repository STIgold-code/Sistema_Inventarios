import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host.js";
import { JwtService } from "@nestjs/jwt";
import type { Prisma } from "@prisma/client";
import { AuthService } from "../src/auth/auth.service.js";
import { hashearClave } from "../src/auth/clave.js";
import { JwtGuard } from "../src/auth/jwt.guard.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import {
  AuditoriaService,
  type DatosAuditoria,
} from "../src/modulos/auditoria/auditoria.service.js";
import {
  contarAdministradoresActivos,
  exigirAdministradorActivo,
  PERMISO_ADMINISTRAR_USUARIOS,
} from "../src/modulos/usuarios/administracion-usuarios.js";
import { UsuariosService } from "../src/modulos/usuarios/usuarios.service.js";

class ControladorPrueba {
  normal(): void {}
}

/** Espera maxima de la barrera: si no llegan todos, el que espera sigue solo. */
const ESPERA_BARRERA_MS = 500;

/** Repeticiones de cada carrera (cada una en una empresa nueva). */
const INTENTOS_CARRERA = 3;

/**
 * Barrera para forzar el solapamiento de dos transacciones: cada una espera a
 * que la otra llegue al mismo punto (o a que venza la espera). Sin el bloqueo
 * de administracion, ambas llegan y se verifican viendo al otro aun activo;
 * con el bloqueo, la segunda no puede llegar hasta que la primera termine.
 */
function crearBarrera(participantes: number): () => Promise<void> {
  let llegados = 0;
  let abrir: () => void = () => undefined;
  const abierta = new Promise<void>((resolver) => {
    abrir = resolver;
  });
  return async () => {
    llegados++;
    if (llegados >= participantes) abrir();
    let temporizador: NodeJS.Timeout | undefined;
    const vencida = new Promise<void>((resolver) => {
      temporizador = setTimeout(resolver, ESPERA_BARRERA_MS);
    });
    await Promise.race([abierta, vencida]);
    clearTimeout(temporizador);
  };
}

/**
 * Auditoria que se detiene en la barrera antes de escribir. El registro ocurre
 * dentro de la transaccion, despues de la escritura y antes de la invariante:
 * justo la ventana que el bloqueo debe cerrar.
 */
class AuditoriaConBarrera extends AuditoriaService {
  constructor(
    prisma: PrismaService,
    private readonly esperar: () => Promise<void>,
  ) {
    super(prisma);
  }

  override async registrar(datos: DatosAuditoria, tx?: Prisma.TransactionClient): Promise<void> {
    await this.esperar();
    return super.registrar(datos, tx);
  }
}

interface EmpresaPrueba {
  id: bigint;
  rolAdmin: bigint;
  rolBasico: bigint;
}

interface UsuarioPrueba {
  id: bigint;
  email: string;
  actor: UsuarioRequest;
}

/**
 * Administracion de usuarios (integracion). Todo ocurre en empresas
 * desechables creadas aqui, para no tocar los datos compartidos del entorno
 * local, y se borra al final.
 */
describe("Administracion de usuarios (integracion)", () => {
  const prisma = new PrismaService();
  const jwt = new JwtService({ secret: "clave-jwt-test", signOptions: { expiresIn: "1h" } });
  const auditoria = new AuditoriaService(prisma);
  const auth = new AuthService(prisma, jwt, new ConfigService(), auditoria);
  const servicio = new UsuariosService(prisma, auth, auditoria);
  const guard = new JwtGuard(jwt, auth, new Reflector());

  const RUN = Date.now().toString().slice(-9);
  const CLAVE = "Inicial-Segura-2026";
  const CLAVE_NUEVA = "Restablecida-Segura-2026";
  const MENSAJE_CORREO = "El correo ya esta registrado";
  const empresas: bigint[] = [];
  let secuencia = 0;

  let a: EmpresaPrueba;
  let b: EmpresaPrueba;
  let adminA: UsuarioPrueba;
  let ajenoB: UsuarioPrueba;
  let adminB: UsuarioPrueba;

  async function crearEmpresa(): Promise<EmpresaPrueba> {
    secuencia++;
    const empresa = await prisma.empresa.create({
      data: {
        ruc: `8${RUN.slice(-8)}${String(secuencia).padStart(2, "0")}`,
        razonSocial: `Empresa usuarios test ${RUN}-${secuencia}`,
        nombre: `Usuarios test ${secuencia}`,
      },
    });
    empresas.push(empresa.id);
    const [administrar, verProductos] = await Promise.all([
      prisma.permiso.upsert({
        where: { codigo: PERMISO_ADMINISTRAR_USUARIOS },
        update: {},
        create: { codigo: PERMISO_ADMINISTRAR_USUARIOS, nombre: "Administrar usuarios y roles" },
      }),
      prisma.permiso.upsert({
        where: { codigo: "producto.ver" },
        update: {},
        create: { codigo: "producto.ver", nombre: "Ver productos" },
      }),
    ]);
    const rolAdmin = await prisma.rol.create({
      data: {
        empresaId: empresa.id,
        codigo: "ADMIN",
        nombre: "Administrador",
        permisos: { create: [{ permisoId: administrar.id }] },
      },
    });
    const rolBasico = await prisma.rol.create({
      data: {
        empresaId: empresa.id,
        codigo: "BASICO",
        nombre: "Basico",
        permisos: { create: [{ permisoId: verProductos.id }] },
      },
    });
    return { id: empresa.id, rolAdmin: rolAdmin.id, rolBasico: rolBasico.id };
  }

  async function crearUsuario(
    empresa: EmpresaPrueba,
    sufijo: string,
    rolIds: bigint[],
  ): Promise<UsuarioPrueba> {
    const email = `usr-${sufijo}-${RUN}@test.pe`;
    const usuario = await prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        email,
        nombre: `Usuario ${sufijo}`,
        hashClave: await hashearClave(CLAVE),
        roles: { create: rolIds.map((rolId) => ({ rolId })) },
      },
    });
    const actor: UsuarioRequest = {
      id: usuario.id,
      empresaId: empresa.id,
      email,
      nombre: usuario.nombre,
      permisos: [PERMISO_ADMINISTRAR_USUARIOS],
      debeCambiarClave: false,
    };
    return { id: usuario.id, email, actor };
  }

  function activar(token: string): Promise<boolean> {
    const request = { headers: { authorization: `Bearer ${token}` } };
    const contexto = new ExecutionContextHost(
      [request, {}, () => undefined],
      ControladorPrueba,
      ControladorPrueba.prototype.normal,
    );
    return guard.canActivate(contexto);
  }

  /** Servicio cuyas mutaciones se encuentran en una barrera de `participantes`. */
  function servicioSolapado(participantes: number): UsuariosService {
    const conBarrera = new AuditoriaConBarrera(prisma, crearBarrera(participantes));
    return new UsuariosService(prisma, auth, conBarrera);
  }

  /**
   * Exactamente una gana y la otra se rechaza LIMPIAMENTE con el tipo esperado.
   * Un interbloqueo de Postgres u otro error cuenta como fallo: sin el bloqueo
   * de administracion es lo que ocurre en la baja cruzada.
   */
  function exigirUnExitoYUnRechazo(
    resultados: PromiseSettledResult<unknown>[],
    tipo: typeof ForbiddenException | typeof ConflictException,
  ): void {
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === "rejected");
    expect(rechazo?.status === "rejected" ? rechazo.reason : null).toBeInstanceOf(tipo);
  }

  function trazas(entidadId: bigint, accion: string): Promise<number> {
    return prisma.registroAuditoria.count({ where: { entidad: "USUARIO", entidadId, accion } });
  }

  function refreshActivos(usuarioId: bigint): Promise<number> {
    return prisma.tokenRefresh.count({ where: { usuarioId, revocadoEn: null } });
  }

  beforeAll(async () => {
    await prisma.$connect();
    a = await crearEmpresa();
    b = await crearEmpresa();
    adminA = await crearUsuario(a, "admin-a", [a.rolAdmin]);
    ajenoB = await crearUsuario(b, "ajeno-b", [b.rolBasico]);
    adminB = await crearUsuario(b, "admin-b", [b.rolAdmin]);
  });

  afterAll(async () => {
    const enEmpresas = { in: empresas };
    await prisma.registroAuditoria.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.tokenRefresh.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.usuarioRol.deleteMany({ where: { usuario: { empresaId: enEmpresas } } });
    await prisma.rolPermiso.deleteMany({ where: { rol: { empresaId: enEmpresas } } });
    await prisma.rol.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.usuario.deleteMany({ where: { empresaId: enEmpresas } });
    await prisma.empresa.deleteMany({ where: { id: enEmpresas } });
    await prisma.$disconnect();
  });

  describe("crear", () => {
    it("crea con clave temporal, roles y auditoria; normaliza el correo y no expone el hash", async () => {
      const creado = await servicio.crear(adminA.actor, {
        email: `  Nuevo-Uno-${RUN}@Test.PE `,
        nombre: "  Nuevo Uno ",
        clave: CLAVE,
        rolIds: [a.rolBasico, a.rolBasico],
      });

      expect(creado).toEqual({
        id: expect.any(String),
        email: `nuevo-uno-${RUN}@test.pe`,
        nombre: "Nuevo Uno",
        activo: true,
        debeCambiarClave: true,
        creadoEn: expect.any(String),
        roles: [{ id: a.rolBasico.toString(), codigo: "BASICO", nombre: "Basico" }],
      });

      const fila = await prisma.usuario.findUniqueOrThrow({ where: { id: BigInt(creado.id) } });
      expect(fila.debeCambiarClave).toBe(true);
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "USUARIO", entidadId: fila.id, accion: "CREAR" },
      });
      expect(traza.usuarioId).toBe(adminA.id);
      expect(traza.detalle).not.toContain(CLAVE);
      expect(traza.detalle).not.toContain(fila.hashClave);

      const ingreso = await auth.login(fila.email, CLAVE);
      expect(ingreso.usuario.debeCambiarClave).toBe(true);
    });

    it("rechaza un correo repetido en la misma empresa y en otra, con el mismo mensaje", async () => {
      const base = { nombre: "Repetido", clave: CLAVE, rolIds: [a.rolBasico] };

      await expect(
        servicio.crear(adminA.actor, { ...base, email: adminA.email.toUpperCase() }),
      ).rejects.toThrow(new ConflictException(MENSAJE_CORREO));
      await expect(
        servicio.crear(adminA.actor, { ...base, email: ajenoB.email }),
      ).rejects.toThrow(new ConflictException(MENSAJE_CORREO));
    });

    it("el usuario ingresa con el correo tal como lo escribio el administrador", async () => {
      const escrito = `  Maria.Lopez-${RUN}@BM.Test `;
      const creado = await servicio.crear(adminA.actor, {
        email: escrito,
        nombre: "Maria Lopez",
        clave: CLAVE,
        rolIds: [a.rolBasico],
      });
      expect(creado.email).toBe(`maria.lopez-${RUN}@bm.test`);

      const ingreso = await auth.login(escrito, CLAVE);
      expect(ingreso.usuario.id).toBe(creado.id);
      await expect(auth.login(escrito.trim().toUpperCase(), CLAVE)).resolves.toBeDefined();
    });

    it("dos altas concurrentes del mismo correo en empresas distintas: un usuario y un 409", async () => {
      const email = `carrera-correo-${RUN}@test.pe`;
      const solapado = servicioSolapado(2);
      const datos = { email, nombre: "Carrera", clave: CLAVE };

      const resultados = await Promise.allSettled([
        solapado.crear(adminA.actor, { ...datos, rolIds: [a.rolBasico] }),
        solapado.crear(adminB.actor, { ...datos, email: email.toUpperCase(), rolIds: [b.rolBasico] }),
      ]);

      exigirUnExitoYUnRechazo(resultados, ConflictException);
      const rechazo = resultados.find((r) => r.status === "rejected");
      expect(rechazo?.status === "rejected" ? String(rechazo.reason) : "").toContain(MENSAJE_CORREO);
      expect(await prisma.usuario.count({ where: { email } })).toBe(1);
    });

    it.each([
      ["prohibida", "admin1234"],
      ["corta", "Ab3$xyz"],
    ])("rechaza una clave %s con 400", async (_caso, clave) => {
      await expect(
        servicio.crear(adminA.actor, {
          email: `clave-mala-${RUN}@test.pe`,
          nombre: "Clave mala",
          clave,
          rolIds: [a.rolBasico],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.usuario.count({ where: { email: `clave-mala-${RUN}@test.pe` } })).toBe(0);
    });

    it("rechaza un rol de otra empresa (404) y una lista de roles vacia (400)", async () => {
      const base = { email: `sin-rol-${RUN}@test.pe`, nombre: "Sin rol", clave: CLAVE };

      await expect(
        servicio.crear(adminA.actor, { ...base, rolIds: [b.rolBasico] }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        servicio.crear(adminA.actor, { ...base, rolIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await prisma.usuario.count({ where: { email: base.email } })).toBe(0);
    });
  });

  describe("editar", () => {
    it("cambia nombre, correo (normalizado) y reemplaza los roles, auditando antes y despues", async () => {
      const objetivo = await crearUsuario(a, "editar", [a.rolBasico]);

      const editado = await servicio.actualizar(adminA.actor, objetivo.id, {
        nombre: "Nombre Editado",
        email: `EDITADO-${RUN}@test.pe`,
        rolIds: [a.rolAdmin, a.rolBasico],
      });

      expect(editado.nombre).toBe("Nombre Editado");
      expect(editado.email).toBe(`editado-${RUN}@test.pe`);
      expect(editado.roles.map((r) => r.codigo)).toEqual(["ADMIN", "BASICO"]);
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "USUARIO", entidadId: objetivo.id, accion: "ACTUALIZAR" },
      });
      expect(traza.detalle).toContain("roles: BASICO -> ADMIN, BASICO");

      const soloBasico = await servicio.actualizar(adminA.actor, objetivo.id, {
        rolIds: [a.rolBasico],
      });
      expect(soloBasico.roles.map((r) => r.codigo)).toEqual(["BASICO"]);
    });

    it("rechaza roles vacios y un correo ocupado", async () => {
      const objetivo = await crearUsuario(a, "editar-mal", [a.rolBasico]);

      await expect(
        servicio.actualizar(adminA.actor, objetivo.id, { rolIds: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        servicio.actualizar(adminA.actor, objetivo.id, { email: ajenoB.email }),
      ).rejects.toThrow(new ConflictException(MENSAJE_CORREO));
    });
  });

  describe("baja y reactivacion", () => {
    it("la baja revoca sesiones (refresh y access) e impide ingresar; reactivar devuelve el acceso", async () => {
      const objetivo = await crearUsuario(a, "baja", [a.rolBasico]);
      const sesion = await auth.login(objetivo.email, CLAVE);

      const baja = await servicio.darDeBaja(adminA.actor, objetivo.id);

      expect(baja.activo).toBe(false);
      expect(await trazas(objetivo.id, "DAR_DE_BAJA")).toBe(1);
      expect(await refreshActivos(objetivo.id)).toBe(0);
      await expect(activar(sesion.token)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(auth.refrescar(sesion.refreshToken)).rejects.toThrow();
      await expect(auth.login(objetivo.email, CLAVE)).rejects.toThrow();
      await expect(servicio.darDeBaja(adminA.actor, objetivo.id)).rejects.toBeInstanceOf(
        ConflictException,
      );

      const reactivado = await servicio.reactivar(adminA.actor, objetivo.id);
      expect(reactivado.activo).toBe(true);
      expect(await trazas(objetivo.id, "REACTIVAR")).toBe(1);
      const nueva = await auth.login(objetivo.email, CLAVE);
      await expect(activar(nueva.token)).resolves.toBe(true);
      await expect(servicio.reactivar(adminA.actor, objetivo.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("nadie puede darse de baja a si mismo", async () => {
      await expect(servicio.darDeBaja(adminA.actor, adminA.id)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("listar oculta a los inactivos salvo que se pidan", async () => {
      const inactivo = await crearUsuario(a, "listar-inactivo", [a.rolBasico]);
      await servicio.darDeBaja(adminA.actor, inactivo.id);

      const activos = await servicio.listar(a.id);
      const todos = await servicio.listar(a.id, true);

      expect(activos.some((u) => u.id === inactivo.id.toString())).toBe(false);
      expect(todos.some((u) => u.id === inactivo.id.toString())).toBe(true);
      expect(todos.every((u) => !("hashClave" in u) && !("versionSesion" in u))).toBe(true);
    });
  });

  describe("restablecer clave", () => {
    it("fija clave temporal, revoca sesiones y la clave anterior deja de servir", async () => {
      const objetivo = await crearUsuario(a, "restablecer", [a.rolBasico]);
      const sesion = await auth.login(objetivo.email, CLAVE);

      const resultado = await servicio.restablecerClave(adminA.actor, objetivo.id, CLAVE_NUEVA);

      expect(resultado.debeCambiarClave).toBe(true);
      expect(await refreshActivos(objetivo.id)).toBe(0);
      await expect(activar(sesion.token)).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(auth.login(objetivo.email, CLAVE)).rejects.toThrow();
      const nueva = await auth.login(objetivo.email, CLAVE_NUEVA);
      expect(nueva.usuario.debeCambiarClave).toBe(true);
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "USUARIO", entidadId: objetivo.id, accion: "RESTABLECER_CLAVE" },
      });
      expect(traza.detalle).not.toContain(CLAVE_NUEVA);
    });

    it("rechaza restablecer la propia clave y una clave que no cumple las reglas", async () => {
      const objetivo = await crearUsuario(a, "restablecer-mal", [a.rolBasico]);

      await expect(
        servicio.restablecerClave(adminA.actor, adminA.id, CLAVE_NUEVA),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        servicio.restablecerClave(adminA.actor, objetivo.id, "Password123"),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(auth.login(objetivo.email, CLAVE)).resolves.toBeDefined();
    });
  });

  describe("invariante: al menos un administrador activo", () => {
    it("el ultimo administrador no puede quitarse el rol", async () => {
      const empresa = await crearEmpresa();
      const unico = await crearUsuario(empresa, "unico-admin", [empresa.rolAdmin]);

      await expect(
        servicio.actualizar(unico.actor, unico.id, { rolIds: [empresa.rolBasico] }),
      ).rejects.toBeInstanceOf(ConflictException);

      const roles = await prisma.usuarioRol.findMany({ where: { usuarioId: unico.id } });
      expect(roles.map((r) => r.rolId)).toEqual([empresa.rolAdmin]);
    });

    it("dar de baja al ultimo administrador activo viola la invariante y se revierte", async () => {
      const empresa = await crearEmpresa();
      const unico = await crearUsuario(empresa, "inv-unico", [empresa.rolAdmin]);

      // La escritura de baja seguida de la invariante, como en cualquier mutacion.
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.usuario.update({ where: { id: unico.id }, data: { activo: false } });
          await exigirAdministradorActivo(tx, empresa.id);
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(await contarAdministradoresActivos(prisma, empresa.id)).toBe(1);
    });

    it("un actor que perdio el permiso despues de ser autorizado recibe 403", async () => {
      const empresa = await crearEmpresa();
      const x = await crearUsuario(empresa, "inv-x", [empresa.rolAdmin]);
      const y = await crearUsuario(empresa, "inv-y", [empresa.rolAdmin]);
      // X deja de ser administrador (Y sigue siendolo).
      await servicio.actualizar(x.actor, x.id, { rolIds: [empresa.rolBasico] });

      // Una peticion de X que el guard autorizo antes de que perdiera el permiso.
      await expect(servicio.darDeBaja(x.actor, y.id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        servicio.actualizar(x.actor, y.id, { nombre: "No debe aplicarse" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await contarAdministradoresActivos(prisma, empresa.id)).toBe(1);
      expect(await trazas(y.id, "DAR_DE_BAJA")).toBe(0);
    });

    it("dos bajas cruzadas concurrentes de los dos ultimos administradores dejan a uno", async () => {
      for (let intento = 0; intento < INTENTOS_CARRERA; intento++) {
        const empresa = await crearEmpresa();
        const x = await crearUsuario(empresa, `cruce-x-${intento}`, [empresa.rolAdmin]);
        const y = await crearUsuario(empresa, `cruce-y-${intento}`, [empresa.rolAdmin]);
        const solapado = servicioSolapado(2);

        const resultados = await Promise.allSettled([
          solapado.darDeBaja(x.actor, y.id),
          solapado.darDeBaja(y.actor, x.id),
        ]);

        // La perdedora espera el bloqueo y, al obtenerlo, su actor ya no es
        // administrador: 403 por la re-verificacion del actor.
        exigirUnExitoYUnRechazo(resultados, ForbiddenException);
        expect(await contarAdministradoresActivos(prisma, empresa.id)).toBe(1);
      }
    });

    it("dos retiros cruzados concurrentes del rol de administrador dejan a uno", async () => {
      for (let intento = 0; intento < INTENTOS_CARRERA; intento++) {
        const empresa = await crearEmpresa();
        const x = await crearUsuario(empresa, `rol-x-${intento}`, [empresa.rolAdmin]);
        const y = await crearUsuario(empresa, `rol-y-${intento}`, [empresa.rolAdmin]);
        const solapado = servicioSolapado(2);

        const resultados = await Promise.allSettled([
          solapado.actualizar(x.actor, y.id, { rolIds: [empresa.rolBasico] }),
          solapado.actualizar(y.actor, x.id, { rolIds: [empresa.rolBasico] }),
        ]);

        // La perdedora espera el bloqueo y, al obtenerlo, su actor ya no es
        // administrador: 403 por la re-verificacion del actor.
        exigirUnExitoYUnRechazo(resultados, ForbiddenException);
        expect(await contarAdministradoresActivos(prisma, empresa.id)).toBe(1);
      }
    });
  });

  describe("aislamiento por empresa", () => {
    it("operar sobre un usuario de otra empresa responde 'no encontrado'", async () => {
      const intentos: Array<() => Promise<unknown>> = [
        () => servicio.actualizar(adminA.actor, ajenoB.id, { nombre: "Intruso" }),
        () => servicio.darDeBaja(adminA.actor, ajenoB.id),
        () => servicio.reactivar(adminA.actor, ajenoB.id),
        () => servicio.restablecerClave(adminA.actor, ajenoB.id, CLAVE_NUEVA),
      ];

      for (const intento of intentos) {
        await expect(intento()).rejects.toBeInstanceOf(NotFoundException);
      }
      expect((await servicio.listar(a.id, true)).some((u) => u.email === ajenoB.email)).toBe(false);
      await expect(auth.login(ajenoB.email, CLAVE)).resolves.toBeDefined();
    });
  });
});
