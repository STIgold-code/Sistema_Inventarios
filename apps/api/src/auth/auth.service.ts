import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../comun/prisma/prisma.service.js";

interface PayloadToken {
  sub: string; // usuarioId
  empresaId: string;
  email: string;
}

interface UsuarioAutenticado {
  id: string;
  empresaId: string;
  email: string;
  nombre: string;
  permisos: string[];
}

export interface ResultadoLogin {
  /** Access token JWT de vida corta. Se mantiene el nombre `token` por compatibilidad. */
  token: string;
  /** Refresh token opaco (texto plano). Solo se entrega en esta respuesta. */
  refreshToken: string;
  usuario: UsuarioAutenticado;
}

export interface ResultadoRefresco {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioAutenticado;
}

/** Cantidad de bytes aleatorios del refresh token opaco (256 bits). */
const BYTES_REFRESH = 32;

/**
 * Dias que se conserva un token ya revocado antes de purgarlo. Da una ventana
 * breve de auditoria/forense (p. ej. investigar un reuso) sin dejar crecer la
 * tabla indefinidamente.
 */
const DIAS_RETENCION_REVOCADOS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, clave: string): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { email, activo: true },
      include: {
        roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
      },
    });

    if (!usuario || !(await bcrypt.compare(clave, usuario.hashClave))) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    const permisos = this.extraerPermisos(usuario.roles);
    const datos: UsuarioAutenticado = {
      id: usuario.id.toString(),
      empresaId: usuario.empresaId.toString(),
      email: usuario.email,
      nombre: usuario.nombre,
      permisos,
    };

    const { accessToken, refreshToken } = await this.emitirPar(
      usuario.id,
      usuario.empresaId,
      usuario.email,
    );

    return { token: accessToken, refreshToken, usuario: datos };
  }

  /**
   * Renueva la sesion a partir de un refresh token opaco. Rota el token
   * (revoca el actual y emite uno nuevo encadenado). Si detecta reuso de un
   * token ya revocado, revoca toda la cadena de sesiones del usuario como
   * defensa ante robo de token.
   */
  async refrescar(refreshTokenPlano: string): Promise<ResultadoRefresco> {
    const hash = this.hashToken(refreshTokenPlano);
    const registro = await this.prisma.tokenRefresh.findUnique({
      where: { tokenHash: hash },
    });

    if (!registro) {
      throw new UnauthorizedException("Sesion invalida");
    }

    // Reuso: un token ya revocado se vuelve a presentar. Revoca toda la cadena
    // activa del usuario (posible robo del refresh token).
    if (registro.revocadoEn !== null) {
      await this.revocarSesionesUsuario(registro.usuarioId);
      throw new UnauthorizedException("Sesion invalida");
    }

    if (registro.expiraEn.getTime() <= Date.now()) {
      throw new UnauthorizedException("Sesion expirada");
    }

    const usuario = await this.prisma.usuario.findFirst({
      where: { id: registro.usuarioId, activo: true },
      include: {
        roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
      },
    });
    if (!usuario) {
      throw new UnauthorizedException("Usuario no valido");
    }

    // Rotacion atomica: la revocacion del token actual es la GUARDA de
    // concurrencia. Se marca revocado condicionando a que siga activo; si otra
    // peticion concurrente ya lo roto (count === 0), es reuso/carrera: se revoca
    // toda la cadena activa del usuario y se rechaza. Solo el ganador emite el
    // par nuevo, garantizando un unico uso por token.
    const { accessToken, refreshToken } = await this.prisma.$transaction(
      async (tx) => {
        const revocado = await tx.tokenRefresh.updateMany({
          where: { id: registro.id, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
        if (revocado.count === 0) {
          await tx.tokenRefresh.updateMany({
            where: { usuarioId: registro.usuarioId, revocadoEn: null },
            data: { revocadoEn: new Date() },
          });
          throw new UnauthorizedException("Sesion invalida");
        }
        const par = await this.emitirPar(
          usuario.id,
          usuario.empresaId,
          usuario.email,
          tx,
        );
        await tx.tokenRefresh.update({
          where: { id: registro.id },
          data: { reemplazadoPorId: par.idRefresh },
        });
        return { accessToken: par.accessToken, refreshToken: par.refreshToken };
      },
    );

    return {
      accessToken,
      refreshToken,
      usuario: {
        id: usuario.id.toString(),
        empresaId: usuario.empresaId.toString(),
        email: usuario.email,
        nombre: usuario.nombre,
        permisos: this.extraerPermisos(usuario.roles),
      },
    };
  }

  /** Revoca un refresh token (logout). No falla si el token no existe. */
  async revocar(refreshTokenPlano: string): Promise<void> {
    const hash = this.hashToken(refreshTokenPlano);
    await this.prisma.tokenRefresh.updateMany({
      where: { tokenHash: hash, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }

  /**
   * Purga tokens de refresh que ya no aportan valor: los expirados y los
   * revocados hace mas de {@link DIAS_RETENCION_REVOCADOS} dias. Evita que la
   * tabla crezca sin techo. La self-FK reemplazadoPorId es ON DELETE SET NULL,
   * asi que borrar registros encadenados no rompe la integridad referencial.
   * Devuelve la cantidad de filas eliminadas.
   */
  async purgarTokensObsoletos(): Promise<number> {
    const ahora = new Date();
    const limiteRevocados = new Date(
      ahora.getTime() - DIAS_RETENCION_REVOCADOS * 24 * 60 * 60 * 1000,
    );
    // Nota: `lt` sobre revocadoEn ya excluye los NULL (una comparacion contra
    // NULL nunca es verdadera), de modo que los tokens activos no se tocan.
    const { count } = await this.prisma.tokenRefresh.deleteMany({
      where: {
        OR: [
          { expiraEn: { lt: ahora } },
          { revocadoEn: { lt: limiteRevocados } },
        ],
      },
    });
    return count;
  }

  /** Carga el usuario y sus permisos a partir del id del token. */
  async cargarUsuario(usuarioId: bigint): Promise<{
    id: bigint;
    empresaId: bigint;
    email: string;
    nombre: string;
    permisos: string[];
  }> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, activo: true },
      include: {
        roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
      },
    });
    if (!usuario) {
      throw new UnauthorizedException("Usuario no valido");
    }
    return {
      id: usuario.id,
      empresaId: usuario.empresaId,
      email: usuario.email,
      nombre: usuario.nombre,
      permisos: this.extraerPermisos(usuario.roles),
    };
  }

  /**
   * Emite un par access (JWT corto) + refresh (opaco). Persiste el hash del
   * refresh y devuelve el token PLANO (unica vez que se conoce). Acepta un
   * cliente transaccional opcional para encadenar con la rotacion.
   */
  private async emitirPar(
    usuarioId: bigint,
    empresaId: bigint,
    email: string,
    tx?: Prisma.TransactionClient,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idRefresh: bigint;
  }> {
    const payload: PayloadToken = {
      sub: usuarioId.toString(),
      empresaId: empresaId.toString(),
      email,
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(BYTES_REFRESH).toString("hex");
    const tokenHash = this.hashToken(refreshToken);
    const expiraEn = new Date(Date.now() + this.diasRefresh() * 24 * 60 * 60 * 1000);

    const cliente = tx ?? this.prisma;
    const creado = await cliente.tokenRefresh.create({
      data: { usuarioId, empresaId, tokenHash, expiraEn },
    });

    return { accessToken, refreshToken, idRefresh: creado.id };
  }

  /** Revoca todos los refresh tokens activos de un usuario (defensa por reuso). */
  private async revocarSesionesUsuario(usuarioId: bigint): Promise<void> {
    await this.prisma.tokenRefresh.updateMany({
      where: { usuarioId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }

  /** SHA-256 del token opaco. Nunca se persiste ni se loguea el token plano. */
  private hashToken(tokenPlano: string): string {
    return createHash("sha256").update(tokenPlano).digest("hex");
  }

  private diasRefresh(): number {
    const bruto = this.config.get<string>("JWT_REFRESH_DIAS");
    const dias = bruto ? Number.parseInt(bruto, 10) : 30;
    return Number.isFinite(dias) && dias > 0 ? dias : 30;
  }

  private extraerPermisos(
    roles: Array<{ rol: { permisos: Array<{ permiso: { codigo: string } }> } }>,
  ): string[] {
    const codigos = new Set<string>();
    for (const ur of roles) {
      for (const rp of ur.rol.permisos) {
        codigos.add(rp.permiso.codigo);
      }
    }
    return [...codigos];
  }
}
