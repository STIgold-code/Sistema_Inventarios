import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuthService } from "../../auth/auth.service.js";
import { excepcionClaveInvalida } from "../../auth/clave-invalida.js";
import { hashearClave, validarClaveNueva } from "../../auth/clave.js";
import { normalizarEmail } from "../../auth/email.js";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { ejecutarMutacionAdministrativa } from "./administracion-usuarios.js";

type Tx = Prisma.TransactionClient;

/** Rol asignado a un usuario, tal como lo ve la pantalla de administracion. */
export interface RolResumen {
  id: string;
  codigo: string;
  nombre: string;
}

/**
 * Usuario en la administracion. NUNCA incluye hashClave ni versionSesion: la
 * seleccion de Prisma es explicita (no se usa `include` sobre el usuario).
 */
export interface UsuarioGestion {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
  debeCambiarClave: boolean;
  creadoEn: string;
  roles: RolResumen[];
}

export interface DatosCrearUsuario {
  email: string;
  nombre: string;
  clave: string;
  rolIds: bigint[];
}

export interface DatosActualizarUsuario {
  email?: string;
  nombre?: string;
  rolIds?: bigint[];
}

const SELECCION_GESTION = {
  id: true,
  email: true,
  nombre: true,
  activo: true,
  debeCambiarClave: true,
  creadoEn: true,
  roles: { select: { rol: { select: { id: true, codigo: true, nombre: true } } } },
} satisfies Prisma.UsuarioSelect;

type FilaGestion = Prisma.UsuarioGetPayload<{ select: typeof SELECCION_GESTION }>;

/** Mensaje unico para un correo ocupado: no revela en que empresa existe. */
const MENSAJE_CORREO_OCUPADO = "El correo ya esta registrado";

const ENTIDAD = "USUARIO";

/**
 * Administracion de usuarios de la empresa del llamador. Toda mutacion corre
 * en una transaccion que toma el bloqueo de administracion de la empresa,
 * re-verifica al actor y termina verificando que quede al menos un
 * administrador activo (ver administracion-usuarios.ts).
 */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Lista los usuarios de la empresa. Por defecto solo activos. */
  async listar(empresaId: bigint, incluirInactivos = false): Promise<UsuarioGestion[]> {
    const filas = await this.prisma.usuario.findMany({
      where: { empresaId, ...(incluirInactivos ? {} : { activo: true }) },
      select: SELECCION_GESTION,
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    });
    return filas.map(aGestion);
  }

  /** Crea un usuario con clave inicial TEMPORAL (debe cambiarla al ingresar). */
  async crear(actor: UsuarioRequest, datos: DatosCrearUsuario): Promise<UsuarioGestion> {
    const email = normalizarEmail(datos.email);
    const nombre = exigirNombre(datos.nombre);
    exigirRoles(datos.rolIds);
    exigirClaveValida(datos.clave, email);
    const hashClave = await hashearClave(datos.clave);

    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const roles = await this.resolverRoles(tx, actor.empresaId, datos.rolIds);
      const creado = await conCorreoUnico(
        tx.usuario.create({
          data: {
            empresaId: actor.empresaId,
            email,
            nombre,
            hashClave,
            debeCambiarClave: true,
            roles: { create: roles.map((r) => ({ rolId: r.id })) },
          },
          select: SELECCION_GESTION,
        }),
      );
      await this.auditar(
        tx,
        actor,
        creado.id,
        "CREAR",
        `Usuario ${email} creado con roles: ${codigos(roles)}`,
      );
      return aGestion(creado);
    });
  }

  /**
   * Edita nombre, correo y/o roles. `rolIds`, si viene, reemplaza los roles
   * del usuario (al menos uno). Quitarse el propio rol de administrador esta
   * permitido mientras quede otro administrador activo.
   */
  async actualizar(
    actor: UsuarioRequest,
    usuarioId: bigint,
    datos: DatosActualizarUsuario,
  ): Promise<UsuarioGestion> {
    if (datos.email === undefined && datos.nombre === undefined && datos.rolIds === undefined) {
      throw new BadRequestException("Indica al menos un dato a modificar");
    }
    const nombre = datos.nombre === undefined ? undefined : exigirNombre(datos.nombre);
    const email = datos.email === undefined ? undefined : normalizarEmail(datos.email);
    if (datos.rolIds !== undefined) exigirRoles(datos.rolIds);

    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const actual = await this.buscar(tx, actor.empresaId, usuarioId);
      const cambios: string[] = [];
      const data: Prisma.UsuarioUpdateInput = {};

      if (nombre !== undefined && nombre !== actual.nombre) {
        data.nombre = nombre;
        cambios.push(`nombre: "${actual.nombre}" -> "${nombre}"`);
      }
      if (email !== undefined && email !== actual.email) {
        data.email = email;
        cambios.push(`correo: ${actual.email} -> ${email}`);
      }
      if (datos.rolIds !== undefined) {
        const roles = await this.resolverRoles(tx, actor.empresaId, datos.rolIds);
        const antes = actual.roles.map((ur) => ur.rol);
        if (codigos(antes) !== codigos(roles)) {
          await tx.usuarioRol.deleteMany({ where: { usuarioId } });
          await tx.usuarioRol.createMany({
            data: roles.map((r) => ({ usuarioId, rolId: r.id })),
          });
          cambios.push(`roles: ${codigos(antes)} -> ${codigos(roles)}`);
        }
      }
      if (cambios.length === 0) return aGestion(actual);

      const actualizado = await conCorreoUnico(
        tx.usuario.update({ where: { id: usuarioId }, data, select: SELECCION_GESTION }),
      );
      await this.auditar(
        tx,
        actor,
        usuarioId,
        "ACTUALIZAR",
        `Usuario ${actualizado.email}: ${cambios.join("; ")}`,
      );
      return aGestion(actualizado);
    });
  }

  /** Baja logica: el usuario ya no puede ingresar y pierde TODAS sus sesiones. */
  async darDeBaja(actor: UsuarioRequest, usuarioId: bigint): Promise<UsuarioGestion> {
    if (usuarioId === actor.id) {
      throw new BadRequestException("No puedes darte de baja a ti mismo");
    }
    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const actual = await this.buscar(tx, actor.empresaId, usuarioId);
      if (!actual.activo) throw new ConflictException("El usuario ya esta dado de baja");
      const actualizado = await tx.usuario.update({
        where: { id: usuarioId },
        data: { activo: false },
        select: SELECCION_GESTION,
      });
      await this.auth.revocarSesionesUsuario(usuarioId, tx);
      await this.auditar(
        tx,
        actor,
        usuarioId,
        "DAR_DE_BAJA",
        `Usuario ${actual.email} dado de baja`,
      );
      return aGestion(actualizado);
    });
  }

  /** Reactiva un usuario dado de baja. Vuelve a ingresar con su clave vigente. */
  async reactivar(actor: UsuarioRequest, usuarioId: bigint): Promise<UsuarioGestion> {
    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const actual = await this.buscar(tx, actor.empresaId, usuarioId);
      if (actual.activo) throw new ConflictException("El usuario ya esta activo");
      const actualizado = await tx.usuario.update({
        where: { id: usuarioId },
        data: { activo: true },
        select: SELECCION_GESTION,
      });
      await this.auditar(
        tx,
        actor,
        usuarioId,
        "REACTIVAR",
        `Usuario ${actual.email} reactivado`,
      );
      return aGestion(actualizado);
    });
  }

  /**
   * Fija una clave TEMPORAL para otro usuario (debe cambiarla al ingresar) y
   * revoca todas sus sesiones. La propia clave se cambia en /auth/cambiar-clave.
   */
  async restablecerClave(
    actor: UsuarioRequest,
    usuarioId: bigint,
    clave: string,
  ): Promise<UsuarioGestion> {
    if (usuarioId === actor.id) {
      throw new BadRequestException(
        "No puedes restablecer tu propia clave; usa la opcion para cambiar tu contraseña",
      );
    }
    // El correo del destinatario es parte de las reglas de la clave.
    const destino = await this.prisma.usuario.findFirst({
      where: { id: usuarioId, empresaId: actor.empresaId },
      select: { email: true },
    });
    if (!destino) throw new NotFoundException("Usuario no encontrado");
    exigirClaveValida(clave, destino.email);
    const hashClave = await hashearClave(clave);

    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const actual = await this.buscar(tx, actor.empresaId, usuarioId);
      if (actual.email !== destino.email) exigirClaveValida(clave, actual.email);
      const actualizado = await tx.usuario.update({
        where: { id: usuarioId },
        data: { hashClave, debeCambiarClave: true },
        select: SELECCION_GESTION,
      });
      await this.auth.revocarSesionesUsuario(usuarioId, tx);
      await this.auditar(
        tx,
        actor,
        usuarioId,
        "RESTABLECER_CLAVE",
        `Clave restablecida para el usuario ${actual.email}`,
      );
      return aGestion(actualizado);
    });
  }

  /** Usuario de la empresa o 404 (un usuario de otra empresa "no existe"). */
  private async buscar(tx: Tx, empresaId: bigint, usuarioId: bigint): Promise<FilaGestion> {
    const fila = await tx.usuario.findFirst({
      where: { id: usuarioId, empresaId },
      select: SELECCION_GESTION,
    });
    if (!fila) throw new NotFoundException("Usuario no encontrado");
    return fila;
  }

  /** Resuelve los roles pedidos; todos deben ser de la empresa (si no, 404). */
  private async resolverRoles(
    tx: Tx,
    empresaId: bigint,
    rolIds: bigint[],
  ): Promise<Array<{ id: bigint; codigo: string; nombre: string }>> {
    const unicos = [...new Set(rolIds)];
    const roles = await tx.rol.findMany({
      where: { id: { in: unicos }, empresaId },
      select: { id: true, codigo: true, nombre: true },
    });
    if (roles.length !== unicos.length) throw new NotFoundException("Rol no encontrado");
    return roles;
  }

  private auditar(
    tx: Tx,
    actor: UsuarioRequest,
    usuarioId: bigint,
    accion: string,
    detalle: string,
  ): Promise<void> {
    return this.auditoria.registrar(
      {
        empresaId: actor.empresaId,
        usuarioId: actor.id,
        accion,
        entidad: ENTIDAD,
        entidadId: usuarioId,
        detalle,
      },
      tx,
    );
  }
}

function aGestion(fila: FilaGestion): UsuarioGestion {
  return {
    id: fila.id.toString(),
    email: fila.email,
    nombre: fila.nombre,
    activo: fila.activo,
    debeCambiarClave: fila.debeCambiarClave,
    creadoEn: fila.creadoEn.toISOString(),
    roles: fila.roles
      .map((ur) => ({ id: ur.rol.id.toString(), codigo: ur.rol.codigo, nombre: ur.rol.nombre }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  };
}

/**
 * Traduce la violacion de la unicidad global del correo (P2002 sobre `email`)
 * al conflicto neutral. La BD es la duena de la regla: cubre cualquier
 * escritor y la carrera entre dos altas concurrentes.
 */
async function conCorreoUnico<T>(escritura: Promise<T>): Promise<T> {
  try {
    return await escritura;
  } catch (error) {
    if (esCorreoDuplicado(error)) throw new ConflictException(MENSAJE_CORREO_OCUPADO);
    throw error;
  }
}

function esCorreoDuplicado(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  const objetivo: unknown = error.meta?.target;
  if (Array.isArray(objetivo)) return objetivo.includes("email");
  return typeof objetivo === "string" && objetivo.includes("email");
}

/** Codigos de rol ordenados y separados por coma (para auditoria y comparacion). */
function codigos(roles: ReadonlyArray<{ codigo: string }>): string {
  const lista = roles.map((r) => r.codigo).sort();
  return lista.length > 0 ? lista.join(", ") : "(ninguno)";
}

function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) throw new BadRequestException("Ingresa el nombre");
  return limpio;
}

function exigirRoles(rolIds: bigint[]): void {
  if (rolIds.length === 0) throw new BadRequestException("Asigna al menos un rol");
}

function exigirClaveValida(clave: string, email: string): void {
  const error = validarClaveNueva(clave, email);
  if (error) throw excepcionClaveInvalida(error);
}
