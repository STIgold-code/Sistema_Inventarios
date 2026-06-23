import type { ReactNode } from "react";

/**
 * Primitivas de presentación de detalle. Reemplazan las listas "dl divide-y"
 * apretadas que cada página de detalle redefinía por su cuenta (FilaDato,
 * Seccion, valor/ov…). Dan jerarquía clara, agrupación legible y buen
 * comportamiento responsive dentro del panel lateral.
 */

/** Devuelve el texto o un guion si está vacío/nulo. Único helper compartido. */
export function mostrar(texto: string | null | undefined): string {
  return texto && texto.trim() !== "" ? texto : "—";
}

/** Sección de detalle con cabecera propia (filo dorado de marca). */
export function Ficha({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="ficha">
      <header className="ficha-cabecera">
        <h3 className="ficha-titulo">{titulo}</h3>
        {accion && <span className="ml-auto">{accion}</span>}
      </header>
      <div className="ficha-cuerpo">{children}</div>
    </section>
  );
}

/** Lista de pares etiqueta/valor. Apila en móvil, alinea desde sm. */
export function ListaDatos({ children }: { children: ReactNode }): React.JSX.Element {
  return <dl className="lista-datos">{children}</dl>;
}

/** Fila etiqueta/valor dentro de una ListaDatos. */
export function FilaDato({
  etiqueta,
  children,
  mono = false,
}: {
  etiqueta: string;
  children: ReactNode;
  /** Renderiza el valor en monoespaciada tabular (códigos, números). */
  mono?: boolean;
}): React.JSX.Element {
  return (
    <div className="fila-dato">
      <dt className="fila-dato-etiqueta">{etiqueta}</dt>
      <dd className={`fila-dato-valor${mono ? " font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

/** Conjunto de métricas clave (stock, total, valor…). Lo primero que se busca. */
export function BloqueMetricas({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="bloque-metricas">{children}</div>;
}

/** Métrica destacada: etiqueta breve + valor grande tabular. */
export function Metrica({
  etiqueta,
  valor,
  pie,
  acento = false,
}: {
  etiqueta: string;
  valor: ReactNode;
  pie?: ReactNode;
  /** Resalta la métrica principal con el acento dorado de marca. */
  acento?: boolean;
}): React.JSX.Element {
  return (
    <div className={`metrica${acento ? " metrica-acento" : ""}`}>
      <span className="metrica-etiqueta">{etiqueta}</span>
      <span className="metrica-valor">{valor}</span>
      {pie && <span className="metrica-pie">{pie}</span>}
    </div>
  );
}

/**
 * Envoltura de tabla con scroll horizontal contenido. Evita que las tablas
 * densas (stock por almacén, líneas, capas FIFO) desborden el panel o la
 * pantalla: el scroll queda dentro de un marco con bordes redondeados.
 */
export function TablaResponsive({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="tabla-envoltura" role="region" tabIndex={0} aria-label="Tabla con desplazamiento horizontal">
      {children}
    </div>
  );
}
