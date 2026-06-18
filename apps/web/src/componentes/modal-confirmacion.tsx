"use client";

import { useEffect, useRef } from "react";

interface ModalConfirmacionProps {
  abierto: boolean;
  titulo: string;
  mensaje: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  tono?: "primario" | "peligro";
  procesando?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Modal de confirmación accesible para acciones que requieren aprobación
 * explícita del usuario. Reemplaza a window.confirm para mantener una
 * experiencia consistente con el sistema. Cierra con Escape o clic en el
 * fondo, y bloquea el scroll del cuerpo mientras está abierto.
 */
export function ModalConfirmacion({
  abierto,
  titulo,
  mensaje,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  tono = "primario",
  procesando = false,
  onConfirmar,
  onCancelar,
}: ModalConfirmacionProps): React.JSX.Element | null {
  const botonConfirmar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(evento: KeyboardEvent): void {
      if (evento.key === "Escape" && !procesando) onCancelar();
    }
    document.addEventListener("keydown", alPresionarTecla);
    botonConfirmar.current?.focus();

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", alPresionarTecla);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto, procesando, onCancelar]);

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-titulo"
      aria-describedby="modal-mensaje"
    >
      <div
        className="fixed inset-0 bg-black/40"
        onClick={() => !procesando && onCancelar()}
        aria-hidden
      />
      <div className="panel relative z-10 w-full max-w-md">
        <div className="p-5">
          <h2 id="modal-titulo" className="text-base font-semibold text-tinta">
            {titulo}
          </h2>
          <p id="modal-mensaje" className="mt-2 text-sm text-texto-sec">
            {mensaje}
          </p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancelar}
              disabled={procesando}
              className="btn btn-contorno"
            >
              {textoCancelar}
            </button>
            <button
              ref={botonConfirmar}
              type="button"
              onClick={onConfirmar}
              disabled={procesando}
              className={tono === "peligro" ? "btn btn-peligro" : "btn btn-primario"}
            >
              {textoConfirmar}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
