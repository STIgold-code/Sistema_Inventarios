"use client";

import { usePathname } from "next/navigation";
import { colorDeRuta, type ColorModulo } from "@/lib/modulos";

interface Props {
  titulo: string;
  descripcion?: string;
  acciones?: React.ReactNode;
  /**
   * Color de módulo para el acento. Por defecto se deriva de la ruta actual,
   * de modo que el sidebar y la cabecera comparten el mismo color al entrar a
   * un módulo. Pásalo solo para forzar un color distinto.
   */
  color?: ColorModulo;
}

/**
 * Encabezado estándar de cada módulo: filo de acento del color del módulo +
 * título claro + acciones a la derecha. El color es refuerzo de orientación;
 * el título de texto sigue siendo el dato principal.
 */
export function EncabezadoPagina({
  titulo,
  descripcion,
  acciones,
  color,
}: Props): React.JSX.Element {
  const pathname = usePathname();
  const colorModulo = color ?? colorDeRuta(pathname);

  return (
    <header
      data-modulo={colorModulo}
      className="mb-6 flex flex-wrap items-start justify-between gap-4"
    >
      <div>
        {/* Filo de acento del módulo: ata visualmente la página al sidebar. */}
        <span className="cabecera-acento mb-2.5 block" aria-hidden />
        <h1 className="text-[1.4rem] font-semibold text-tinta">{titulo}</h1>
        {descripcion && (
          <p className="mt-1 max-w-2xl text-sm text-texto-sec">{descripcion}</p>
        )}
      </div>
      {acciones && <div className="flex items-center gap-2">{acciones}</div>}
    </header>
  );
}
