import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { UsuarioRequest } from "../../comun/contexto/usuario-request.js";
import { PrismaService } from "../../comun/prisma/prisma.service.js";
import { AuditoriaService } from "../auditoria/auditoria.service.js";
import { ejecutarMutacionAdministrativa } from "../usuarios/administracion-usuarios.js";
import { CODIGO_ROL_SISTEMA, MENSAJE_CODIGO_ROL, REGEX_CODIGO_ROL } from "./reglas-rol.js";

type Tx = Prisma.TransactionClient;

/** Permiso del catalogo global. */
export interface PermisoCatalogo {
  id: string;
  codigo: string;
  nombre: string;
}

/** Rol de la empresa, tal como lo ve la pantalla de administracion. */
export interface RolGestion {
  id: string;
  codigo: string;
  nombre: string;
  /** true para el rol del sistema (ADMIN): no se edita ni se elimina. */
  soloLectura: boolean;
  /** Usuarios asignados, activos o dados de baja. */
  cantidadUsuarios: number;
  permisos: PermisoCatalogo[];
}

export interface DatosCrearRol {
  codigo: string;
  nombre: string;
  permisoIds: bigint[];
}

export interface DatosActualizarRol {
  nombre?: string;
  permisoIds?: bigint[];
}

const SELECCION_GESTION = {
  id: true,
  codigo: true,
  nombre: true,
  _count: { select: { usuarios: true } },
  permisos: { select: { permiso: { select: { id: true, codigo: true, nombre: true } } } },
} satisfies Prisma.RolSelect;

type FilaGestion = Prisma.RolGetPayload<{ select: typeof SELECCION_GESTION }>;

const ENTIDAD = "ROL";

/**
 * Roles de la empresa del llamador y catalogo global de permisos. Los cambios
 * surten efecto en la siguiente peticion de cada usuario con el rol: el
 * JwtGuard recarga los permisos desde la BD en cada peticion. Toda mutacion
 * corre en {@link ejecutarMutacionAdministrativa} porque quitar el permiso de
 * administracion a un rol, o eliminar un rol, puede romper la invariante.
 */
@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Catalogo global de permisos, ordenado por codigo. */
  async listarPermisos(): Promise<PermisoCatalogo[]> {
    const permisos = await this.prisma.permiso.findMany({
      select: { id: true, codigo: true, nombre: true },
      orderBy: { codigo: "asc" },
    });
    return permisos.map(aPermiso);
  }

  /** Roles de la empresa, ordenados por codigo. */
  async listar(empresaId: bigint): Promise<RolGestion[]> {
    const filas = await this.prisma.rol.findMany({
      where: { empresaId },
      select: SELECCION_GESTION,
      orderBy: { codigo: "asc" },
    });
    return filas.map(aGestion);
  }

  async crear(actor: UsuarioRequest, datos: DatosCrearRol): Promise<RolGestion> {
    const codigo = exigirCodigo(datos.codigo);
    const nombre = exigirNombre(datos.nombre);
    exigirPermisos(datos.permisoIds);

    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const permisos = await resolverPermisos(tx, datos.permisoIds);
      const creado = await conCodigoUnico(
        tx.rol.create({
          data: {
            empresaId: actor.empresaId,
            codigo,
            nombre,
            permisos: { create: permisos.map((p) => ({ permisoId: p.id })) },
          },
          select: SELECCION_GESTION,
        }),
      );
      await this.auditar(
        tx,
        actor,
        creado.id,
        "CREAR",
        `Rol ${codigo} creado con permisos: ${codigos(permisos)}`,
      );
      return aGestion(creado);
    });
  }

  /**
   * Edita nombre y/o permisos. `permisoIds`, si viene, reemplaza el conjunto
   * (al menos uno). El codigo es inmutable y el rol del sistema no se edita.
   */
  async actualizar(
    actor: UsuarioRequest,
    rolId: bigint,
    datos: DatosActualizarRol,
  ): Promise<RolGestion> {
    if (datos.nombre === undefined && datos.permisoIds === undefined) {
      throw new BadRequestException("Indica al menos un dato a modificar");
    }
    const nombre = datos.nombre === undefined ? undefined : exigirNombre(datos.nombre);
    if (datos.permisoIds !== undefined) exigirPermisos(datos.permisoIds);

    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const actual = await buscarEditable(tx, actor.empresaId, rolId, "modificar");
      const cambios: string[] = [];

      if (nombre !== undefined && nombre !== actual.nombre) {
        await tx.rol.update({ where: { id: rolId }, data: { nombre } });
        cambios.push(`nombre: "${actual.nombre}" -> "${nombre}"`);
      }
      if (datos.permisoIds !== undefined) {
        const permisos = await resolverPermisos(tx, datos.permisoIds);
        const antes = actual.permisos.map((rp) => rp.permiso);
        if (codigos(antes) !== codigos(permisos)) {
          await tx.rolPermiso.deleteMany({ where: { rolId } });
          await tx.rolPermiso.createMany({
            data: permisos.map((p) => ({ rolId, permisoId: p.id })),
          });
          cambios.push(`permisos: ${codigos(antes)} -> ${codigos(permisos)}`);
        }
      }
      if (cambios.length === 0) return aGestion(actual);

      await this.auditar(
        tx,
        actor,
        rolId,
        "ACTUALIZAR",
        `Rol ${actual.codigo}: ${cambios.join("; ")}`,
      );
      return aGestion(await buscar(tx, actor.empresaId, rolId));
    });
  }

  /**
   * Elimina un rol sin usuarios asignados (ni activos ni dados de baja), junto
   * con sus vinculos a permisos. El rol del sistema no se elimina.
   */
  async eliminar(
    actor: UsuarioRequest,
    rolId: bigint,
  ): Promise<{ id: string; eliminado: true }> {
    return ejecutarMutacionAdministrativa(this.prisma, actor, async (tx) => {
      const actual = await buscarEditable(tx, actor.empresaId, rolId, "eliminar");
      // Se cuenta bajo el bloqueo de administracion: una asignacion concurrente
      // desde UsuariosService espera el mismo bloqueo.
      const asignados = await tx.usuarioRol.count({ where: { rolId } });
      if (asignados > 0) {
        throw new ConflictException(
          `No se puede eliminar el rol ${actual.codigo}: tiene ${asignados} usuario(s) asignado(s), incluidos los dados de baja. Quitaselo primero.`,
        );
      }
      await tx.rolPermiso.deleteMany({ where: { rolId } });
      await tx.rol.delete({ where: { id: rolId } });
      await this.auditar(
        tx,
        actor,
        rolId,
        "ELIMINAR",
        `Rol ${actual.codigo} eliminado (permisos: ${codigos(actual.permisos.map((rp) => rp.permiso))})`,
      );
      return { id: rolId.toString(), eliminado: true as const };
    });
  }

  private auditar(
    tx: Tx,
    actor: UsuarioRequest,
    rolId: bigint,
    accion: string,
    detalle: string,
  ): Promise<void> {
    return this.auditoria.registrar(
      {
        empresaId: actor.empresaId,
        usuarioId: actor.id,
        accion,
        entidad: ENTIDAD,
        entidadId: rolId,
        detalle,
      },
      tx,
    );
  }
}

/** Rol de la empresa o 404 (un rol de otra empresa "no existe"). */
async function buscar(tx: Tx, empresaId: bigint, rolId: bigint): Promise<FilaGestion> {
  const fila = await tx.rol.findFirst({
    where: { id: rolId, empresaId },
    select: SELECCION_GESTION,
  });
  if (!fila) throw new NotFoundException("Rol no encontrado");
  return fila;
}

/** Como {@link buscar}, pero rechaza el rol del sistema (409). */
async function buscarEditable(
  tx: Tx,
  empresaId: bigint,
  rolId: bigint,
  operacion: "modificar" | "eliminar",
): Promise<FilaGestion> {
  const fila = await buscar(tx, empresaId, rolId);
  if (fila.codigo === CODIGO_ROL_SISTEMA) {
    throw new ConflictException(
      `El rol ${CODIGO_ROL_SISTEMA} es del sistema y no se puede ${operacion}`,
    );
  }
  return fila;
}

/** Resuelve los permisos pedidos contra el catalogo global (desconocido: 404). */
async function resolverPermisos(
  tx: Tx,
  permisoIds: bigint[],
): Promise<Array<{ id: bigint; codigo: string; nombre: string }>> {
  const unicos = [...new Set(permisoIds)];
  const permisos = await tx.permiso.findMany({
    where: { id: { in: unicos } },
    select: { id: true, codigo: true, nombre: true },
  });
  if (permisos.length !== unicos.length) throw new NotFoundException("Permiso no encontrado");
  return permisos;
}

/** Traduce la unicidad (empresa, codigo) de la BD al conflicto con mensaje claro. */
async function conCodigoUnico<T>(escritura: Promise<T>): Promise<T> {
  try {
    return await escritura;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException("Ya existe un rol con ese codigo en la empresa");
    }
    throw error;
  }
}

function aPermiso(p: { id: bigint; codigo: string; nombre: string }): PermisoCatalogo {
  return { id: p.id.toString(), codigo: p.codigo, nombre: p.nombre };
}

function aGestion(fila: FilaGestion): RolGestion {
  return {
    id: fila.id.toString(),
    codigo: fila.codigo,
    nombre: fila.nombre,
    soloLectura: fila.codigo === CODIGO_ROL_SISTEMA,
    cantidadUsuarios: fila._count.usuarios,
    permisos: fila.permisos
      .map((rp) => aPermiso(rp.permiso))
      .sort((a, b) => a.codigo.localeCompare(b.codigo)),
  };
}

/** Codigos de permiso ordenados y separados por coma (auditoria y comparacion). */
function codigos(permisos: ReadonlyArray<{ codigo: string }>): string {
  const lista = permisos.map((p) => p.codigo).sort();
  return lista.length > 0 ? lista.join(", ") : "(ninguno)";
}

/** Recorta y valida el codigo; el del sistema esta reservado. */
function exigirCodigo(codigo: string): string {
  const limpio = codigo.trim();
  if (!REGEX_CODIGO_ROL.test(limpio)) throw new BadRequestException(MENSAJE_CODIGO_ROL);
  if (limpio === CODIGO_ROL_SISTEMA) {
    throw new ConflictException(
      `El codigo ${CODIGO_ROL_SISTEMA} esta reservado para el rol del sistema`,
    );
  }
  return limpio;
}

function exigirNombre(nombre: string): string {
  const limpio = nombre.trim();
  if (limpio.length === 0) throw new BadRequestException("Ingresa el nombre del rol");
  return limpio;
}

function exigirPermisos(permisoIds: bigint[]): void {
  if (permisoIds.length === 0) throw new BadRequestException("Asigna al menos un permiso");
}
