import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { ExecutionContextHost } from "@nestjs/core/helpers/execution-context-host.js";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import {
  CLAVE_PERMITIR_CLAVE_TEMPORAL,
  PermitirClaveTemporal,
} from "../src/comun/decoradores/permitir-clave-temporal.decorator.js";
import { AuthService } from "../src/auth/auth.service.js";
import { hashearClave } from "../src/auth/clave.js";
import { CODIGO_CLAVE_TEMPORAL, JwtGuard } from "../src/auth/jwt.guard.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { CODIGO_CLAVE_INVALIDA } from "../src/auth/clave-invalida.js";
import { cuerpoDelError } from "./apoyo/cuerpo-error.js";

/** Controlador ficticio: un handler normal y uno exento del bloqueo. */
class ControladorPrueba {
  normal(): void {}

  @PermitirClaveTemporal()
  exento(): void {}
}

/**
 * Cambio de clave, invalidacion de sesiones (version en el JWT + refresh) y
 * bloqueo por clave temporal en el JwtGuard. Cada caso crea su propio usuario
 * y todo se limpia al final.
 */
describe("Cambio de clave y bloqueo por clave temporal (integracion)", () => {
  const prisma = new PrismaService();
  const jwt = new JwtService({
    secret: "clave-jwt-test",
    signOptions: { expiresIn: "1h" },
  });
  const auth = new AuthService(
    prisma,
    jwt,
    new ConfigService(),
    new AuditoriaService(prisma),
  );
  const reflector = new Reflector();
  const guard = new JwtGuard(jwt, auth, reflector);

  const RUN = Date.now().toString().slice(-9);
  const CLAVE_INICIAL = "temporal-1234";
  const CLAVE_NUEVA = "definitiva-5678";
  const creados: bigint[] = [];
  let empresaId: bigint;

  async function crearUsuario(
    sufijo: string,
    opciones: { debeCambiarClave: boolean; activo?: boolean },
  ): Promise<{ id: bigint; email: string }> {
    const email = `clave-${sufijo}-${RUN}@bmingenieros.pe`;
    const usuario = await prisma.usuario.create({
      data: {
        empresaId,
        email,
        hashClave: await hashearClave(CLAVE_INICIAL),
        nombre: "Usuario Cambio Clave Test",
        debeCambiarClave: opciones.debeCambiarClave,
        activo: opciones.activo ?? true,
      },
    });
    creados.push(usuario.id);
    return { id: usuario.id, email };
  }

  /** Ejecuta el guard sobre un handler del controlador ficticio. */
  function activar(
    token: string,
    handler: keyof ControladorPrueba,
  ): Promise<boolean> {
    const request = { headers: { authorization: `Bearer ${token}` } };
    const contexto = new ExecutionContextHost(
      [request, {}, () => undefined],
      ControladorPrueba,
      ControladorPrueba.prototype[handler],
    );
    return guard.canActivate(contexto);
  }

  async function versionDe(id: bigint): Promise<number> {
    const fila = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    return fila.versionSesion;
  }

  async function refreshActivos(id: bigint): Promise<number> {
    return prisma.tokenRefresh.count({ where: { usuarioId: id, revocadoEn: null } });
  }

  async function idDeRefresh(plano: string): Promise<bigint> {
    const fila = await prisma.tokenRefresh.findUniqueOrThrow({
      where: { tokenHash: createHash("sha256").update(plano).digest("hex") },
    });
    return fila.id;
  }

  /** Refresh tokens activos en la cadena que empieza en `id` (siguiendo rotaciones). */
  async function activosEnCadena(id: bigint): Promise<number> {
    let activos = 0;
    let actual = await prisma.tokenRefresh.findUnique({ where: { id } });
    while (actual) {
      if (actual.revocadoEn === null) activos++;
      if (actual.reemplazadoPorId === null) break;
      actual = await prisma.tokenRefresh.findUnique({ where: { id: actual.reemplazadoPorId } });
    }
    return activos;
  }

  async function trazasCambio(id: bigint): Promise<number> {
    return prisma.registroAuditoria.count({
      where: { usuarioId: id, accion: "CAMBIAR_CLAVE", entidad: "USUARIO", entidadId: id },
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    empresaId = empresa.id;
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({ where: { usuarioId: { in: creados } } });
    await prisma.tokenRefresh.deleteMany({ where: { usuarioId: { in: creados } } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    await prisma.$disconnect();
  });

  describe("cambio de clave", () => {
    it("exitoso: limpia la marca, rota la clave, sube la version de sesion y audita", async () => {
      const { id, email } = await crearUsuario("ok", { debeCambiarClave: true });
      const sesionPrevia = await auth.login(email, CLAVE_INICIAL);
      expect(sesionPrevia.usuario.debeCambiarClave).toBe(true);
      const versionPrevia = await versionDe(id);

      const resultado = await auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_NUEVA);

      expect(resultado.token).toEqual(expect.any(String));
      expect(resultado.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(resultado.usuario.debeCambiarClave).toBe(false);

      const fila = await prisma.usuario.findUniqueOrThrow({ where: { id } });
      expect(fila.debeCambiarClave).toBe(false);
      expect(fila.versionSesion).toBe(versionPrevia + 1);

      await expect(auth.login(email, CLAVE_INICIAL)).rejects.toThrow();
      const conNueva = await auth.login(email, CLAVE_NUEVA);
      expect(conNueva.usuario.id).toBe(id.toString());

      expect(await trazasCambio(id)).toBe(1);
    });

    it("rechaza con 400 si la clave actual es incorrecta, sin tocar sesiones ni auditar", async () => {
      const { id, email } = await crearUsuario("mala", { debeCambiarClave: true });
      const sesion = await auth.login(email, CLAVE_INICIAL);
      const versionPrevia = await versionDe(id);

      await expect(
        auth.cambiarClave(id, "no-es-la-clave", CLAVE_NUEVA),
      ).rejects.toBeInstanceOf(BadRequestException);
      // No es una regla de la clave NUEVA: sin codigo CLAVE_INVALIDA.
      const cuerpo = await cuerpoDelError(auth.cambiarClave(id, "no-es-la-clave", CLAVE_NUEVA));
      expect(cuerpo).not.toHaveProperty("codigo");

      const fila = await prisma.usuario.findUniqueOrThrow({ where: { id } });
      expect(fila.debeCambiarClave).toBe(true);
      expect(fila.versionSesion).toBe(versionPrevia);
      expect(await refreshActivos(id)).toBe(1);
      expect(await trazasCambio(id)).toBe(0);
      await expect(activar(sesion.token, "exento")).resolves.toBe(true);
      await expect(auth.login(email, CLAVE_INICIAL)).resolves.toBeDefined();
    });

    it("rechaza con 400 si la nueva clave es igual a la actual", async () => {
      const { id } = await crearUsuario("igual", { debeCambiarClave: true });

      await expect(
        auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_INICIAL),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(await cuerpoDelError(auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_INICIAL))).toMatchObject({
        statusCode: 400,
        message: "La nueva clave debe ser distinta de la actual",
        codigo: CODIGO_CLAVE_INVALIDA,
      });

      const fila = await prisma.usuario.findUniqueOrThrow({ where: { id } });
      expect(fila.debeCambiarClave).toBe(true);
    });

    it("rechaza con 400 una clave nueva prohibida (sin distinguir mayusculas) o con el correo", async () => {
      const { id, email } = await crearUsuario("regla", { debeCambiarClave: true });
      const parteLocal = email.split("@")[0] ?? "";

      await expect(auth.cambiarClave(id, CLAVE_INICIAL, "ADMIN1234")).rejects.toThrow(
        "La nueva clave es demasiado comun o ya fue publicada; elige otra",
      );
      await expect(
        auth.cambiarClave(id, CLAVE_INICIAL, `x${parteLocal.toUpperCase()}!`),
      ).rejects.toThrow("La clave no debe contener el usuario del correo");
      expect(await cuerpoDelError(auth.cambiarClave(id, CLAVE_INICIAL, "ADMIN1234"))).toMatchObject({
        statusCode: 400,
        codigo: CODIGO_CLAVE_INVALIDA,
      });
      expect(await trazasCambio(id)).toBe(0);
    });

    it("rechaza con 400 una clave actual de mas de 72 bytes (bcrypt la truncaria)", async () => {
      const { id } = await crearUsuario("larga", { debeCambiarClave: true });

      await expect(
        auth.cambiarClave(id, `${CLAVE_INICIAL}${"ñ".repeat(30)}`, CLAVE_NUEVA),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("un usuario inactivo no puede cambiar la clave", async () => {
      const { id } = await crearUsuario("inactivo", { debeCambiarClave: true, activo: false });

      await expect(
        auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_NUEVA),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(await trazasCambio(id)).toBe(0);
    });
  });

  describe("invalidacion de sesiones", () => {
    it("tras el cambio, un access token previo se rechaza con 401 y el nuevo funciona", async () => {
      const { id, email } = await crearUsuario("access", { debeCambiarClave: true });
      const previa = await auth.login(email, CLAVE_INICIAL);
      await expect(activar(previa.token, "exento")).resolves.toBe(true);

      const nueva = await auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_NUEVA);

      // El token restringido NO queda desbloqueado al limpiar la marca.
      await expect(activar(previa.token, "normal")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(activar(previa.token, "exento")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(activar(nueva.token, "normal")).resolves.toBe(true);
    });

    it("un access token sin claim `ver` se rechaza con 401", async () => {
      const { id } = await crearUsuario("sin-ver", { debeCambiarClave: false });
      const tokenAntiguo = await jwt.signAsync({
        sub: id.toString(),
        empresaId: empresaId.toString(),
        email: "x",
      });

      await expect(activar(tokenAntiguo, "normal")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("tras el cambio, un refresh previo da 401 y NO invalida la sesion nueva", async () => {
      const { id, email } = await crearUsuario("refresh-viejo", { debeCambiarClave: true });
      // Otro dispositivo con su propia sesion.
      const otroDispositivo = await auth.login(email, CLAVE_INICIAL);

      const nueva = await auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_NUEVA);
      const versionTrasCambio = await versionDe(id);

      await expect(auth.refrescar(otroDispositivo.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      // La sesion emitida por el cambio sigue intacta.
      expect(await versionDe(id)).toBe(versionTrasCambio);
      await expect(activar(nueva.token, "normal")).resolves.toBe(true);
      const renovada = await auth.refrescar(nueva.refreshToken);
      expect(renovada.usuario.debeCambiarClave).toBe(false);
    });

    it("un refresh ya rotado presentado de nuevo revoca toda la cadena y la version", async () => {
      const { id, email } = await crearUsuario("reuso", { debeCambiarClave: false });
      const inicial = await auth.login(email, CLAVE_INICIAL);
      const rotada = await auth.refrescar(inicial.refreshToken);
      await expect(activar(rotada.accessToken, "normal")).resolves.toBe(true);

      // Reuso del token ya rotado: posible robo.
      await expect(auth.refrescar(inicial.refreshToken)).rejects.toThrow();

      expect(await refreshActivos(id)).toBe(0);
      await expect(auth.refrescar(rotada.refreshToken)).rejects.toThrow();
      await expect(activar(rotada.accessToken, "normal")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("logout", () => {
    it("un refresh revocado por logout da 401 al presentarse y no afecta otras sesiones", async () => {
      const { id, email } = await crearUsuario("logout", { debeCambiarClave: false });
      const cerrada = await auth.login(email, CLAVE_INICIAL);
      const otra = await auth.login(email, CLAVE_INICIAL);
      const versionPrevia = await versionDe(id);

      await auth.revocar(cerrada.refreshToken);
      await expect(auth.refrescar(cerrada.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );

      expect(await versionDe(id)).toBe(versionPrevia);
      await expect(activar(otra.token, "normal")).resolves.toBe(true);
      await expect(auth.refrescar(otra.refreshToken)).resolves.toBeDefined();
    });

    it("logout de un token ya rotado revoca tambien a su sucesor", async () => {
      const { id, email } = await crearUsuario("logout-rotado", { debeCambiarClave: false });
      const inicial = await auth.login(email, CLAVE_INICIAL);
      await auth.refrescar(inicial.refreshToken);

      await auth.revocar(inicial.refreshToken);

      expect(await refreshActivos(id)).toBe(0);
    });
  });

  describe("concurrencia", () => {
    it("refresh concurrente con una revocacion nunca deja un refresh token vivo", async () => {
      const { id, email } = await crearUsuario("carrera", { debeCambiarClave: false });

      for (let intento = 0; intento < 5; intento++) {
        const sesion = await auth.login(email, CLAVE_INICIAL);
        const [refresco] = await Promise.allSettled([
          auth.refrescar(sesion.refreshToken),
          auth.revocarSesionesUsuario(id),
        ]);
        // Sea cual sea el orden, la revocacion gana: no queda sesion activa
        // y el access emitido por el refresh (si lo hubo) ya no sirve.
        expect(await refreshActivos(id)).toBe(0);
        if (refresco.status === "fulfilled") {
          await expect(activar(refresco.value.accessToken, "normal")).rejects.toBeInstanceOf(
            UnauthorizedException,
          );
        }
      }
    });

    it("logout concurrente con un refresh del mismo token no deja la cadena viva", async () => {
      const { email } = await crearUsuario("logout-carrera", { debeCambiarClave: false });

      for (let intento = 0; intento < 5; intento++) {
        const sesion = await auth.login(email, CLAVE_INICIAL);
        const [refresco] = await Promise.allSettled([
          auth.refrescar(sesion.refreshToken),
          auth.revocar(sesion.refreshToken),
        ]);

        const cerrado = await prisma.tokenRefresh.findUniqueOrThrow({
          where: { id: await idDeRefresh(sesion.refreshToken) },
        });
        expect(cerrado.revocadoEn).not.toBeNull();
        // Solo queda marcado como rotado si el refresh gano el bloqueo ANTES
        // del logout (orden legitimo); nunca por pisar un logout ya hecho.
        expect(cerrado.reemplazadoPorId !== null).toBe(refresco.status === "fulfilled");
        expect(await activosEnCadena(cerrado.id)).toBe(0);
      }
    });

    it("login con la clave vieja concurrente con un cambio nunca deja una sesion viva", async () => {
      for (let intento = 0; intento < 5; intento++) {
        const { id, email } = await crearUsuario(`login-carrera-${intento}`, {
          debeCambiarClave: true,
        });

        const [ingreso, cambio] = await Promise.allSettled([
          auth.login(email, CLAVE_INICIAL),
          auth.cambiarClave(id, CLAVE_INICIAL, CLAVE_NUEVA),
        ]);

        expect(cambio.status).toBe("fulfilled");
        // Solo sobrevive la sesion que emitio el cambio.
        expect(await refreshActivos(id)).toBe(1);
        if (ingreso.status === "fulfilled") {
          await expect(activar(ingreso.value.token, "exento")).rejects.toBeInstanceOf(
            UnauthorizedException,
          );
          await expect(auth.refrescar(ingreso.value.refreshToken)).rejects.toThrow();
        }
      }
    });

    it("dos cambios concurrentes desde la misma clave vieja: solo uno se aplica", async () => {
      const { id, email } = await crearUsuario("doble", { debeCambiarClave: true });

      const resultados = await Promise.allSettled([
        auth.cambiarClave(id, CLAVE_INICIAL, "primera-nueva-111"),
        auth.cambiarClave(id, CLAVE_INICIAL, "segunda-nueva-222"),
      ]);

      const exitos = resultados.filter((r) => r.status === "fulfilled");
      expect(exitos).toHaveLength(1);
      expect(await trazasCambio(id)).toBe(1);
      await expect(auth.login(email, CLAVE_INICIAL)).rejects.toThrow();
    });
  });

  describe("guard", () => {
    it("con clave temporal rechaza un handler normal con 403 y codigo CLAVE_TEMPORAL", async () => {
      const { email } = await crearUsuario("guard-bloqueo", { debeCambiarClave: true });
      const { token } = await auth.login(email, CLAVE_INICIAL);

      const error: unknown = await activar(token, "normal").catch((e: unknown) => e);

      if (!(error instanceof ForbiddenException)) {
        throw new Error("Se esperaba ForbiddenException del guard");
      }
      expect(error.getResponse()).toMatchObject({
        statusCode: 403,
        codigo: CODIGO_CLAVE_TEMPORAL,
      });
    });

    it("con clave temporal permite un handler marcado con @PermitirClaveTemporal()", async () => {
      const { email } = await crearUsuario("guard-exento", { debeCambiarClave: true });
      const { token } = await auth.login(email, CLAVE_INICIAL);

      await expect(activar(token, "exento")).resolves.toBe(true);
    });

    it("sin clave temporal permite un handler normal", async () => {
      const { email } = await crearUsuario("guard-normal", { debeCambiarClave: false });
      const { token } = await auth.login(email, CLAVE_INICIAL);

      await expect(activar(token, "normal")).resolves.toBe(true);
    });

    it("solo AuthController.cambiarClave lleva la exencion (ningun otro handler ni clase)", async () => {
      const raiz = join(__dirname, "..", "src");
      const controladores = readdirSync(raiz, { recursive: true, encoding: "utf8" })
        .filter((ruta) => ruta.endsWith(".controller.ts"))
        .map((ruta) => join(raiz, ruta));
      expect(controladores.length).toBeGreaterThan(1);

      const exentos: string[] = [];
      for (const ruta of controladores) {
        const modulo: Record<string, unknown> = await import(ruta);
        for (const exportado of Object.values(modulo)) {
          if (typeof exportado !== "function") continue;
          if (reflector.get(CLAVE_PERMITIR_CLAVE_TEMPORAL, exportado) === true) {
            exentos.push(`${exportado.name} (clase)`);
          }
          const prototipo: unknown = exportado.prototype;
          if (typeof prototipo !== "object" || prototipo === null) continue;
          for (const nombre of Object.getOwnPropertyNames(prototipo)) {
            const handler: unknown = Object.getOwnPropertyDescriptor(prototipo, nombre)?.value;
            if (typeof handler !== "function" || nombre === "constructor") continue;
            if (reflector.get(CLAVE_PERMITIR_CLAVE_TEMPORAL, handler) === true) {
              exentos.push(`${exportado.name}.${nombre}`);
            }
          }
        }
      }

      expect(exentos).toEqual(["AuthController.cambiarClave"]);
    });
  });
});
