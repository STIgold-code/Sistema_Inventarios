"use client";

import { useEffect, useRef, type ReactNode } from "react";

type Ancho = "formulario" | "detalle";

interface Props {
  abierto: boolean;
  titulo: string;
  descripcion?: string;
  onCerrar: () => void;
  children: ReactNode;
  /**
   * Densidad de contenido. "formulario" (por defecto) para altas/ediciones;
   * "detalle" usa un panel más ancho para fichas con tablas densas (stock por
   * almacén, líneas, capas FIFO), que en un panel angosto se entrecortan.
   */
  ancho?: Ancho;
}

const ANCHO_MAX: Record<Ancho, string> = {
  formulario: "min(var(--drawer-formulario), 100vw)",
  detalle: "min(var(--drawer-detalle), 100vw)",
};

/** Elementos enfocables dentro del panel, para el foco atrapado (focus trap). */
const ENFOCABLES =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Panel lateral deslizante (slide-over). Accesible: rol dialog, foco atrapado
 * mientras está abierto, devuelve el foco al disparador al cerrar, cierra con
 * Escape o clic en el fondo y bloquea el scroll del body. En móvil ocupa todo
 * el ancho; en pantallas grandes se limita según la densidad del contenido.
 */
export function PanelLateral({
  abierto,
  titulo,
  descripcion,
  onCerrar,
  children,
  ancho = "formulario",
}: Props): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const disparadorRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!abierto) return;

    // Recuerda qué elemento tenía el foco para devolvérselo al cerrar.
    disparadorRef.current = document.activeElement as HTMLElement | null;

    function alPresionarTecla(evento: KeyboardEvent): void {
      if (evento.key === "Escape") {
        onCerrar();
        return;
      }
      if (evento.key !== "Tab" || !panelRef.current) return;

      const foco = panelRef.current.querySelectorAll<HTMLElement>(ENFOCABLES);
      if (foco.length === 0) {
        evento.preventDefault();
        return;
      }
      const primero = foco[0];
      const ultimo = foco[foco.length - 1];
      if (!primero || !ultimo) {
        evento.preventDefault();
        return;
      }
      if (evento.shiftKey && document.activeElement === primero) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alPresionarTecla);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Lleva el foco al primer elemento útil del panel al abrir.
    const id = window.requestAnimationFrame(() => {
      const primero = panelRef.current?.querySelector<HTMLElement>(ENFOCABLES);
      primero?.focus();
    });

    return () => {
      document.removeEventListener("keydown", alPresionarTecla);
      document.body.style.overflow = overflowPrevio;
      window.cancelAnimationFrame(id);
      disparadorRef.current?.focus?.();
    };
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={titulo}>
      <div
        className="fixed inset-0 bg-tinta/45 animacion-fundido"
        onClick={onCerrar}
        aria-hidden
      />
      <div
        ref={panelRef}
        style={{ maxWidth: ANCHO_MAX[ancho] }}
        className="fixed inset-y-0 right-0 flex w-full flex-col bg-fondo shadow-2xl animacion-deslizar"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borde bg-panel px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-tinta">{titulo}</h2>
            {descripcion && (
              <p className="mt-0.5 truncate font-mono text-xs text-texto-sec">{descripcion}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-texto-sec transition-colors hover:bg-panel-alt hover:text-tinta"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5">{children}</div>
      </div>
    </div>
  );
}
