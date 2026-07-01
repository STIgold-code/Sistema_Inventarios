import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { AuthService } from "../src/auth/auth.service.js";

/**
 * Renovacion silenciosa (refresh token con rotacion). Verifica la emision del
 * par, la rotacion feliz, el rechazo de tokens revocados/expirados y la
 * deteccion de reuso que revoca toda la cadena de sesiones del usuario.
 */
describe("Renovacion de sesion con refresh token (integracion)", () => {
  const prisma = new PrismaService();
  const jwt = new JwtService({
    secret: "clave-jwt-test",
    signOptions: { expiresIn: "1h" },
  });
  const auth = new AuthService(prisma, jwt, new ConfigService());

  let empresaId: bigint;
  let usuarioId: bigint;
  const RUN = Date.now().toString().slice(-9);
  const CLAVE = "secreto-super-seguro";

  function hashDe(plano: string): string {
    return createHash("sha256").update(plano).digest("hex");
  }

  /** Inserta un refresh directamente y devuelve su token plano. */
  async function sembrarRefresh(opciones?: {
    expiraEn?: Date;
    revocadoEn?: Date;
  }): Promise<{ plano: string; id: bigint }> {
    const plano = randomBytes(32).toString("hex");
    const fila = await prisma.tokenRefresh.create({
      data: {
        usuarioId,
        empresaId,
        tokenHash: hashDe(plano),
        expiraEn: opciones?.expiraEn ?? new Date(Date.now() + 86_400_000),
        revocadoEn: opciones?.revocadoEn ?? null,
      },
    });
    return { plano, id: fila.id };
  }

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    empresaId = empresa.id;
    const usuario = await prisma.usuario.create({
      data: {
        empresaId,
        email: `refresh-${RUN}@bmingenieros.pe`,
        hashClave: await bcrypt.hash(CLAVE, 10),
        nombre: "Usuario Refresh Test",
      },
    });
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    await prisma.tokenRefresh.deleteMany({ where: { usuarioId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  it("login emite el par y persiste solo el hash del refresh (nunca el plano)", async () => {
    const resultado = await auth.login(
      `refresh-${RUN}@bmingenieros.pe`,
      CLAVE,
    );

    expect(resultado.token).toEqual(expect.any(String));
    expect(resultado.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(resultado.usuario.id).toBe(usuarioId.toString());

    const fila = await prisma.tokenRefresh.findUnique({
      where: { tokenHash: hashDe(resultado.refreshToken) },
    });
    expect(fila).not.toBeNull();
    expect(fila?.revocadoEn).toBeNull();
    // El token plano jamas se guarda: no existe fila cuyo hash sea el plano.
    const filaPlano = await prisma.tokenRefresh.findUnique({
      where: { tokenHash: resultado.refreshToken },
    });
    expect(filaPlano).toBeNull();
  });

  it("refresh feliz rota el token: revoca el actual y encadena el nuevo", async () => {
    const { plano, id } = await sembrarRefresh();

    const renovado = await auth.refrescar(plano);
    expect(renovado.accessToken).toEqual(expect.any(String));
    expect(renovado.refreshToken).toMatch(/^[a-f0-9]{64}$/);
    expect(renovado.refreshToken).not.toBe(plano);
    expect(renovado.usuario.id).toBe(usuarioId.toString());

    const anterior = await prisma.tokenRefresh.findUniqueOrThrow({
      where: { id },
    });
    expect(anterior.revocadoEn).not.toBeNull();
    expect(anterior.reemplazadoPorId).not.toBeNull();

    const nuevo = await prisma.tokenRefresh.findUniqueOrThrow({
      where: { tokenHash: hashDe(renovado.refreshToken) },
    });
    expect(nuevo.id).toBe(anterior.reemplazadoPorId);
    expect(nuevo.revocadoEn).toBeNull();
  });

  it("refresh con token ya revocado rechaza con Unauthorized", async () => {
    const { plano } = await sembrarRefresh({ revocadoEn: new Date() });
    await expect(auth.refrescar(plano)).rejects.toThrow();
  });

  it("refresh con token expirado rechaza con Unauthorized", async () => {
    const { plano } = await sembrarRefresh({
      expiraEn: new Date(Date.now() - 1_000),
    });
    await expect(auth.refrescar(plano)).rejects.toThrow();
  });

  it("detecta reuso de un token revocado y revoca toda la cadena", async () => {
    const { plano } = await sembrarRefresh();

    // Rotacion legitima: el token se revoca y nace uno nuevo activo.
    const renovado = await auth.refrescar(plano);
    const hashNuevo = hashDe(renovado.refreshToken);
    const nuevoActivo = await prisma.tokenRefresh.findUniqueOrThrow({
      where: { tokenHash: hashNuevo },
    });
    expect(nuevoActivo.revocadoEn).toBeNull();

    // Reuso del token viejo (ya revocado): debe fallar y disparar la defensa.
    await expect(auth.refrescar(plano)).rejects.toThrow();

    // La cadena entera queda revocada: el token nuevo tambien.
    const nuevoTrasReuso = await prisma.tokenRefresh.findUniqueOrThrow({
      where: { tokenHash: hashNuevo },
    });
    expect(nuevoTrasReuso.revocadoEn).not.toBeNull();

    // Y el token nuevo ya no sirve para refrescar.
    await expect(auth.refrescar(renovado.refreshToken)).rejects.toThrow();
  });
});
