"use client";

import { loginSchema } from "@bm/contratos";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ErrorApi, login } from "@/lib/api";
import { guardarSesion } from "@/lib/sesion";

type ErroresCampo = Partial<Record<"email" | "clave", string>>;

/**
 * Solo se navega a rutas internas para evitar open-redirect via `destino`.
 * Se rechazan backslashes porque el navegador normaliza `\` a `/`, de modo que
 * `/\evil.com` se resolveria como URL protocol-relative hacia un host externo.
 */
function rutaInternaSegura(destino: string | null): string {
  if (
    destino &&
    destino.startsWith("/") &&
    !destino.startsWith("//") &&
    !destino.includes("\\")
  ) {
    return destino;
  }
  return "/panel";
}

export default function PaginaLogin(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <FormularioLogin />
    </Suspense>
  );
}

function FormularioLogin(): React.JSX.Element {
  const router = useRouter();
  const parametros = useSearchParams();
  const sesionExpirada = parametros.get("expirada") === "1";
  const destino = rutaInternaSegura(parametros.get("destino"));
  const [email, setEmail] = useState<string>("");
  const [clave, setClave] = useState<string>("");
  const [verClave, setVerClave] = useState<boolean>(false);
  const [errores, setErrores] = useState<ErroresCampo>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(
    sesionExpirada ? "Tu sesión expiró, vuelve a ingresar." : null,
  );
  const [cargando, setCargando] = useState<boolean>(false);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErrorGeneral(null);

    const resultado = loginSchema.safeParse({ email, clave });
    if (!resultado.success) {
      const nuevosErrores: ErroresCampo = {};
      for (const incidencia of resultado.error.issues) {
        const campo = incidencia.path[0];
        if (campo === "email" || campo === "clave") {
          nuevosErrores[campo] = incidencia.message;
        }
      }
      setErrores(nuevosErrores);
      return;
    }

    setErrores({});
    setCargando(true);
    try {
      const respuesta = await login(resultado.data);
      guardarSesion({
        token: respuesta.token,
        refreshToken: respuesta.refreshToken,
        usuario: respuesta.usuario,
      });
      router.push(destino);
    } catch (error) {
      const mensaje =
        error instanceof ErrorApi
          ? error.estado === 401
            ? "Correo o contraseña incorrectos."
            : error.message
          : "No se pudo conectar con el servidor. Intenta nuevamente.";
      setErrorGeneral(mensaje);
    } finally {
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/* Marca */}
        <div className="mb-6">
          <div className="inline-flex rounded-md bg-tinta px-4 py-3">
            <Image src="/logo-bm.png" alt="BM Ingenieros S.A.C." width={150} height={53} priority />
          </div>
          <p className="mt-2 text-sm text-texto-sec">Sistema de Inventarios</p>
        </div>

        <div className="panel overflow-hidden">
          <div className="h-1 bg-oro" />
          <div className="p-7">
            <h1 className="text-xl font-semibold text-tinta">Iniciar sesión</h1>
            <p className="mt-1 text-sm text-texto-sec">
              Ingresa tus credenciales para continuar.
            </p>

            <form onSubmit={manejarEnvio} noValidate className="mt-6 space-y-4">
              {errorGeneral && (
                <div role="alert" className="aviso aviso-peligro">
                  <IconoAlerta />
                  <span>{errorGeneral}</span>
                </div>
              )}

              <div>
                <label htmlFor="email" className="etiqueta-campo">
                  Correo electrónico
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@bmingenieros.pe"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={cargando}
                  aria-invalid={errores.email !== undefined}
                  aria-describedby={errores.email ? "email-error" : undefined}
                  className="campo"
                />
                {errores.email && (
                  <p id="email-error" className="mt-1.5 text-xs text-peligro">
                    {errores.email}
                  </p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="clave" className="etiqueta-campo mb-0">
                    Contraseña
                  </label>
                  <button
                    type="button"
                    className="text-xs font-medium text-oro-osc hover:underline"
                    onClick={() => setErrorGeneral("Contacta al administrador para restablecer tu contraseña.")}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="clave"
                    name="clave"
                    type={verClave ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={clave}
                    onChange={(e) => setClave(e.target.value)}
                    disabled={cargando}
                    aria-invalid={errores.clave !== undefined}
                    aria-describedby={errores.clave ? "clave-error" : undefined}
                    className="campo pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setVerClave((v) => !v)}
                    aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                    aria-pressed={verClave}
                    title={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                    className="absolute right-1 top-1/2 flex h-8 w-9 -translate-y-1/2 items-center justify-center rounded text-texto-ter transition-colors hover:bg-panel-alt hover:text-texto"
                  >
                    {verClave ? <IconoOjoTachado /> : <IconoOjo />}
                  </button>
                </div>
                {errores.clave && (
                  <p id="clave-error" className="mt-1.5 text-xs text-peligro">
                    {errores.clave}
                  </p>
                )}
              </div>

              <button type="submit" disabled={cargando} className="btn btn-primario w-full">
                {cargando ? (
                  <>
                    <Spinner />
                    Verificando…
                  </>
                ) : (
                  "Iniciar sesión"
                )}
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-texto-ter">
          Benites Malpica Ingenieros S.A.C. · Soledad
        </p>
      </div>
    </main>
  );
}

function IconoOjo(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconoOjoTachado(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
      <path d="M6.6 6.6C3.6 8.3 2 11 2 11s3.5 7 10 7a9.3 9.3 0 0 0 5.4-1.6" />
      <path d="m2 2 20 20" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
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
