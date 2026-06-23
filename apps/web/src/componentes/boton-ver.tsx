interface Props {
  onVer: () => void;
  /** aria-label descriptivo, ej. "Ver detalle del producto". */
  etiqueta?: string;
}

/**
 * Botón explícito y visible "Ver" para abrir el detalle de una fila. Reemplaza
 * el patrón de fila clicleable (affordance oculta), dejando una única acción
 * obvia para usuarios no técnicos. Compacto para encajar en filas de tabla.
 */
export function BotonVer({ onVer, etiqueta }: Props): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onVer}
      aria-label={etiqueta}
      className="btn btn-contorno inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Ver
    </button>
  );
}
