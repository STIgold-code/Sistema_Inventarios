interface Props {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
}

/** Encabezado estandar de cada modulo: titulo claro + acciones a la derecha. */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
}: Props): React.JSX.Element {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[1.4rem] font-semibold text-tinta">{titulo}</h1>
        {descripcion && (
          <p className="mt-1 max-w-2xl text-sm text-texto-sec">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </header>
  );
}
