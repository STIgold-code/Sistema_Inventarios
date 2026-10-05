import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import type { PrismaService } from "../../comun/prisma/prisma.service.js";

/**
 * Reglas compartidas de la administracion de usuarios y roles (UsuariosService
 * y RolesService). Toda escritura que pueda quitarle a alguien el permiso de
 * administracion corre en {@link ejecutarMutacionAdministrativa}, que aplica
 * en una sola transaccion:
 *   1. {@link bloquearAdministracionEmpresa}
 *   2. {@link exigirAdministradorVigente} sobre el actor
 *   3. la escritura
 *   4. {@link exigirAdministradorActivo}
 *
 * Orden de bloqueos de una mutacion (siempre el mismo):
 *   a. advisory lock de administracion de la empresa;
 *   b. la fila del usuario OBJETIVO: el UPDATE y, en baja o restablecimiento,
 *      el `FOR UPDATE` de AuthService.revocarSesionesUsuario;
 *   c. el `KEY SHARE` que la FK de registro_auditoria.usuario_id toma sobre la
 *      fila del ACTOR al insertar la traza.
 * `FOR UPDATE` (b) y `KEY SHARE` (c) son incompatibles. En dos bajas cruzadas
 * (X da de baja a Y mientras Y da de baja a X) sin el bloqueo (a), cada
 * transaccion tiene la fila de su objetivo con `FOR UPDATE` y espera el
 * `KEY SHARE` sobre su actor, que es el objetivo de la otra: Postgres detecta
 * un interbloqueo (40P01) y responde 500 en vez de un rechazo limpio. El
 * bloqueo (a) serializa ambas y evita llegar a (b) y (c) en paralelo.
 */

/** Permiso que habilita administrar usuarios y roles. */
export const PERMISO_ADMINISTRAR_USUARIOS = "usuario.administrar";

/** Filtro de usuario activo de la empresa con el permiso via algun rol. */
function filtroAdministradorActivo(empresaId: bigint): Prisma.UsuarioWhereInput {
  return {
    empresaId,
    activo: true,
    roles: {
      some: {
        rol: {
          empresaId,
          permisos: { some: { permiso: { codigo: PERMISO_ADMINISTRAR_USUARIOS } } },
        },
      },
    },
  };
}

/**
 * Serializa, por empresa, las mutaciones de administracion hasta el fin de la
 * transaccion. Sin esto, dos administradores podrian quitarse el permiso
 * mutuamente en paralelo: cada transaccion veria al otro todavia activo.
 */
export async function bloquearAdministracionEmpresa(
  tx: Prisma.TransactionClient,
  empresaId: bigint,
): Promise<void> {
  const clave = `administracion-usuarios:${empresaId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
}

/** Cantidad de usuarios activos de la empresa que administran usuarios via algun rol. */
export function contarAdministradoresActivos(
  tx: Prisma.TransactionClient,
  empresaId: bigint,
): Promise<number> {
  return tx.usuario.count({ where: filtroAdministradorActivo(empresaId) });
}

/**
 * Re-verifica al ACTOR despues de tomar el bloqueo: el guard lo autorizo antes
 * de la espera, y mientras tanto otra mutacion pudo darlo de baja o quitarle
 * el permiso. En ese caso responde 403.
 */
export async function exigirAdministradorVigente(
  tx: Prisma.TransactionClient,
  empresaId: bigint,
  actorId: bigint,
): Promise<void> {
  const vigente = await tx.usuario.count({
    where: { id: actorId, ...filtroAdministradorActivo(empresaId) },
  });
  if (vigente > 0) return;
  throw new ForbiddenException("Ya no tienes permiso para administrar usuarios");
}

/**
 * Invariante: la empresa debe conservar al menos un usuario activo con el
 * permiso de administracion. Se llama DESPUES de la escritura, dentro de la
 * misma transaccion; si falla, la excepcion revierte todo.
 */
export async function exigirAdministradorActivo(
  tx: Prisma.TransactionClient,
  empresaId: bigint,
): Promise<void> {
  if ((await contarAdministradoresActivos(tx, empresaId)) > 0) return;
  throw new ConflictException(
    "La operacion dejaria a la empresa sin ningun usuario activo que pueda administrar usuarios",
  );
}

/**
 * Ejecuta una mutacion de administracion con los cuatro pasos documentados
 * arriba. Es la unica puerta de entrada: asi ningun servicio puede omitir el
 * bloqueo, la re-verificacion del actor ni la invariante.
 */
export function ejecutarMutacionAdministrativa<T>(
  prisma: PrismaService,
  actor: UsuarioRequest,
  operacion: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await bloquearAdministracionEmpresa(tx, actor.empresaId);
    await exigirAdministradorVigente(tx, actor.empresaId, actor.id);
    const resultado = await operacion(tx);
    await exigirAdministradorActivo(tx, actor.empresaId);
    return resultado;
  });
}
