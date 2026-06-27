/**
 * Fuente única de verdad de la navegación por módulos y su wayfinding por color.
 *
 * Tanto el sidebar (apps/web/src/app/panel/layout.tsx) como la cabecera de
 * página (apps/web/src/componentes/encabezado-pagina.tsx) derivan el módulo y
 * su color de acento desde aquí. Así, al entrar a una ruta, el grupo del
 * sidebar y el encabezado comparten exactamente el mismo color.
 *
 * El color es REFUERZO de orientación, nunca el único dato: siempre se
 * mantienen las etiquetas de texto. El dorado de marca queda reservado para la
 * ACCIÓN (botones primarios); los colores de módulo son secundarios y apagados.
 */

/** Identificador de color de módulo. Mapea 1:1 a las CSS vars --modulo-*. */
export type ColorModulo =
  | "marca"
  | "datos"
  | "movimientos"
  | "consultas"
  | "proceso"
  | "utilitarios";

export interface Enlace {
  href: string;
  etiqueta: string;
}

export interface ModuloNav {
  titulo: string;
  color: ColorModulo;
  enlaces: ReadonlyArray<Enlace>;
}

/** Acceso directo, fuera de los módulos. Usa el color neutro de marca. */
export const INICIO: Enlace = { href: "/panel", etiqueta: "Inicio" };

/**
 * Módulos padre, espejo del modelo de SISALM. "Movimientos" agrupa todo lo
 * transaccional (compras, salidas, traslados, ajustes…).
 */
export const MODULOS: readonly ModuloNav[] = [
  {
    titulo: "Datos base",
    color: "datos",
    enlaces: [
      { href: "/panel/productos", etiqueta: "Productos" },
      { href: "/panel/familias", etiqueta: "Familias" },
      { href: "/panel/series", etiqueta: "Series" },
      { href: "/panel/proveedores", etiqueta: "Proveedores" },
      { href: "/panel/clientes", etiqueta: "Clientes" },
      { href: "/panel/vendedores", etiqueta: "Vendedores" },
      { href: "/panel/transportistas", etiqueta: "Transportistas" },
      { href: "/panel/almacenes", etiqueta: "Almacenes y zonas" },
      { href: "/panel/tipo-cambio", etiqueta: "Tipo de cambio" },
    ],
  },
  {
    titulo: "Movimientos",
    color: "movimientos",
    enlaces: [
      { href: "/panel/requerimientos", etiqueta: "Requerimientos" },
      { href: "/panel/compras", etiqueta: "Compras (entradas)" },
      { href: "/panel/vales", etiqueta: "Vales de salida" },
      { href: "/panel/ventas", etiqueta: "Ventas" },
      { href: "/panel/traslados", etiqueta: "Traslados" },
      { href: "/panel/transferencias-codigo", etiqueta: "Transferencia de código" },
      { href: "/panel/devoluciones", etiqueta: "Devoluciones" },
      { href: "/panel/devoluciones-proveedor", etiqueta: "Devoluciones a proveedor" },
      { href: "/panel/ordenes-trabajo", etiqueta: "Órdenes de trabajo" },
      { href: "/panel/condicion", etiqueta: "Condición de existencias" },
      { href: "/panel/conteos", etiqueta: "Conteos" },
      { href: "/panel/guias", etiqueta: "Guías de remisión" },
      { href: "/panel/movimientos", etiqueta: "Ajustes y consulta" },
    ],
  },
  {
    titulo: "Consultas y reportes",
    color: "consultas",
    enlaces: [
      { href: "/panel/existencias", etiqueta: "Existencias" },
      { href: "/panel/kardex", etiqueta: "Kardex" },
      { href: "/panel/reposicion", etiqueta: "Reposición y ABC" },
      { href: "/panel/rentabilidad", etiqueta: "Rentabilidad" },
      { href: "/panel/antiguedad", etiqueta: "Antigüedad de stock" },
      { href: "/panel/proyeccion-compra", etiqueta: "Proyección de compra" },
      { href: "/panel/kardex-anual", etiqueta: "Kardex anual" },
      { href: "/panel/reportes", etiqueta: "Reportes" },
    ],
  },
  {
    titulo: "Proceso mensual",
    color: "proceso",
    enlaces: [
      { href: "/panel/cierres", etiqueta: "Cierre mensual" },
      { href: "/panel/contabilidad", etiqueta: "Asientos contables" },
    ],
  },
  {
    titulo: "Utilitarios",
    color: "utilitarios",
    enlaces: [
      { href: "/panel/importador", etiqueta: "Importador" },
      { href: "/panel/activos", etiqueta: "Activos fijos" },
      { href: "/panel/auditoria", etiqueta: "Auditoría" },
    ],
  },
];

/** Indica si un enlace está activo según la ruta actual. */
export function esActivo(href: string, pathname: string): boolean {
  return href === "/panel" ? pathname === "/panel" : pathname.startsWith(href);
}

/** Título del módulo que contiene la ruta actual (o null si es Inicio/desconocida). */
export function moduloDeRuta(pathname: string): string | null {
  for (const modulo of MODULOS) {
    if (modulo.enlaces.some((e) => esActivo(e.href, pathname))) return modulo.titulo;
  }
  return null;
}

/**
 * Color de módulo de la ruta actual. Cae en "marca" para Inicio o rutas que no
 * pertenecen a ningún módulo (neutro, sin gritar).
 */
export function colorDeRuta(pathname: string): ColorModulo {
  for (const modulo of MODULOS) {
    if (modulo.enlaces.some((e) => esActivo(e.href, pathname))) return modulo.color;
  }
  return "marca";
}
