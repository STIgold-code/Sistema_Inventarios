"use client";

import { useEffect, useId, useRef, useState } from "react";
import { obtenerSkus, type Sku } from "@/lib/api";

interface Props {
  /** SKU seleccionado actualmente (o null). */
  valor: Sku | null;
  onSeleccionar: (sku: Sku | null) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Buscador de SKU con autocompletado server-side. Consulta /productos/skus con
 * debounce a medida que se escribe (por codigo o nombre); nunca carga el
 * catalogo completo. Navegable con teclado (flechas, Enter, Escape).
 */
export function SelectorSku({
  valor,
  onSeleccionar,
  placeholder = "Busca por código o nombre…",
  autoFocus,
}: Props): React.JSX.Element {
  const [texto, setTexto] = useState<string>("");
  const [resultados, setResultados] = useState<Sku[]>([]);
  const [abierto, setAbierto] = useState<boolean>(false);
  const [cargando, setCargando] = useState<boolean>(false);
  const [resaltado, setResaltado] = useState<number>(-1);
  const contenedor = useRef<HTMLDivElement>(null);
  const listaId = useId();

  // Busqueda con debounce.
  useEffect(() => {
    if (!abierto) return;
    const termino = texto.trim();
    setCargando(true);
    const t = setTimeout(() => {
      void (async () => {
        try {
          const resp = await obtenerSkus(1, 15, termino);
          setResultados(resp.datos);
          setResaltado(resp.datos.length > 0 ? 0 : -1);
        } catch {
          setResultados([]);
        } finally {
          setCargando(false);
        }
      })();
    }, 220);
    return () => clearTimeout(t);
  }, [texto, abierto]);

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

  function elegir(sku: Sku): void {
    onSeleccionar(sku);
    setTexto("");
    setAbierto(false);
  }

  function limpiar(): void {
    onSeleccionar(null);
    setTexto("");
    setResultados([]);
    setAbierto(true);
  }

  function alTeclado(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (!abierto && (e.key === "ArrowDown" || e.key === "Enter")) {
      setAbierto(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setResaltado((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setResaltado((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const sel = resultados[resaltado];
      if (sel) elegir(sel);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  const etiquetaSel = valor
    ? `${valor.codigoParlante} — ${valor.nombre ?? valor.producto.nombre}`
    : "";

  return (
    <div ref={contenedor} className="relative">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-texto-ter">
          <IconoLupa />
        </span>
        <input
          type="text"
          role="combobox"
          aria-expanded={abierto}
          aria-controls={listaId}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          value={abierto ? texto : etiquetaSel}
          placeholder={placeholder}
          onChange={(e) => {
            setTexto(e.target.value);
            if (!abierto) setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={alTeclado}
          className="campo pl-9 pr-9"
        />
        {valor && !abierto && (
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

      {abierto && (
        <div
          id={listaId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-borde-fuerte bg-panel shadow-media"
        >
          {cargando ? (
            <p className="px-3 py-3 text-sm text-texto-ter">Buscando…</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-3 text-sm text-texto-ter">
              {texto.trim() ? "Sin resultados." : "Escribe para buscar un SKU."}
            </p>
          ) : (
            <ul className="py-1">
              {resultados.map((sku, i) => (
                <li key={sku.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === resaltado}
                    onMouseEnter={() => setResaltado(i)}
                    onClick={() => elegir(sku)}
                    className={`flex w-full items-baseline gap-3 px-3 py-2 text-left transition-colors ${
                      i === resaltado ? "bg-panel-alt" : ""
                    }`}
                  >
                    <span className="font-mono text-xs text-texto-sec">{sku.codigoParlante}</span>
                    <span className="truncate text-sm text-tinta">
                      {sku.nombre ?? sku.producto.nombre}
                    </span>
                  </button>
                </li>
              ))}
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
