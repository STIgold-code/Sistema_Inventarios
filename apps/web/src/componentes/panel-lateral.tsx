"use client";

import { useEffect, type ReactNode } from "react";

interface Props {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  onCerrar: () => void;
  children: ReactNode;
}

/**
 * Panel lateral deslizante (slide-over) para formularios de alta/edición sobre
 * una lista a ancho completo. Reemplaza el patrón "formulario al lado de la
 * tabla", que estrangula la tabla cuando el formulario es alto. Accesible:
 * rol dialog, cierra con Escape o clic en el fondo, bloquea el scroll del body.
 */
export function PanelLateral({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
}: Props): React.JSX.Element | null {
  useEffect(() => {
    if (!abierto) return;
    function alPresionarTecla(evento: KeyboardEvent): void {
      if (evento.key === "Escape") onCerrar();
    }
    document.addEventListener("keydown", alPresionarTecla);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alPresionarTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div className="fixed inset-0 bg-black/40" onClick={onCerrar} aria-hidden />
      <div className="fixed inset-y-0 right-0 flex w-full max-w-lg flex-col bg-panel shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-borde px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-tinta">{titulo}</h2>
            {descripcion && (
              <p className="mt-0.5 text-sm text-texto-sec">{descripcion}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-texto-sec hover:bg-panel-alt"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
