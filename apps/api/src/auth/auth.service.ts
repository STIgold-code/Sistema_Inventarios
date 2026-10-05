import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import type { UsuarioRequest } from "../comun/contexto/usuario-request.js";
import { PrismaService } from "../comun/prisma/prisma.service.js";
import { AuditoriaService } from "../modulos/auditoria/auditoria.service.js";
import {
  excedeLargoClave,
  hashearClave,
  validarClaveNueva,
  verificarClave,
} from "./clave.js";
import { excepcionClaveInvalida } from "./clave-invalida.js";
import { normalizarEmail } from "./email.js";

/** Payload del access token. `ver` es la version de sesion del usuario. */
export interface PayloadToken {
  sub: string; // usuarioId
  empresaId: string;
  email: string;
  ver: number;
}

interface UsuarioAutenticado {
  id: string;
  empresaId: string;
  email: string;
  nombre: string;
  permisos: string[];
  /** true mientras la clave vigente sea temporal; la API solo permite cambiarla. */
  debeCambiarClave: boolean;
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

/** Datos minimos para firmar un par de tokens. */
interface DatosEmision {
  id: bigint;
  empresaId: bigint;
  email: string;
  versionSesion: number;
}

/** Fila del usuario leida bajo bloqueo (FOR UPDATE). */
interface UsuarioBloqueado {
  activo: boolean;
  hashClave: string;
  versionSesion: number;
}

/**
 * Resultado de la rotacion dentro de la transaccion. Los rechazos se DEVUELVEN
 * (no se lanzan) para que la transaccion haga commit: asi la revocacion de la
 * cadena por reuso persiste aunque la peticion termine en 401.
 */
type ResultadoRotacion =
  | {
      tipo: "rotado";
      accessToken: string;
      refreshToken: string;
      usuario: UsuarioConPermisos;
    }
  | { tipo: "rechazado"; mensaje: string };

/** Cantidad de bytes aleatorios del refresh token opaco (256 bits). */
const BYTES_REFRESH = 32;

/**
 * Dias que se conserva un token ya revocado antes de purgarlo. Da una ventana
 * breve de auditoria/forense (p. ej. investigar un reuso) sin dejar crecer la
 * tabla indefinidamente.
 */
const DIAS_RETENCION_REVOCADOS = 7;

/** Relaciones necesarias para resolver los permisos efectivos de un usuario. */
const INCLUIR_PERMISOS = {
  roles: { include: { rol: { include: { permisos: { include: { permiso: true } } } } } },
} satisfies Prisma.UsuarioInclude;

type UsuarioConPermisos = Prisma.UsuarioGetPayload<{ include: typeof INCLUIR_PERMISOS }>;

/**
 * Concurrencia: toda operacion que emite o revoca sesiones de un usuario
 * (login, refresh, cambio de clave, revocacion) bloquea primero su fila de
 * `usuario` (FOR UPDATE) y lee la version de sesion DESPUES del bloqueo. Asi
 * una emision no puede intercalarse con una revocacion y dejar un refresh
 * token vivo o un access token firmado con una version ya invalidada.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * El correo se compara en su forma canonica (la que se persiste): el usuario
   * puede escribirlo con mayusculas o espacios. Es unico en todas las empresas.
   */
  async login(email: string, clave: string): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { email: normalizarEmail(email) },
      include: INCLUIR_PERMISOS,
    });

    if (!usuario?.activo || !(await verificarClave(clave, usuario.hashClave))) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    const par = await this.prisma.$transaction(async (tx) => {
      const vigente = await this.bloquearUsuario(usuario.id, tx);
      // La clave pudo cambiar (o el usuario darse de baja) entre la
      // verificacion y el bloqueo: se exige que siga siendo la misma.
      if (!vigente?.activo || vigente.hashClave !== usuario.hashClave) {
        throw new UnauthorizedException("Credenciales invalidas");
      }
      return this.emitirPar({ ...usuario, versionSesion: vigente.versionSesion }, tx);
    });

    return {
      token: par.accessToken,
      refreshToken: par.refreshToken,
      usuario: this.aUsuarioAutenticado(usuario),
    };
  }

  /**
   * Renueva la sesion a partir de un refresh token opaco. Rota el token
   * (revoca el actual y emite uno nuevo encadenado). Si se presenta un token
   * que YA FUE ROTADO (reemplazadoPorId != null), es reuso: posible robo, se
   * revocan todas las sesiones del usuario. Un token revocado por logout o
   * por cambio de clave solo se rechaza, sin tocar las demas sesiones.
   */
  async refrescar(refreshTokenPlano: string): Promise<ResultadoRefresco> {
    const hash = this.hashToken(refreshTokenPlano);
    const previo = await this.prisma.tokenRefresh.findUnique({
      where: { tokenHash: hash },
      select: { usuarioId: true },
    });
    if (!previo) {
      throw new UnauthorizedException("Sesion invalida");
    }

    const resultado = await this.prisma.$transaction(
      (tx): Promise<ResultadoRotacion> => this.rotarBajoBloqueo(previo.usuarioId, hash, tx),
    );
    if (resultado.tipo === "rechazado") {
      throw new UnauthorizedException(resultado.mensaje);
    }

    return {
      accessToken: resultado.accessToken,
      refreshToken: resultado.refreshToken,
      usuario: this.aUsuarioAutenticado(resultado.usuario),
    };
  }

  /**
   * Cambio de clave por su titular. Valida las reglas de la clave nueva,
   * verifica la actual BAJO BLOQUEO de la fila (dos cambios concurrentes no
   * pueden validarse contra la misma clave vieja), limpia la marca de clave
   * temporal, revoca todas las sesiones (refresh + version de access) y
   * devuelve una sesion nueva. Todo, incluida la auditoria, es atomico.
   *
   * Los errores de validacion son 400 (no 401): un 401 haria que el cliente
   * intente renovar la sesion y termine forzando un reingreso.
   */
  async cambiarClave(
    usuarioId: bigint,
    claveActual: string,
    claveNueva: string,
  ): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, activo: true },
      include: INCLUIR_PERMISOS,
    });
    if (!usuario) {
      throw new UnauthorizedException("Usuario no valido");
    }
    // Una clave actual de mas de 72 bytes nunca pudo fijarse completa: bcrypt
    // solo compararia su prefijo truncado.
    if (excedeLargoClave(claveActual)) {
      throw new BadRequestException("La clave actual es incorrecta");
    }
    const errorRegla = validarClaveNueva(claveNueva, usuario.email);
    if (errorRegla) {
      throw excepcionClaveInvalida(errorRegla);
    }
    if (claveNueva === claveActual) {
      throw excepcionClaveInvalida("La nueva clave debe ser distinta de la actual");
    }

    const hashClave = await hashearClave(claveNueva);
    const par = await this.prisma.$transaction(async (tx) => {
      const vigente = await this.bloquearUsuario(usuario.id, tx);
      if (!vigente?.activo) {
        throw new UnauthorizedException("Usuario no valido");
      }
      if (!(await verificarClave(claveActual, vigente.hashClave))) {
        throw new BadRequestException("La clave actual es incorrecta");
      }
      await tx.usuario.update({
        where: { id: usuario.id },
        data: { hashClave, debeCambiarClave: false },
      });
      const versionSesion = await this.revocarSesionesUsuario(usuario.id, tx);
      const emitido = await this.emitirPar({ ...usuario, versionSesion }, tx);
      await this.auditoria.registrar(
        {
          empresaId: usuario.empresaId,
          usuarioId: usuario.id,
          accion: "CAMBIAR_CLAVE",
          entidad: "USUARIO",
          entidadId: usuario.id,
          detalle: `Cambio de clave del usuario ${usuario.email}`,
        },
        tx,
      );
      return emitido;
    });

    return {
      token: par.accessToken,
      refreshToken: par.refreshToken,
      usuario: this.aUsuarioAutenticado({ ...usuario, debeCambiarClave: false }),
    };
  }

  /**
   * Logout: revoca el refresh token entregado y los que descienden de el por
   * rotacion (la misma sesion del dispositivo). Si un refresh concurrente del
   * mismo token gano el bloqueo y lo roto, su sucesor tambien muere: no queda
   * una sesion huerfana viva. Toma el mismo bloqueo de fila que la rotacion.
   * No falla si el token no existe.
   */
  async revocar(refreshTokenPlano: string): Promise<void> {
    const hash = this.hashToken(refreshTokenPlano);
    const previo = await this.prisma.tokenRefresh.findUnique({
      where: { tokenHash: hash },
      select: { usuarioId: true },
    });
    if (!previo) return;
    await this.prisma.$transaction(async (tx) => {
      await this.bloquearUsuario(previo.usuarioId, tx);
      const ahora = new Date();
      let actual = await tx.tokenRefresh.findUnique({
        where: { tokenHash: hash },
        select: { id: true, reemplazadoPorId: true },
      });
      while (actual) {
        await tx.tokenRefresh.updateMany({
          where: { id: actual.id, revocadoEn: null },
          data: { revocadoEn: ahora },
        });
        if (actual.reemplazadoPorId === null) return;
        actual = await tx.tokenRefresh.findUnique({
          where: { id: actual.reemplazadoPorId },
          select: { id: true, reemplazadoPorId: true },
        });
      }
    });
  }

  /**
   * Revoca TODAS las sesiones de un usuario: incrementa su version de sesion
   * (invalida los access tokens ya emitidos) y revoca sus refresh tokens
   * activos. Bloquea la fila del usuario. Sin `tx` abre su propia
   * transaccion. Devuelve la nueva version, con la que debe firmarse
   * cualquier par emitido en la misma transaccion.
   */
  async revocarSesionesUsuario(
    usuarioId: bigint,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    if (!tx) {
      return this.prisma.$transaction((propia) =>
        this.revocarSesionesUsuario(usuarioId, propia),
      );
    }
    await this.bloquearUsuario(usuarioId, tx);
    const { versionSesion } = await tx.usuario.update({
      where: { id: usuarioId },
      data: { versionSesion: { increment: 1 } },
      select: { versionSesion: true },
    });
    await tx.tokenRefresh.updateMany({
      where: { usuarioId, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    return versionSesion;
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

  /**
   * Carga el usuario y sus permisos a partir del token. Rechaza (401) si la
   * version de sesion del token no es la vigente, incluido un token sin `ver`
   * (emitido antes de existir la version): el cliente renueva en silencio.
   */
  async cargarUsuario(
    usuarioId: bigint,
    versionToken: number | undefined,
  ): Promise<UsuarioRequest> {
    const usuario = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, activo: true },
      include: INCLUIR_PERMISOS,
    });
    if (!usuario) {
      throw new UnauthorizedException("Usuario no valido");
    }
    if (usuario.versionSesion !== versionToken) {
      throw new UnauthorizedException("Sesion revocada");
    }
    return {
      id: usuario.id,
      empresaId: usuario.empresaId,
      email: usuario.email,
      nombre: usuario.nombre,
      permisos: this.extraerPermisos(usuario.roles),
      debeCambiarClave: usuario.debeCambiarClave,
    };
  }

  /** Cuerpo transaccional de {@link refrescar}, ejecutado con la fila del usuario bloqueada. */
  private async rotarBajoBloqueo(
    usuarioId: bigint,
    tokenHash: string,
    tx: Prisma.TransactionClient,
  ): Promise<ResultadoRotacion> {
    await this.bloquearUsuario(usuarioId, tx);
    // Se relee bajo el bloqueo: una revocacion concurrente ya habra commiteado.
    const registro = await tx.tokenRefresh.findUnique({ where: { tokenHash } });
    if (!registro) {
      return { tipo: "rechazado", mensaje: "Sesion invalida" };
    }
    if (registro.revocadoEn !== null) {
      if (registro.reemplazadoPorId !== null) {
        await this.revocarSesionesUsuario(registro.usuarioId, tx);
      }
      return { tipo: "rechazado", mensaje: "Sesion invalida" };
    }
    if (registro.expiraEn.getTime() <= Date.now()) {
      return { tipo: "rechazado", mensaje: "Sesion expirada" };
    }

    const usuario = await tx.usuario.findFirst({
      where: { id: registro.usuarioId, activo: true },
      include: INCLUIR_PERMISOS,
    });
    if (!usuario) {
      return { tipo: "rechazado", mensaje: "Usuario no valido" };
    }

    // Revocacion CONDICIONADA a que siga activo: si algo lo revoco despues de
    // leerlo (p. ej. un logout que no tomara el bloqueo), no se sobrescribe ni
    // se emite un par nuevo. Defensa en profundidad sobre el bloqueo de fila.
    const revocado = await tx.tokenRefresh.updateMany({
      where: { id: registro.id, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    if (revocado.count === 0) {
      return { tipo: "rechazado", mensaje: "Sesion invalida" };
    }
    const par = await this.emitirPar(usuario, tx);
    await tx.tokenRefresh.update({
      where: { id: registro.id },
      data: { reemplazadoPorId: par.idRefresh },
    });
    return {
      tipo: "rotado",
      accessToken: par.accessToken,
      refreshToken: par.refreshToken,
      usuario,
    };
  }

  /**
   * Bloquea la fila del usuario hasta el fin de la transaccion y devuelve los
   * datos de sesion leidos despues del bloqueo (null si no existe).
   */
  private async bloquearUsuario(
    usuarioId: bigint,
    tx: Prisma.TransactionClient,
  ): Promise<UsuarioBloqueado | null> {
    await tx.$queryRaw`SELECT 1 FROM usuario WHERE id = ${usuarioId} FOR UPDATE`;
    return tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { activo: true, hashClave: true, versionSesion: true },
    });
  }

  /**
   * Emite un par access (JWT corto, con la version de sesion) + refresh
   * (opaco). Persiste el hash del refresh y devuelve el token PLANO (unica vez
   * que se conoce). Debe llamarse dentro de la transaccion que bloqueo la fila
   * del usuario.
   */
  private async emitirPar(
    usuario: DatosEmision,
    tx: Prisma.TransactionClient,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    idRefresh: bigint;
  }> {
    const payload: PayloadToken = {
      sub: usuario.id.toString(),
      empresaId: usuario.empresaId.toString(),
      email: usuario.email,
      ver: usuario.versionSesion,
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(BYTES_REFRESH).toString("hex");
    const tokenHash = this.hashToken(refreshToken);
    const expiraEn = new Date(Date.now() + this.diasRefresh() * 24 * 60 * 60 * 1000);

    const creado = await tx.tokenRefresh.create({
      data: { usuarioId: usuario.id, empresaId: usuario.empresaId, tokenHash, expiraEn },
    });

    return { accessToken, refreshToken, idRefresh: creado.id };
  }

  /** Proyecta el usuario de BD al shape que se entrega al cliente. */
  private aUsuarioAutenticado(usuario: UsuarioConPermisos): UsuarioAutenticado {
    return {
      id: usuario.id.toString(),
      empresaId: usuario.empresaId.toString(),
      email: usuario.email,
      nombre: usuario.nombre,
      permisos: this.extraerPermisos(usuario.roles),
      debeCambiarClave: usuario.debeCambiarClave,
    };
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
