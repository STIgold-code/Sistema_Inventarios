import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { AuthService } from "../src/auth/auth.service.js";

/**
 * Purga de tokens de refresh obsoletos. Verifica que purgarTokensObsoletos
 * elimine los expirados y los revocados hace mas de 7 dias, conservando los
 * vigentes.
 */
describe("Purga de tokens de refresh obsoletos (integracion)", () => {
  const prisma = new PrismaService();
  const jwt = new JwtService({
    secret: "clave-jwt-test",
    signOptions: { expiresIn: "1h" },
  });
  const auth = new AuthService(prisma, jwt, new ConfigService());

  let empresaId: bigint;
  let usuarioId: bigint;
  const RUN = Date.now().toString().slice(-9);
  const DIA_MS = 24 * 60 * 60 * 1000;

  function hashDe(plano: string): string {
    return createHash("sha256").update(plano).digest("hex");
  }

  /** Inserta un refresh directamente y devuelve su token hash. */
  async function sembrarRefresh(opciones?: {
    expiraEn?: Date;
    revocadoEn?: Date;
  }): Promise<{ hash: string; id: bigint }> {
    const hash = hashDe(randomBytes(32).toString("hex"));
    const fila = await prisma.tokenRefresh.create({
      data: {
        usuarioId,
        empresaId,
        tokenHash: hash,
        expiraEn: opciones?.expiraEn ?? new Date(Date.now() + DIA_MS),
        revocadoEn: opciones?.revocadoEn ?? null,
      },
    });
    return { hash, id: fila.id };
  }

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    empresaId = empresa.id;
    const usuario = await prisma.usuario.create({
      data: {
        empresaId,
        email: `purga-${RUN}@bmingenieros.pe`,
        hashClave: await bcrypt.hash("secreto-super-seguro", 10),
        nombre: "Usuario Purga Test",
      },
    });
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    await prisma.tokenRefresh.deleteMany({ where: { usuarioId } });
    await prisma.usuario.delete({ where: { id: usuarioId } });
    await prisma.$disconnect();
  });

  it("elimina expirados y revocados antiguos, conserva el vigente", async () => {
    const vigente = await sembrarRefresh();
    const expirado = await sembrarRefresh({
      expiraEn: new Date(Date.now() - 1_000),
    });
    const revocadoAntiguo = await sembrarRefresh({
      revocadoEn: new Date(Date.now() - 10 * DIA_MS),
    });

    const borrados = await auth.purgarTokensObsoletos();
    expect(borrados).toBeGreaterThanOrEqual(2);

    const restantes = await prisma.tokenRefresh.findMany({
      where: { usuarioId },
    });
    const idsRestantes = restantes.map((t) => t.id);

    expect(idsRestantes).toContain(vigente.id);
    expect(idsRestantes).not.toContain(expirado.id);
    expect(idsRestantes).not.toContain(revocadoAntiguo.id);
  });
});
