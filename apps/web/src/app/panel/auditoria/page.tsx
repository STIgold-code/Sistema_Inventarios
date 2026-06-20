"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  obtenerAuditoria,
  type RegistroAuditoria,
} from "@/lib/api";
import { formatearNumero } from "@/lib/formato";

const POR_PAGINA = 50;

/**
 * Catálogo de entidades de gobierno auditadas. El backend acepta cualquier
 * texto, pero estas son las entidades que los módulos registran hoy.
 */
const ENTIDADES: readonly string[] = [
  "REQUERIMIENTO",
  "ORDEN_COMPRA",
  "VALE_SALIDA",
  "ORDEN_VENTA",
  "DEVOLUCION",
  "MOVIMIENTO",
  "TRASLADO",
  "CIERRE_PERIODO",
];

/**
 * Catálogo de acciones de gobierno. El backend acepta texto libre; este es el
 * conjunto conocido de acciones que los módulos emiten.
 */
const ACCIONES: readonly string[] = [
  "CREAR",
  "APROBAR",
  "RECHAZAR",
  "AUTORIZAR",
  "DESPACHAR",
  "RECIBIR",
  "ANULAR",
  "AJUSTE_MANUAL",
  "MERMA",
  "MARCAR_DETERIORADO",
  "RECUPERAR_DETERIORADO",
  "DAR_DE_BAJA_DETERIORADO",
  "CERRAR",
  "REABRIR",
];

/** Color de la insignia según la naturaleza de la acción. */
function claseInsignia(accion: string): string {
  if (accion.includes("ANULAR") || accion.includes("RECHAZAR")) {
    return "insignia insignia-peligro";
  }
  if (accion.includes("APROBAR") || accion.includes("AUTORIZAR")) {
    return "insignia insignia-exito";
  }
  if (accion === "CREAR" || accion.includes("RECIBIR")) {
    return "insignia insignia-info";
  }
  if (
    accion.includes("MERMA") ||
    accion.includes("DETERIORADO") ||
    accion.includes("AJUSTE")
  ) {
    return "insignia insignia-oro";
  }
  return "insignia insignia-neutra";
}

function etiquetaAccion(accion: string): string {
  return accion.replace(/_/g, " ");
}

function etiquetaEntidad(entidad: string): string {
  return entidad.replace(/_/g, " ");
}

function formatearFechaHora(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso;
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(fecha);
}

/** Convierte "YYYY-MM-DD" a ISO de inicio de día; "" → undefined. */
function inicioDia(valor: string): string | undefined {
  return valor ? new Date(`${valor}T00:00:00`).toISOString() : undefined;
}

/** Convierte "YYYY-MM-DD" a ISO de fin de día; "" → undefined. */
function finDia(valor: string): string | undefined {
  return valor ? new Date(`${valor}T23:59:59.999`).toISOString() : undefined;
}

export default function PaginaAuditoria(): React.JSX.Element {
  const [datos, setDatos] = useState<RegistroAuditoria[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [pagina, setPagina] = useState<number>(1);

  // Filtros aplicados (los que viajan a la API).
  const [entidad, setEntidad] = useState<string>("");
  const [accion, setAccion] = useState<string>("");
  const [usuarioId, setUsuarioId] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  // Usuarios vistos en cualquier carga, para poblar el selector de usuario.
  const [usuarios, setUsuarios] = useState<Map<string, string>>(new Map());

  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (
      paginaPedida: number,
      filtroEntidad: string,
      filtroAccion: string,
      filtroUsuario: string,
      filtroDesde: string,
      filtroHasta: string,
    ): Promise<void> => {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await obtenerAuditoria({
          pagina: paginaPedida,
          porPagina: POR_PAGINA,
          entidad: filtroEntidad || undefined,
          accion: filtroAccion || undefined,
          usuarioId: filtroUsuario ? Number(filtroUsuario) : undefined,
          desde: inicioDia(filtroDesde),
          hasta: finDia(filtroHasta),
        });
        setDatos(respuesta.datos);
        setTotal(respuesta.total);
        setUsuarios((previo) => {
          const mapa = new Map(previo);
          for (const r of respuesta.datos) {
            mapa.set(r.usuario.id, r.usuario.nombre);
          }
          return mapa;
        });
      } catch (e) {
        setError(
          e instanceof ErrorApi
            ? e.message
            : "No se pudo cargar la bitácora de auditoría.",
        );
      } finally {
        setCargando(false);
      }
    },
    [],
  );

  useEffect(() => {
    void cargar(pagina, entidad, accion, usuarioId, desde, hasta);
  }, [cargar, pagina, entidad, accion, usuarioId, desde, hasta]);

  function cambiarFiltro(actualizar: () => void): void {
    setPagina(1);
    actualizar();
  }

  function limpiarRango(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
  }

  const opcionesUsuario = useMemo(
    () =>
      Array.from(usuarios.entries()).sort((a, b) =>
        a[1].localeCompare(b[1], "es"),
      ),
    [usuarios],
  );

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <EncabezadoPagina
        titulo="Auditoría"
        descripcion="Bitácora de acciones de gobierno: aprobaciones, despachos, anulaciones y ajustes."
      />

      <section className="panel">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Registros
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({formatearNumero(total)})
            </span>
          </span>

          <form
            onSubmit={limpiarRango}
            className="flex flex-wrap items-center gap-2"
          >
            <select
              aria-label="Entidad"
              value={entidad}
              onChange={(e) =>
                cambiarFiltro(() => setEntidad(e.target.value))
              }
              className="campo w-44"
            >
              <option value="">Todas las entidades</option>
              {ENTIDADES.map((ent) => (
                <option key={ent} value={ent}>
                  {etiquetaEntidad(ent)}
                </option>
              ))}
            </select>

            <select
              aria-label="Acción"
              value={accion}
              onChange={(e) => cambiarFiltro(() => setAccion(e.target.value))}
              className="campo w-44"
            >
              <option value="">Todas las acciones</option>
              {ACCIONES.map((acc) => (
                <option key={acc} value={acc}>
                  {etiquetaAccion(acc)}
                </option>
              ))}
            </select>

            <select
              aria-label="Usuario"
              value={usuarioId}
              onChange={(e) =>
                cambiarFiltro(() => setUsuarioId(e.target.value))
              }
              className="campo w-44"
            >
              <option value="">Todos los usuarios</option>
              {opcionesUsuario.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>

            <label htmlFor="desde" className="sr-only">
              Desde
            </label>
            <input
              id="desde"
              type="date"
              value={desde}
              onChange={(e) => cambiarFiltro(() => setDesde(e.target.value))}
              className="campo w-40"
            />
            <label htmlFor="hasta" className="sr-only">
              Hasta
            </label>
            <input
              id="hasta"
              type="date"
              value={hasta}
              onChange={(e) => cambiarFiltro(() => setHasta(e.target.value))}
              className="campo w-40"
            />
          </form>
        </div>

        <div className="overflow-x-auto">
          {error ? (
            <div role="alert" className="aviso aviso-peligro m-5">
              <span>{error}</span>
            </div>
          ) : cargando ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">
              Cargando…
            </p>
          ) : datos.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">
              No se encontraron registros de auditoría.
            </p>
          ) : (
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Acción</th>
                  <th>Entidad</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap font-mono text-xs text-texto-sec">
                      {formatearFechaHora(r.creadoEn)}
                    </td>
                    <td className="text-sm text-tinta">{r.usuario.nombre}</td>
                    <td>
                      <span className={claseInsignia(r.accion)}>
                        {etiquetaAccion(r.accion)}
                      </span>
                    </td>
                    <td className="text-xs text-texto-sec">
                      {etiquetaEntidad(r.entidad)}
                      {r.entidadId !== null && (
                        <span className="ml-1 font-mono text-texto-ter">
                          #{r.entidadId}
                        </span>
                      )}
                    </td>
                    <td className="text-xs text-texto-sec">
                      {r.detalle ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!cargando && !error && total > POR_PAGINA && (
          <div className="flex items-center justify-between border-t border-borde px-5 py-3 text-sm">
            <span className="text-texto-ter">
              Página {pagina} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1}
                className="btn btn-contorno h-8"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                disabled={pagina >= totalPaginas}
                className="btn btn-contorno h-8"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
