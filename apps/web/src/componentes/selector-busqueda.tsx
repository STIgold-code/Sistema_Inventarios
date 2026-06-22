"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface OpcionSelector {
  valor: string;
  etiqueta: string;
}

interface Props {
  /** Opciones ya cargadas en memoria. */
  opciones: OpcionSelector[];
  /** Valor seleccionado actualmente (o cadena vacía). */
  valor: string;
  onCambio: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  requerido?: boolean;
  id?: string;
  ariaLabel?: string;
}

const MAX_VISIBLES = 50;

/**
 * Combobox genérico con búsqueda client-side: las opciones ya vienen cargadas.
 * Filtra por texto (case-insensitive, match en etiqueta), navegable con teclado
 * (flechas, Enter, Escape), resalta el ítem activo y cierra al hacer clic fuera.
 * Look idéntico a un .campo.
 */
export function SelectorBusqueda({
  opciones,
  valor,
  onCambio,
  placeholder = "Busca…",
  disabled,
  requerido,
  id,
  ariaLabel,
}: Props): React.JSX.Element {
  const [texto, setTexto] = useState<string>("");
  const [abierto, setAbierto] = useState<boolean>(false);
  const [resaltado, setResaltado] = useState<number>(-1);
  const contenedor = useRef<HTMLDivElement>(null);
  const listaId = useId();

  const etiquetaSel = useMemo(
    () => opciones.find((o) => o.valor === valor)?.etiqueta ?? "",
    [opciones, valor],
  );

  const filtradas = useMemo(() => {
    const termino = texto.trim().toLowerCase();
    const base = termino
      ? opciones.filter((o) => o.etiqueta.toLowerCase().includes(termino))
      : opciones;
    return base;
  }, [opciones, texto]);

  const visibles = filtradas.slice(0, MAX_VISIBLES);
  const hayMas = filtradas.length > MAX_VISIBLES;

  // Al abrir, posicionar el resaltado en la opción seleccionada (o la primera).
  useEffect(() => {
    if (!abierto) return;
    const idx = visibles.findIndex((o) => o.valor === valor);
    setResaltado(idx >= 0 ? idx : visibles.length > 0 ? 0 : -1);
    // Solo al abrir; el filtrado posterior reajusta vía onChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    function alClic(e: MouseEvent): void {
      if (contenedor.current && !contenedor.current.contains(e.target as Node)) {
        setAbierto(false);
      }
    }
    document.addEventListener("mousedown", alClic);
    return () => document.removeEventListener("mousedown", alClic);
  }, []);

  function elegir(opcion: OpcionSelector): void {
    onCambio(opcion.valor);
    setTexto("");
    setAbierto(false);
  }

  function limpiar(): void {
    onCambio("");
    setTexto("");
    setAbierto(true);
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!abierto && (e.key === "ArrowDown" || e.key === "Enter")) {
      setAbierto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, visibles.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = visibles[resaltado];
      if (sel) elegir(sel);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const opcionActivaId =
    resaltado >= 0 && visibles[resaltado] ? `${listaId}-opt-${resaltado}` : undefined;

  return (
    <div ref={contenedor} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-ter">
          <IconoLupa />
        </span>
        <input
          id={id}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={abierto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={opcionActivaId}
          aria-required={requerido}
          disabled={disabled}
          value={abierto ? texto : etiquetaSel}
          placeholder={placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            setResaltado(0);
            if (!abierto) setAbierto(true);
          }}
          onFocus={() => !disabled && setAbierto(true)}
          onKeyDown={alTeclado}
          className="campo pl-9 pr-9"
        />
        {valor && !abierto && !disabled && (
          <button
            type="button"
            onClick={limpiar}
            aria-label="Limpiar selección"
            className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-texto-ter transition-colors hover:bg-panel-alt hover:text-texto"
          >
            <IconoEquis />
          </button>
        )}
      </div>

      {abierto && !disabled && (
        <div
          id={listaId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-borde-fuerte bg-panel shadow-media"
        >
          {visibles.length === 0 ? (
            <p className="px-3 py-3 text-sm text-texto-ter">
              {texto.trim() ? "Sin resultados." : "No hay opciones."}
            </p>
          ) : (
            <ul className="py-1">
              {visibles.map((opcion, i) => (
                <li key={opcion.valor}>
                  <button
                    type="button"
                    id={`${listaId}-opt-${i}`}
                    role="option"
                    aria-selected={i === resaltado}
                    onMouseEnter={() => setResaltado(i)}
                    onClick={() => elegir(opcion)}
                    className={`flex w-full items-baseline px-3 py-2 text-left transition-colors ${
                      i === resaltado ? "bg-panel-alt" : ""
                    }`}
                  >
                    <span className="truncate text-sm text-tinta">{opcion.etiqueta}</span>
                  </button>
                </li>
              ))}
              {hayMas && (
                <li>
                  <p className="px-3 py-2 text-xs text-texto-ter">
                    Mostrando {MAX_VISIBLES} de {filtradas.length}. Sigue escribiendo
                    para refinar…
                  </p>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function IconoLupa(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function IconoEquis(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
