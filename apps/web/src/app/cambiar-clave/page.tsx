"use client";

import { cambiarClaveSchema, type CambiarClaveFormulario } from "@bm/contratos";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { cerrarSesionServidor, cambiarClave, ErrorApi } from "@/lib/api";
import { guardarSesion, haySesion, leerRefresh, leerUsuario, limpiarSesion } from "@/lib/sesion";

type Campo = keyof CambiarClaveFormulario;
type ErroresCampo = Partial<Record<Campo, string>>;

/** Orden de los campos en pantalla: el foco va al primero con error. */
const CAMPOS: readonly Campo[] = ["claveActual", "claveNueva", "confirmacion"];

// La pantalla de ingreso llama "contraseña" a la credencial; se usa la misma palabra.
const ETIQUETAS: Record<Campo, string> = {
  claveActual: "Contraseña actual",
  claveNueva: "Nueva contraseña",
  confirmacion: "Confirmar nueva contraseña",
};

const AUTOCOMPLETAR: Record<Campo, string> = {
  claveActual: "current-password",
  claveNueva: "new-password",
  confirmacion: "new-password",
};

const FORMULARIO_VACIO: CambiarClaveFormulario = {
  claveActual: "",
  claveNueva: "",
  confirmacion: "",
};

function erroresDeValidacion(
  incidencias: ReadonlyArray<{ path: ReadonlyArray<string | number>; message: string }>,
): ErroresCampo {
  const errores: ErroresCampo = {};
  for (const incidencia of incidencias) {
    const campo = CAMPOS.find((c) => c === incidencia.path[0]);
    if (campo && !errores[campo]) errores[campo] = incidencia.message;
  }
  return errores;
}

function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorApi) return error.message;
  return "No se pudo conectar con el servidor. Intenta nuevamente.";
}

/**
 * Cambio de clave. Vive fuera de /panel para no depender de datos que la API
 * rechaza mientras la clave sea temporal. Sirve tanto para el cambio
 * obligatorio (clave temporal) como para el voluntario.
 */
export default function PaginaCambiarClave(): React.JSX.Element | null {
  const router = useRouter();
  const [listo, setListo] = useState<boolean>(false);
  const [obligatorio, setObligatorio] = useState<boolean>(false);
  const [valores, setValores] = useState<CambiarClaveFormulario>(FORMULARIO_VACIO);
  const [verClaves, setVerClaves] = useState<boolean>(false);
  const [errores, setErrores] = useState<ErroresCampo>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  // Campo a enfocar tras el proximo render. El foco se mueve en un efecto (no
  // en el handler) para que el campo ya tenga aria-invalid/aria-describedby y
  // el lector de pantalla anuncie el error al recibir el foco.
  const [focoPendiente, setFocoPendiente] = useState<Campo | null>(null);
  const refs = useRef<Partial<Record<Campo, HTMLInputElement | null>>>({});

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    setObligatorio(leerUsuario()?.debeCambiarClave === true);
    setListo(true);
  }, [router]);

  useEffect(() => {
    if (!focoPendiente) return;
    refs.current[focoPendiente]?.focus();
    setFocoPendiente(null);
  }, [focoPendiente]);

  function actualizar(campo: Campo, valor: string): void {
    setValores((previo) => ({ ...previo, [campo]: valor }));
  }

  function cerrarSesion(): void {
    const refresh = leerRefresh();
    if (refresh) void cerrarSesionServidor(refresh);
    limpiarSesion();
    router.replace("/login");
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErrorGeneral(null);

    const resultado = cambiarClaveSchema.safeParse(valores);
    if (!resultado.success) {
      const nuevos = erroresDeValidacion(resultado.error.issues);
      setErrores(nuevos);
      setFocoPendiente(CAMPOS.find((c) => nuevos[c] !== undefined) ?? null);
      return;
    }

    setErrores({});
    setCargando(true);
    try {
      const respuesta = await cambiarClave({
        claveActual: resultado.data.claveActual,
        claveNueva: resultado.data.claveNueva,
      });
      guardarSesion({
        token: respuesta.token,
        refreshToken: respuesta.refreshToken,
        usuario: respuesta.usuario,
      });
      router.replace("/panel");
    } catch (error) {
      setErrorGeneral(mensajeDeError(error));
      setCargando(false);
      // El error del servidor casi siempre es la contraseña actual o una regla
      // de la nueva: se vuelve al primer campo para corregir.
      setFocoPendiente("claveActual");
    }
  }

  if (!listo) return null;

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6">
          <div className="inline-flex rounded-md bg-tinta px-4 py-3">
            <Image src="/logo-bm.png" alt="BM Ingenieros S.A.C." width={150} height={53} priority />
          </div>
          <p className="mt-2 text-sm text-texto-sec">Sistema de Inventarios</p>
        </div>

        <div className="panel overflow-hidden">
          <div className="h-1 bg-oro" />
          <div className="p-7">
            <h1 className="text-xl font-semibold text-tinta">Cambiar contraseña</h1>
            <p className="mt-1 text-sm text-texto-sec">
              La nueva contraseña debe tener al menos 8 caracteres y ser distinta de la actual.
            </p>

            <form onSubmit={manejarEnvio} noValidate className="mt-6 space-y-4">
              {obligatorio && (
                <div className="aviso aviso-aviso">
                  <IconoAlerta />
                  <span>Tu contraseña actual es temporal. Debes reemplazarla para continuar.</span>
                </div>
              )}

              {errorGeneral && (
                <div role="alert" className="aviso aviso-peligro">
                  <IconoAlerta />
                  <span>{errorGeneral}</span>
                </div>
              )}

              {CAMPOS.map((campo, indice) => (
                <div key={campo}>
                  <label htmlFor={campo} className="etiqueta-campo">
                    {ETIQUETAS[campo]}
                  </label>
                  <input
                    id={campo}
                    name={campo}
                    ref={(elemento) => {
                      refs.current[campo] = elemento;
                    }}
                    type={verClaves ? "text" : "password"}
                    autoComplete={AUTOCOMPLETAR[campo]}
                    autoFocus={indice === 0}
                    value={valores[campo]}
                    onChange={(e) => actualizar(campo, e.target.value)}
                    disabled={cargando}
                    aria-invalid={errores[campo] !== undefined}
                    aria-describedby={errores[campo] ? `${campo}-error` : undefined}
                    className="campo"
                  />
                  {errores[campo] && (
                    <p id={`${campo}-error`} className="mt-1.5 text-xs text-peligro">
                      {errores[campo]}
                    </p>
                  )}
                </div>
              ))}

              <label className="flex items-center gap-2 text-sm text-texto-sec">
                <input
                  type="checkbox"
                  checked={verClaves}
                  onChange={(e) => setVerClaves(e.target.checked)}
                  disabled={cargando}
                />
                Mostrar contraseñas
              </label>

              <button type="submit" disabled={cargando} className="btn btn-primario w-full">
                {cargando ? (
                  <>
                    <Spinner />
                    Guardando…
                  </>
                ) : (
                  "Cambiar contraseña"
                )}
              </button>
            </form>

            <div className="mt-4 text-center text-sm">
              {obligatorio ? (
                <button
                  type="button"
                  onClick={cerrarSesion}
                  className="font-medium text-oro-osc hover:underline"
                >
                  Cerrar sesión
                </button>
              ) : (
                <Link href="/panel" className="font-medium text-oro-osc hover:underline">
                  Volver al panel
                </Link>
              )}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-texto-ter">
          Benites Malpica Ingenieros S.A.C. · Soledad
        </p>
      </div>
    </main>
  );
}

function IconoAlerta(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

function Spinner(): React.JSX.Element {
  return (
    <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
