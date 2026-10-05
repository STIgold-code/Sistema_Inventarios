"use client";

import { forwardRef, useEffect, useState } from "react";
import { generarClaveTemporal, LARGO_MINIMO_CLAVE } from "@/lib/clave-temporal";

/** Cuanto se muestra la confirmacion "Copiada". */
const DURACION_COPIADA_MS = 2500;

/**
 * Boton para copiar un texto al portapapeles. No se muestra si el navegador no
 * ofrece la API (contexto no seguro o navegador antiguo). La confirmacion
 * "Copiada" se anuncia con role="status".
 */
export function BotonCopiar({
  texto,
  deshabilitado = false,
}: {
  texto: string;
  deshabilitado?: boolean;
}): React.JSX.Element | null {
  // Se detecta en un efecto: `navigator` no existe durante el render del servidor.
  const [disponible, setDisponible] = useState<boolean>(false);
  const [estado, setEstado] = useState<"" | "copiada" | "error">("");

  useEffect(() => {
    setDisponible(typeof navigator !== "undefined" && navigator.clipboard !== undefined);
  }, []);

  useEffect(() => {
    if (estado === "") return;
    const id = window.setTimeout(() => setEstado(""), DURACION_COPIADA_MS);
    return () => window.clearTimeout(id);
  }, [estado]);

  // Un texto distinto invalida la confirmacion anterior.
  useEffect(() => {
    setEstado("");
  }, [texto]);

  if (!disponible) return null;

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiada");
    } catch {
      setEstado("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void copiar()}
        disabled={deshabilitado || texto === ""}
        className="btn btn-contorno whitespace-nowrap"
      >
        Copiar
      </button>
      <span role="status" className="text-xs text-texto-sec">
        {estado === "copiada" ? "Copiada" : estado === "error" ? "No se pudo copiar" : ""}
      </span>
    </span>
  );
}

interface Props {
  id: string;
  valor: string;
  onCambio: (valor: string) => void;
  error?: string;
  deshabilitado?: boolean;
}

/**
 * Campo de contraseña temporal para que un administrador la fije a otro
 * usuario: "Mostrar" (aria-pressed), "Generar" (la rellena con una contraseña
 * aleatoria, la deja visible y lo anuncia) y "Copiar".
 */
export const CampoClaveTemporal = forwardRef<HTMLInputElement, Props>(
  function CampoClaveTemporal({ id, valor, onCambio, error, deshabilitado = false }, ref) {
    const [visible, setVisible] = useState<boolean>(false);
    const [anuncio, setAnuncio] = useState<string>("");
    const idAyuda = `${id}-ayuda`;
    const idError = `${id}-error`;

    function generar(): void {
      onCambio(generarClaveTemporal());
      setVisible(true);
      setAnuncio("Se generó una contraseña y ahora es visible en el campo.");
    }

    function cambiar(nuevo: string): void {
      setAnuncio("");
      onCambio(nuevo);
    }

    return (
      <div>
        <label htmlFor={id} className="etiqueta-campo">
          Contraseña temporal
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            ref={ref}
            id={id}
            type={visible ? "text" : "password"}
            autoComplete="new-password"
            spellCheck={false}
            className="campo min-w-0 flex-1 font-mono"
            value={valor}
            onChange={(e) => cambiar(e.target.value)}
            disabled={deshabilitado}
            aria-invalid={error !== undefined}
            aria-describedby={error ? `${idAyuda} ${idError}` : idAyuda}
          />
          {/* Etiqueta fija + aria-pressed: el estado lo comunica aria-pressed. */}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-controls={id}
            aria-label="Mostrar contraseña"
            disabled={deshabilitado}
            className="btn btn-contorno whitespace-nowrap"
          >
            Mostrar
          </button>
          <button
            type="button"
            onClick={generar}
            disabled={deshabilitado}
            className="btn btn-contorno whitespace-nowrap"
          >
            Generar
          </button>
          <BotonCopiar texto={valor} deshabilitado={deshabilitado} />
        </div>
        <span role="status" className="sr-only">
          {anuncio}
        </span>
        <p id={idAyuda} className="mt-1.5 text-xs text-texto-sec">
          Mínimo {LARGO_MINIMO_CLAVE} caracteres. El usuario deberá cambiarla en su primer
          ingreso; compártela por un medio seguro.
        </p>
        {error && (
          <p id={idError} className="mt-1 text-xs text-peligro">
            {error}
          </p>
        )}
      </div>
    );
  },
);
