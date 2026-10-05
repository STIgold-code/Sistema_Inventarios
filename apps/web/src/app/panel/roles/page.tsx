"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
import {
  actualizarRol,
  crearRol,
  eliminarRol,
  ErrorApi,
  esSinPermiso,
  obtenerPermisosCatalogo,
  obtenerRolesGestion,
  type PermisoCatalogo,
  type RolGestion,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

/** Igual que la regla de la API: 2 a 30 caracteres en mayusculas, digitos o guion bajo. */
const REGEX_CODIGO = /^[A-Z0-9_]{2,30}$/;
const CODIGO_SISTEMA = "ADMIN";
const REGLA_CODIGO =
  "Solo letras mayúsculas, dígitos y guion bajo, de 2 a 30 caracteres. No se puede cambiar después.";

const MENSAJE_SIN_PERMISO =
  "No tienes permiso para administrar roles. Si crees que es un error, contacta a un administrador.";

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** 404/409 al eliminar: otro administrador pudo cambiar o eliminar el rol. */
function esDesactualizado(error: unknown): boolean {
  return error instanceof ErrorApi && (error.estado === 404 || error.estado === 409);
}

function AvisoLinea({ aviso }: { aviso: Aviso }): React.JSX.Element {
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
    >
      <span>{aviso.texto}</span>
    </div>
  );
}

interface GrupoPermisos {
  clave: string;
  titulo: string;
  permisos: PermisoCatalogo[];
}

/** Agrupa por el segmento anterior al primer punto del codigo (`producto.ver` → producto). */
function agruparPermisos(catalogo: readonly PermisoCatalogo[]): GrupoPermisos[] {
  const grupos = new Map<string, PermisoCatalogo[]>();
  for (const permiso of catalogo) {
    const clave = permiso.codigo.split(".")[0] ?? permiso.codigo;
    grupos.set(clave, [...(grupos.get(clave) ?? []), permiso]);
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, permisos]) => ({
      clave,
      titulo: clave.charAt(0).toUpperCase() + clave.slice(1),
      permisos,
    }));
}

export default function PaginaRoles(): React.JSX.Element {
  const [roles, setRoles] = useState<RolGestion[]>([]);
  const [catalogo, setCatalogo] = useState<PermisoCatalogo[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [sinPermiso, setSinPermiso] = useState<boolean>(false);

  // null = cerrado; "nuevo" = alta; rol = edicion (o consulta si es de solo lectura).
  const [edicion, setEdicion] = useState<"nuevo" | RolGestion | null>(null);
  const [rolEliminar, setRolEliminar] = useState<RolGestion | null>(null);
  const [procesandoEliminar, setProcesandoEliminar] = useState<boolean>(false);

  const grupos = useMemo(() => agruparPermisos(catalogo), [catalogo]);

  const recargar = useCallback(async (): Promise<void> => {
    const [listaRoles, listaPermisos] = await Promise.all([
      obtenerRolesGestion(),
      obtenerPermisosCatalogo(),
    ]);
    setRoles(listaRoles);
    setCatalogo(listaPermisos);
  }, []);

  const informarError = useCallback((error: unknown, porDefecto: string): void => {
    if (esSinPermiso(error)) {
      setSinPermiso(true);
      setEdicion(null);
      setRolEliminar(null);
      return;
    }
    setAvisoLista({ texto: mensajeError(error, porDefecto), tono: "error" });
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await recargar();
      } catch (error) {
        informarError(error, "No se pudieron cargar los roles.");
      } finally {
        setCargando(false);
      }
    })();
  }, [recargar, informarError]);

  /** Recarga tras un error de accion; si la recarga falla, informa ese error. */
  async function recargarSinFallar(): Promise<void> {
    try {
      await recargar();
    } catch (error) {
      informarError(error, "No se pudo recargar la lista de roles.");
    }
  }

  async function alGuardar(texto: string): Promise<void> {
    setEdicion(null);
    setAvisoLista({ texto, tono: "exito" });
    try {
      await recargar();
    } catch (error) {
      informarError(error, "No se pudo recargar la lista de roles.");
    }
  }

  async function confirmarEliminar(): Promise<void> {
    if (!rolEliminar) return;
    setProcesandoEliminar(true);
    try {
      await eliminarRol(rolEliminar.id);
      setRolEliminar(null);
      await alGuardar(`Se eliminó el rol ${rolEliminar.codigo}.`);
    } catch (error) {
      setRolEliminar(null);
      informarError(error, "No se pudo eliminar el rol.");
      if (esDesactualizado(error)) void recargarSinFallar();
    } finally {
      setProcesandoEliminar(false);
    }
  }

  if (sinPermiso) {
    return (
      <div>
        <EncabezadoPagina titulo="Roles" />
        <div className="mt-4">
          <AvisoLinea aviso={{ texto: MENSAJE_SIN_PERMISO, tono: "error" }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Roles"
        descripcion="Define qué puede hacer cada rol. Los cambios se aplican en la siguiente acción de cada usuario con ese rol."
        acciones={
          <button
            type="button"
            onClick={() => setEdicion("nuevo")}
            disabled={cargando}
            className="btn btn-primario"
          >
            Nuevo rol
          </button>
        }
      />

      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6" aria-labelledby="titulo-roles">
        <div className="panel-cabecera">
          <h2 id="titulo-roles" className="panel-titulo">
            Roles de la empresa
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({roles.length})
            </span>
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos" aria-busy={cargando}>
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nombre</th>
                <th scope="col" className="text-right">
                  Usuarios
                </th>
                <th scope="col" className="text-right">
                  Permisos
                </th>
                <th scope="col" className="text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={5} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : roles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-texto-ter">
                    Aún no hay roles.
                  </td>
                </tr>
              ) : (
                roles.map((rol) => (
                  <FilaRol
                    key={rol.id}
                    rol={rol}
                    onAbrir={() => setEdicion(rol)}
                    onEliminar={() => setRolEliminar(rol)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PanelRol
        edicion={edicion}
        grupos={grupos}
        onCerrar={() => setEdicion(null)}
        onGuardado={(texto) => void alGuardar(texto)}
        onSinPermiso={() => setSinPermiso(true)}
      />

      <ModalConfirmacion
        abierto={rolEliminar !== null}
        titulo="Eliminar rol"
        mensaje={
          rolEliminar
            ? `¿Confirmas eliminar el rol ${rolEliminar.codigo} — ${rolEliminar.nombre}? Esta acción no se puede deshacer.`
            : ""
        }
        textoConfirmar="Eliminar"
        tono="peligro"
        procesando={procesandoEliminar}
        onConfirmar={() => void confirmarEliminar()}
        onCancelar={() => !procesandoEliminar && setRolEliminar(null)}
      />
    </div>
  );
}

// ── Fila de la tabla ────────────────────────────────────────────────────────

interface PropsFila {
  rol: RolGestion;
  onAbrir: () => void;
  onEliminar: () => void;
}

function FilaRol({ rol, onAbrir, onEliminar }: PropsFila): React.JSX.Element {
  const idMotivo = `rol-${rol.id}-motivo`;
  const enUso = rol.cantidadUsuarios > 0;
  return (
    <tr>
      <td>
        <span className="num">{rol.codigo}</span>
        {rol.soloLectura && (
          <span className="insignia insignia-neutra ml-2">Rol del sistema</span>
        )}
      </td>
      <td className="text-tinta">{rol.nombre}</td>
      <td className="num text-right">{rol.cantidadUsuarios}</td>
      <td className="num text-right">{rol.permisos.length}</td>
      <td>
        {rol.soloLectura ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onAbrir}
              aria-label={`Ver permisos del rol ${rol.codigo}`}
              className="btn btn-contorno h-8 whitespace-nowrap"
            >
              Ver permisos
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onAbrir}
                aria-label={`Editar el rol ${rol.codigo}`}
                className="btn btn-contorno h-8"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onEliminar}
                disabled={enUso}
                aria-label={`Eliminar el rol ${rol.codigo}`}
                aria-describedby={enUso ? idMotivo : undefined}
                className="btn btn-peligro h-8"
              >
                Eliminar
              </button>
            </div>
            {enUso && (
              <span id={idMotivo} className="text-xs text-texto-ter">
                No se puede eliminar: tiene {rol.cantidadUsuarios} usuario(s) asignado(s).
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Panel de alta / edicion / consulta ──────────────────────────────────────

type CampoRol = "codigo" | "nombre" | "permisos";
type ErroresRol = Partial<Record<CampoRol, string>>;

const ORDEN_CAMPOS: readonly CampoRol[] = ["codigo", "nombre", "permisos"];

/**
 * El codigo se escribe libremente y se muestra en mayusculas con CSS; se
 * convierte aqui (convertirlo en onChange movia el cursor al final).
 */
function normalizarCodigo(codigo: string): string {
  return codigo.trim().toUpperCase();
}

function validarRol(
  datos: { codigo: string; nombre: string; permisoIds: string[] },
  esAlta: boolean,
): ErroresRol {
  const errores: ErroresRol = {};
  const codigo = normalizarCodigo(datos.codigo);
  if (esAlta && !REGEX_CODIGO.test(codigo)) errores.codigo = REGLA_CODIGO;
  else if (esAlta && codigo === CODIGO_SISTEMA) {
    errores.codigo = `El código ${CODIGO_SISTEMA} está reservado para el rol del sistema.`;
  }
  if (!datos.nombre.trim()) errores.nombre = "Ingresa el nombre del rol.";
  if (datos.permisoIds.length === 0) errores.permisos = "Selecciona al menos un permiso.";
  return errores;
}

interface PropsPanelRol {
  edicion: "nuevo" | RolGestion | null;
  grupos: GrupoPermisos[];
  onCerrar: () => void;
  onGuardado: (texto: string) => void;
  onSinPermiso: () => void;
}

function PanelRol({
  edicion,
  grupos,
  onCerrar,
  onGuardado,
  onSinPermiso,
}: PropsPanelRol): React.JSX.Element {
  const esAlta = edicion === "nuevo";
  const rol = edicion !== null && edicion !== "nuevo" ? edicion : null;
  const soloLectura = rol?.soloLectura === true;
  const [codigo, setCodigo] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [permisoIds, setPermisoIds] = useState<string[]>([]);
  const [errores, setErrores] = useState<ErroresRol>({});
  const [avisoServidor, setAvisoServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [focoPendiente, setFocoPendiente] = useState<CampoRol | null>(null);
  const refs = useRef<Partial<Record<CampoRol, HTMLInputElement | null>>>({});

  useEffect(() => {
    if (edicion === null) return;
    const actual = edicion === "nuevo" ? null : edicion;
    setCodigo(actual?.codigo ?? "");
    setNombre(actual?.nombre ?? "");
    setPermisoIds(actual?.permisos.map((p) => p.id) ?? []);
    setErrores({});
    setAvisoServidor(null);
  }, [edicion]);

  // Foco tras el render, cuando el campo ya expone su error (ver /cambiar-clave).
  useEffect(() => {
    if (!focoPendiente) return;
    refs.current[focoPendiente]?.focus();
    setFocoPendiente(null);
  }, [focoPendiente]);

  function cerrar(): void {
    if (!guardando) onCerrar();
  }

  async function guardar(): Promise<void> {
    if (edicion === null || soloLectura) return;
    setAvisoServidor(null);
    const nuevos = validarRol({ codigo, nombre, permisoIds }, esAlta);
    setErrores(nuevos);
    const primero = ORDEN_CAMPOS.find((c) => nuevos[c] !== undefined);
    if (primero) {
      setFocoPendiente(primero === "codigo" && !esAlta ? "nombre" : primero);
      return;
    }

    setGuardando(true);
    const ids = permisoIds.map(Number);
    try {
      if (edicion === "nuevo") {
        const creado = await crearRol({
          codigo: normalizarCodigo(codigo),
          nombre: nombre.trim(),
          permisoIds: ids,
        });
        onGuardado(`Se creó el rol ${creado.codigo}.`);
      } else {
        const editado = await actualizarRol(edicion.id, {
          nombre: nombre.trim(),
          permisoIds: ids,
        });
        onGuardado(`Se actualizó el rol ${editado.codigo}.`);
      }
    } catch (error) {
      if (esSinPermiso(error)) {
        onSinPermiso();
        return;
      }
      setAvisoServidor(mensajeError(error, "No se pudo guardar el rol."));
      setFocoPendiente(esAlta ? "codigo" : "nombre");
    } finally {
      setGuardando(false);
    }
  }

  const titulo = esAlta ? "Nuevo rol" : soloLectura ? "Permisos del rol" : "Editar rol";

  return (
    <PanelLateral
      abierto={edicion !== null}
      titulo={titulo}
      descripcion={rol ? `${rol.codigo} — ${rol.nombre}` : undefined}
      onCerrar={cerrar}
    >
      {soloLectura && rol ? (
        <ConsultaRolSistema rol={rol} grupos={grupos} onCerrar={cerrar} />
      ) : (
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void guardar();
          }}
        >
          {avisoServidor && <AvisoLinea aviso={{ texto: avisoServidor, tono: "error" }} />}

          <div>
            <label htmlFor="rol-codigo" className="etiqueta-campo">
              Código
            </label>
            <input
              id="rol-codigo"
              ref={(el) => {
                refs.current.codigo = el;
              }}
              className="campo font-mono uppercase"
              value={codigo}
              readOnly={!esAlta}
              onChange={(e) => setCodigo(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={30}
              placeholder="ALMACEN_OBRA"
              aria-invalid={errores.codigo !== undefined}
              aria-describedby={
                errores.codigo ? "rol-codigo-ayuda rol-codigo-error" : "rol-codigo-ayuda"
              }
            />
            <p id="rol-codigo-ayuda" className="mt-1.5 text-xs text-texto-sec">
              {esAlta ? REGLA_CODIGO : "El código de un rol no se puede cambiar."}
            </p>
            {errores.codigo && (
              <p id="rol-codigo-error" className="mt-1 text-xs text-peligro">
                {errores.codigo}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="rol-nombre" className="etiqueta-campo">
              Nombre
            </label>
            <input
              id="rol-nombre"
              ref={(el) => {
                refs.current.nombre = el;
              }}
              className="campo"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              autoComplete="off"
              maxLength={120}
              aria-invalid={errores.nombre !== undefined}
              aria-describedby={errores.nombre ? "rol-nombre-error" : undefined}
            />
            {errores.nombre && (
              <p id="rol-nombre-error" className="mt-1 text-xs text-peligro">
                {errores.nombre}
              </p>
            )}
          </div>

          <SelectorPermisos
            grupos={grupos}
            seleccion={permisoIds}
            onCambio={setPermisoIds}
            error={errores.permisos}
            refPrimero={(el) => {
              refs.current.permisos = el;
            }}
          />

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : esAlta ? "Crear rol" : "Guardar cambios"}
            </button>
            <button type="button" onClick={cerrar} className="btn btn-contorno">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </PanelLateral>
  );
}

// ── Consulta del rol del sistema (solo lectura) ─────────────────────────────

function ConsultaRolSistema({
  rol,
  grupos,
  onCerrar,
}: {
  rol: RolGestion;
  grupos: GrupoPermisos[];
  onCerrar: () => void;
}): React.JSX.Element {
  const concedidos = new Set(rol.permisos.map((p) => p.id));
  return (
    <div className="space-y-4">
      <p className="text-sm text-texto-sec">
        Es el rol del sistema: tiene todos los permisos y no se puede modificar ni eliminar.
      </p>
      {grupos.map((grupo) => {
        const delGrupo = grupo.permisos.filter((p) => concedidos.has(p.id));
        if (delGrupo.length === 0) return null;
        return (
          <section key={grupo.clave} aria-labelledby={`consulta-${grupo.clave}`}>
            <h3 id={`consulta-${grupo.clave}`} className="etiqueta-campo">
              {grupo.titulo}
            </h3>
            <ul className="space-y-1 text-sm text-texto">
              {delGrupo.map((p) => (
                <li key={p.id}>
                  {p.nombre} <span className="font-mono text-xs text-texto-ter">({p.codigo})</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <div className="pt-2">
        <button type="button" onClick={onCerrar} className="btn btn-contorno">
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ── Lista de permisos agrupada con "Seleccionar todo" por grupo ─────────────

interface PropsSelector {
  grupos: GrupoPermisos[];
  seleccion: string[];
  onCambio: (seleccion: string[]) => void;
  error?: string;
  refPrimero: (elemento: HTMLInputElement | null) => void;
}

function SelectorPermisos({
  grupos,
  seleccion,
  onCambio,
  error,
  refPrimero,
}: PropsSelector): React.JSX.Element {
  const elegidos = new Set(seleccion);

  function alternar(id: string): void {
    onCambio(elegidos.has(id) ? seleccion.filter((s) => s !== id) : [...seleccion, id]);
  }

  function alternarGrupo(grupo: GrupoPermisos, marcar: boolean): void {
    const ids = grupo.permisos.map((p) => p.id);
    onCambio(
      marcar
        ? [...new Set([...seleccion, ...ids])]
        : seleccion.filter((s) => !ids.includes(s)),
    );
  }

  return (
    <fieldset aria-describedby={error ? "rol-permisos-error" : undefined}>
      <legend className="etiqueta-campo">
        Permisos <span className="font-normal text-texto-ter">({seleccion.length} seleccionados)</span>
      </legend>
      {error && (
        <p id="rol-permisos-error" className="mb-2 text-xs text-peligro">
          {error}
        </p>
      )}
      <div className="space-y-3">
        {grupos.map((grupo, indiceGrupo) => {
          const marcados = grupo.permisos.filter((p) => elegidos.has(p.id)).length;
          const todos = marcados === grupo.permisos.length;
          const algunos = marcados > 0 && !todos;
          return (
            <fieldset key={grupo.clave} className="rounded-lg border border-borde p-3">
              <legend className="px-1 text-sm font-medium text-tinta">{grupo.titulo}</legend>
              <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-texto-sec">
                <input
                  type="checkbox"
                  checked={todos}
                  // Estado mixto (algunos marcados): los lectores lo anuncian.
                  ref={(el) => {
                    if (el) el.indeterminate = algunos;
                    if (indiceGrupo === 0) refPrimero(el);
                  }}
                  onChange={(e) => alternarGrupo(grupo, e.target.checked)}
                  aria-invalid={error !== undefined}
                />
                Seleccionar todo <span className="sr-only">en {grupo.titulo}</span>
              </label>
              <ul className="space-y-1.5">
                {grupo.permisos.map((permiso) => (
                  <li key={permiso.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-texto">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={elegidos.has(permiso.id)}
                        onChange={() => alternar(permiso.id)}
                      />
                      <span>
                        {permiso.nombre}
                        <span className="ml-1 font-mono text-xs text-texto-ter">
                          ({permiso.codigo})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          );
        })}
      </div>
    </fieldset>
  );
}
