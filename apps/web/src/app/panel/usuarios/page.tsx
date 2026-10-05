"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BotonCopiar, CampoClaveTemporal } from "@/componentes/campo-clave-temporal";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
import {
  actualizarUsuario,
  crearUsuario,
  darDeBajaUsuario,
  ErrorApi,
  esClaveInvalida,
  esSinPermiso,
  obtenerRolesGestion,
  obtenerUsuariosGestion,
  reactivarUsuario,
  restablecerClaveUsuario,
  type RolGestion,
  type UsuarioGestion,
} from "@/lib/api";
import { LARGO_MINIMO_CLAVE } from "@/lib/clave-temporal";
import { leerUsuario } from "@/lib/sesion";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

/** Formato basico de correo (la API valida el resto). */
const REGEX_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MENSAJE_SIN_PERMISO =
  "No tienes permiso para administrar usuarios. Si crees que es un error, contacta a un administrador.";

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** 404/409 en una accion de fila: otro administrador pudo cambiar al usuario. */
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

export default function PaginaUsuarios(): React.JSX.Element {
  const [usuarios, setUsuarios] = useState<UsuarioGestion[]>([]);
  const [roles, setRoles] = useState<RolGestion[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [verInactivos, setVerInactivos] = useState<boolean>(false);
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [sinPermiso, setSinPermiso] = useState<boolean>(false);
  // Se lee en un efecto: localStorage no existe durante el render del servidor.
  const [miId, setMiId] = useState<string | null>(null);
  // Numero de la ultima carga pedida: una respuesta tardia de una carga
  // anterior (p. ej. al alternar "Ver dados de baja") no pisa a la mas nueva.
  const ultimaCarga = useRef<number>(0);

  // null = cerrado; "nuevo" = alta; usuario = edicion.
  const [edicion, setEdicion] = useState<"nuevo" | UsuarioGestion | null>(null);
  const [restablecer, setRestablecer] = useState<UsuarioGestion | null>(null);
  const [usuarioBaja, setUsuarioBaja] = useState<UsuarioGestion | null>(null);
  const [procesandoBaja, setProcesandoBaja] = useState<boolean>(false);

  useEffect(() => {
    setMiId(leerUsuario()?.id ?? null);
  }, []);

  /** Error de una accion: un 403 oculta la pantalla; el resto se muestra. */
  const informarError = useCallback((error: unknown, porDefecto: string): void => {
    if (esSinPermiso(error)) {
      setSinPermiso(true);
      setEdicion(null);
      setRestablecer(null);
      setUsuarioBaja(null);
      return;
    }
    setAvisoLista({ texto: mensajeError(error, porDefecto), tono: "error" });
  }, []);

  const recargar = useCallback(async (): Promise<void> => {
    const carga = ++ultimaCarga.current;
    const vigente = (): boolean => carga === ultimaCarga.current;
    setCargando(true);
    try {
      const [listaUsuarios, listaRoles] = await Promise.all([
        obtenerUsuariosGestion(verInactivos),
        obtenerRolesGestion(),
      ]);
      if (!vigente()) return;
      setUsuarios(listaUsuarios);
      setRoles(listaRoles);
    } catch (error) {
      if (vigente()) informarError(error, "No se pudieron cargar los usuarios.");
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [verInactivos, informarError]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  /** Tras una mutacion correcta: aviso y recarga desde la API. */
  async function alGuardar(texto: string): Promise<void> {
    setEdicion(null);
    setRestablecer(null);
    setAvisoLista({ texto, tono: "exito" });
    await recargar();
  }

  /** Error de una accion de fila; si la fila estaba desactualizada, recarga. */
  function alFallarAccion(error: unknown, porDefecto: string): void {
    informarError(error, porDefecto);
    if (esDesactualizado(error)) void recargar();
  }

  async function confirmarBaja(): Promise<void> {
    if (!usuarioBaja) return;
    setProcesandoBaja(true);
    try {
      await darDeBajaUsuario(usuarioBaja.id);
      setUsuarioBaja(null);
      await alGuardar(`Se dio de baja a ${usuarioBaja.nombre} y se cerraron sus sesiones.`);
    } catch (error) {
      setUsuarioBaja(null);
      alFallarAccion(error, "No se pudo dar de baja al usuario.");
    } finally {
      setProcesandoBaja(false);
    }
  }

  async function reactivar(usuario: UsuarioGestion): Promise<void> {
    try {
      await reactivarUsuario(usuario.id);
      await alGuardar(`Se reactivó a ${usuario.nombre}.`);
    } catch (error) {
      alFallarAccion(error, "No se pudo reactivar al usuario.");
    }
  }

  if (sinPermiso) {
    return (
      <div>
        <EncabezadoPagina titulo="Usuarios" />
        <div className="mt-4">
          <AvisoLinea aviso={{ texto: MENSAJE_SIN_PERMISO, tono: "error" }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Crea usuarios, asigna sus roles y gestiona su acceso al sistema."
        acciones={
          <button
            type="button"
            onClick={() => setEdicion("nuevo")}
            disabled={cargando}
            className="btn btn-primario"
          >
            Nuevo usuario
          </button>
        }
      />

      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6" aria-labelledby="titulo-usuarios">
        <div className="panel-cabecera flex-wrap gap-3">
          <h2 id="titulo-usuarios" className="panel-titulo">
            Usuarios registrados
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({usuarios.length})
            </span>
          </h2>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-texto-sec">
            <input
              type="checkbox"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
            />
            Ver dados de baja
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos" aria-busy={cargando}>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Roles</th>
                <th scope="col">Estado</th>
                <th scope="col" className="text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody>
              {cargando && usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-texto-ter">
                    {verInactivos ? "Aún no hay usuarios." : "No hay usuarios activos."}
                  </td>
                </tr>
              ) : (
                usuarios.map((usuario) => (
                  <FilaUsuario
                    key={usuario.id}
                    usuario={usuario}
                    esPropio={usuario.id === miId}
                    onEditar={() => setEdicion(usuario)}
                    onRestablecer={() => setRestablecer(usuario)}
                    onBaja={() => setUsuarioBaja(usuario)}
                    onReactivar={() => void reactivar(usuario)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PanelUsuario
        edicion={edicion}
        roles={roles}
        onCerrar={() => setEdicion(null)}
        onGuardado={(texto) => void alGuardar(texto)}
        onSinPermiso={() => setSinPermiso(true)}
      />

      <PanelRestablecer
        usuario={restablecer}
        onCerrar={() => setRestablecer(null)}
        onGuardado={(texto) => void alGuardar(texto)}
        onSinPermiso={() => setSinPermiso(true)}
      />

      <ModalConfirmacion
        abierto={usuarioBaja !== null}
        titulo="Dar de baja usuario"
        mensaje={
          usuarioBaja
            ? `¿Confirmas dar de baja a ${usuarioBaja.nombre} (${usuarioBaja.email})? No podrá ingresar al sistema y se cerrarán todas sus sesiones abiertas. Podrás reactivarlo después.`
            : ""
        }
        textoConfirmar="Dar de baja"
        tono="peligro"
        procesando={procesandoBaja}
        onConfirmar={() => void confirmarBaja()}
        onCancelar={() => !procesandoBaja && setUsuarioBaja(null)}
      />
    </div>
  );
}

// ── Fila de la tabla ────────────────────────────────────────────────────────

interface PropsFila {
  usuario: UsuarioGestion;
  esPropio: boolean;
  onEditar: () => void;
  onRestablecer: () => void;
  onBaja: () => void;
  onReactivar: () => void;
}

function FilaUsuario({
  usuario,
  esPropio,
  onEditar,
  onRestablecer,
  onBaja,
  onReactivar,
}: PropsFila): React.JSX.Element {
  return (
    <tr>
      <td className="text-tinta">
        {usuario.nombre}
        {esPropio && <span className="ml-2 text-xs text-texto-ter">(tú)</span>}
      </td>
      <td className="text-texto-sec">{usuario.email}</td>
      <td>
        <ul className="flex flex-wrap gap-1" aria-label={`Roles de ${usuario.nombre}`}>
          {usuario.roles.map((rol) => (
            <li key={rol.id} className="insignia insignia-info" title={rol.nombre}>
              {rol.codigo}
            </li>
          ))}
        </ul>
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          <span className={`insignia ${usuario.activo ? "insignia-exito" : "insignia-neutra"}`}>
            {usuario.activo ? "Activo" : "Dado de baja"}
          </span>
          {usuario.debeCambiarClave && (
            <span className="insignia insignia-oro">Contraseña temporal</span>
          )}
        </div>
      </td>
      <td>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEditar}
            aria-label={`Editar a ${usuario.nombre}`}
            className="btn btn-contorno h-8"
          >
            Editar
          </button>
          {!esPropio && (
            <button
              type="button"
              onClick={onRestablecer}
              aria-label={`Restablecer contraseña de ${usuario.nombre}`}
              className="btn btn-contorno h-8 whitespace-nowrap"
            >
              Restablecer contraseña
            </button>
          )}
          {usuario.activo && !esPropio && (
            <button
              type="button"
              onClick={onBaja}
              aria-label={`Dar de baja a ${usuario.nombre}`}
              className="btn btn-peligro h-8 whitespace-nowrap"
            >
              Dar de baja
            </button>
          )}
          {!usuario.activo && (
            <button
              type="button"
              onClick={onReactivar}
              aria-label={`Reactivar a ${usuario.nombre}`}
              className="btn btn-contorno h-8"
            >
              Reactivar
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Paso final: entrega de la contraseña temporal ───────────────────────────

/** Contraseña recien fijada, que se muestra una sola vez antes de cerrar. */
interface ClaveEntregada {
  nombre: string;
  clave: string;
  /** Aviso que se mostrara en la lista al terminar. */
  avisoFinal: string;
}

/**
 * Ultimo paso tras crear un usuario o restablecer su contraseña: la muestra
 * para copiarla, porque al cerrar ya no se puede recuperar. Solo "Listo" (o
 * cerrar el panel) termina el flujo.
 */
function PasoClaveEntregada({
  entrega,
  titulo,
  onListo,
}: {
  entrega: ClaveEntregada;
  titulo: string;
  onListo: () => void;
}): React.JSX.Element {
  const refTitulo = useRef<HTMLHeadingElement>(null);

  // El formulario desaparece: el foco pasa al titulo del paso para anunciarlo.
  useEffect(() => {
    refTitulo.current?.focus();
  }, []);

  return (
    <div className="space-y-4">
      <h3 ref={refTitulo} tabIndex={-1} className="text-sm font-semibold text-tinta">
        {titulo}
      </h3>
      <p className="text-sm text-texto-sec">
        Esta es la contraseña temporal de {entrega.nombre}. Cópiala y compártela por un medio
        seguro: al cerrar este panel ya no podrás verla. Deberá cambiarla en su primer ingreso.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <code className="rounded-md border border-borde bg-panel-alt px-3 py-2 font-mono text-base text-tinta">
          {entrega.clave}
        </code>
        <BotonCopiar texto={entrega.clave} />
      </div>
      <div className="pt-2">
        <button type="button" onClick={onListo} className="btn btn-primario">
          Listo
        </button>
      </div>
    </div>
  );
}

// ── Panel de alta / edicion ─────────────────────────────────────────────────

type CampoUsuario = "nombre" | "email" | "clave" | "roles";
type ErroresUsuario = Partial<Record<CampoUsuario, string>>;

const ORDEN_CAMPOS: readonly CampoUsuario[] = ["nombre", "email", "clave", "roles"];

interface PropsPanelUsuario {
  edicion: "nuevo" | UsuarioGestion | null;
  roles: RolGestion[];
  onCerrar: () => void;
  onGuardado: (texto: string) => void;
  onSinPermiso: () => void;
}

function validarUsuario(
  datos: { nombre: string; email: string; clave: string; rolIds: string[] },
  esAlta: boolean,
): ErroresUsuario {
  const errores: ErroresUsuario = {};
  if (!datos.nombre.trim()) errores.nombre = "Ingresa el nombre.";
  if (!REGEX_CORREO.test(datos.email.trim())) errores.email = "Ingresa un correo válido.";
  if (esAlta && datos.clave.length < LARGO_MINIMO_CLAVE) {
    errores.clave = `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  }
  if (datos.rolIds.length === 0) errores.roles = "Selecciona al menos un rol.";
  return errores;
}

function PanelUsuario({
  edicion,
  roles,
  onCerrar,
  onGuardado,
  onSinPermiso,
}: PropsPanelUsuario): React.JSX.Element {
  const esAlta = edicion === "nuevo";
  const [nombre, setNombre] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [clave, setClave] = useState<string>("");
  const [rolIds, setRolIds] = useState<string[]>([]);
  const [errores, setErrores] = useState<ErroresUsuario>({});
  const [avisoServidor, setAvisoServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [focoPendiente, setFocoPendiente] = useState<CampoUsuario | null>(null);
  const [entrega, setEntrega] = useState<ClaveEntregada | null>(null);
  const refs = useRef<Partial<Record<CampoUsuario, HTMLInputElement | null>>>({});

  // Reinicia el formulario cada vez que se abre (alta o un usuario distinto).
  useEffect(() => {
    if (edicion === null) return;
    const usuario = edicion === "nuevo" ? null : edicion;
    setNombre(usuario?.nombre ?? "");
    setEmail(usuario?.email ?? "");
    setClave("");
    setRolIds(usuario?.roles.map((r) => r.id) ?? []);
    setErrores({});
    setAvisoServidor(null);
    setEntrega(null);
  }, [edicion]);

  // El foco se mueve tras el render, cuando el campo ya tiene aria-invalid y
  // aria-describedby, para que el lector de pantalla anuncie el error.
  useEffect(() => {
    if (!focoPendiente) return;
    refs.current[focoPendiente]?.focus();
    setFocoPendiente(null);
  }, [focoPendiente]);

  /** Termina el paso de entrega: borra la contraseña y cierra con recarga. */
  function terminarEntrega(): void {
    if (!entrega) return;
    const aviso = entrega.avisoFinal;
    setEntrega(null);
    onGuardado(aviso);
  }

  function cerrar(): void {
    if (guardando) return;
    if (entrega) {
      terminarEntrega();
      return;
    }
    onCerrar();
  }

  function alternarRol(id: string): void {
    setRolIds((previo) =>
      previo.includes(id) ? previo.filter((r) => r !== id) : [...previo, id],
    );
  }

  /** Errores de la API: 403 cierra la pantalla, CLAVE_INVALIDA va al campo. */
  function manejarErrorServidor(error: unknown): void {
    if (esSinPermiso(error)) {
      onSinPermiso();
      return;
    }
    if (esClaveInvalida(error)) {
      setErrores({ clave: error.message });
      setFocoPendiente("clave");
      return;
    }
    setAvisoServidor(mensajeError(error, "No se pudo guardar el usuario."));
    setFocoPendiente("nombre");
  }

  async function guardar(): Promise<void> {
    if (edicion === null) return;
    setAvisoServidor(null);
    const nuevos = validarUsuario({ nombre, email, clave, rolIds }, esAlta);
    setErrores(nuevos);
    const primero = ORDEN_CAMPOS.find((c) => nuevos[c] !== undefined);
    if (primero) {
      setFocoPendiente(primero);
      return;
    }

    setGuardando(true);
    const datos = { nombre: nombre.trim(), email: email.trim(), rolIds: rolIds.map(Number) };
    try {
      if (edicion === "nuevo") {
        const creado = await crearUsuario({ ...datos, clave });
        // La contraseña pasa al paso final y se borra del formulario.
        setEntrega({
          nombre: creado.nombre,
          clave,
          avisoFinal: `Se creó el usuario de ${creado.nombre}.`,
        });
        setClave("");
      } else {
        const editado = await actualizarUsuario(edicion.id, datos);
        onGuardado(`Se actualizaron los datos de ${editado.nombre}.`);
      }
    } catch (error) {
      manejarErrorServidor(error);
    } finally {
      setGuardando(false);
    }
  }

  const usuarioEditado = edicion !== null && edicion !== "nuevo" ? edicion : null;

  return (
    <PanelLateral
      abierto={edicion !== null}
      titulo={esAlta ? "Nuevo usuario" : "Editar usuario"}
      descripcion={usuarioEditado?.email}
      onCerrar={cerrar}
    >
      {entrega ? (
        <PasoClaveEntregada entrega={entrega} titulo="Usuario creado" onListo={terminarEntrega} />
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

          <CampoTexto
            id="usuario-nombre"
            etiqueta="Nombre"
            valor={nombre}
            onCambio={setNombre}
            error={errores.nombre}
            autoComplete="off"
            refInput={(el) => {
              refs.current.nombre = el;
            }}
          />
          <CampoTexto
            id="usuario-email"
            etiqueta="Correo electrónico"
            tipo="email"
            valor={email}
            onCambio={setEmail}
            error={errores.email}
            autoComplete="off"
            ayuda={usuarioEditado ? "Con este correo ingresa al sistema." : undefined}
            refInput={(el) => {
              refs.current.email = el;
            }}
          />
          {esAlta && (
            <CampoClaveTemporal
              id="usuario-clave"
              ref={(el) => {
                refs.current.clave = el;
              }}
              valor={clave}
              onCambio={setClave}
              error={errores.clave}
              deshabilitado={guardando}
            />
          )}

          <fieldset aria-describedby={errores.roles ? "usuario-roles-error" : undefined}>
            <legend className="etiqueta-campo">Roles</legend>
            {roles.length === 0 ? (
              <p className="text-sm text-texto-ter">No hay roles disponibles.</p>
            ) : (
              <ul className="space-y-1.5">
                {roles.map((rol, indice) => (
                  <li key={rol.id}>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-texto">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={rolIds.includes(rol.id)}
                        onChange={() => alternarRol(rol.id)}
                        aria-invalid={errores.roles !== undefined}
                        ref={
                          indice === 0
                            ? (el) => {
                                refs.current.roles = el;
                              }
                            : undefined
                        }
                      />
                      <span>
                        <span className="font-mono text-xs">{rol.codigo}</span>
                        <span className="text-texto-sec"> — {rol.nombre}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {errores.roles && (
              <p id="usuario-roles-error" className="mt-1.5 text-xs text-peligro">
                {errores.roles}
              </p>
            )}
          </fieldset>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : esAlta ? "Crear usuario" : "Guardar cambios"}
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

// ── Panel de restablecimiento de contraseña ─────────────────────────────────

interface PropsPanelRestablecer {
  usuario: UsuarioGestion | null;
  onCerrar: () => void;
  onGuardado: (texto: string) => void;
  onSinPermiso: () => void;
}

function PanelRestablecer({
  usuario,
  onCerrar,
  onGuardado,
  onSinPermiso,
}: PropsPanelRestablecer): React.JSX.Element {
  const [clave, setClave] = useState<string>("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [avisoServidor, setAvisoServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [enfocar, setEnfocar] = useState<boolean>(false);
  const [entrega, setEntrega] = useState<ClaveEntregada | null>(null);
  const refClave = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (usuario === null) return;
    setClave("");
    setError(undefined);
    setAvisoServidor(null);
    setEntrega(null);
  }, [usuario]);

  useEffect(() => {
    if (!enfocar) return;
    refClave.current?.focus();
    setEnfocar(false);
  }, [enfocar]);

  function terminarEntrega(): void {
    if (!entrega) return;
    const aviso = entrega.avisoFinal;
    setEntrega(null);
    onGuardado(aviso);
  }

  function cerrar(): void {
    if (guardando) return;
    if (entrega) {
      terminarEntrega();
      return;
    }
    onCerrar();
  }

  async function guardar(): Promise<void> {
    if (!usuario) return;
    setAvisoServidor(null);
    if (clave.length < LARGO_MINIMO_CLAVE) {
      setError(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
      setEnfocar(true);
      return;
    }
    setError(undefined);
    setGuardando(true);
    try {
      await restablecerClaveUsuario(usuario.id, clave);
      setEntrega({
        nombre: usuario.nombre,
        clave,
        avisoFinal: `Se restableció la contraseña de ${usuario.nombre} y se cerraron sus sesiones.`,
      });
      setClave("");
    } catch (err) {
      if (esSinPermiso(err)) {
        onSinPermiso();
        return;
      }
      if (esClaveInvalida(err)) {
        setError(err.message);
      } else {
        setAvisoServidor(mensajeError(err, "No se pudo restablecer la contraseña."));
      }
      setEnfocar(true);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <PanelLateral
      abierto={usuario !== null}
      titulo="Restablecer contraseña"
      descripcion={usuario?.email}
      onCerrar={cerrar}
    >
      {entrega ? (
        <PasoClaveEntregada
          entrega={entrega}
          titulo="Contraseña restablecida"
          onListo={terminarEntrega}
        />
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
          <p className="text-sm text-texto-sec">
            Se cerrarán todas las sesiones de {usuario?.nombre ?? "este usuario"}. Con la nueva
            contraseña temporal solo podrá cambiarla por una propia.
          </p>
          <CampoClaveTemporal
            id="restablecer-clave"
            ref={refClave}
            valor={clave}
            onCambio={setClave}
            error={error}
            deshabilitado={guardando}
          />
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : "Restablecer contraseña"}
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

// ── Campo de texto con etiqueta, ayuda y error ──────────────────────────────

interface PropsCampoTexto {
  id: string;
  etiqueta: string;
  valor: string;
  onCambio: (valor: string) => void;
  error?: string;
  ayuda?: string;
  tipo?: "text" | "email";
  autoComplete?: string;
  refInput: (elemento: HTMLInputElement | null) => void;
}

function CampoTexto({
  id,
  etiqueta,
  valor,
  onCambio,
  error,
  ayuda,
  tipo = "text",
  autoComplete,
  refInput,
}: PropsCampoTexto): React.JSX.Element {
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null]
    .filter((x): x is string => x !== null)
    .join(" ");
  return (
    <div>
      <label htmlFor={id} className="etiqueta-campo">
        {etiqueta}
      </label>
      <input
        ref={refInput}
        id={id}
        type={tipo}
        className="campo"
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={error !== undefined}
        aria-describedby={describe || undefined}
      />
      {ayuda && (
        <p id={`${id}-ayuda`} className="mt-1.5 text-xs text-texto-sec">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-xs text-peligro">
          {error}
        </p>
      )}
    </div>
  );
}
