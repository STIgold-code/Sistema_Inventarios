"use client";

import { Fragment, useCallback, useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  descargarArchivo,
  descargarJson,
  ErrorApi,
  obtenerExistencias,
  type Almacen,
  type ExistenciaSku,
} from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";

const POR_PAGINA = 50;

/** Fecha local AAAA-MM-DD para nombrar archivos descargados. */
function fechaHoy(): string {
  const d = new Date();
  const p = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Vista = "almacen" | "matriz";

/** Cantidad disponible de un SKU en un almacén dado (0 si no tiene posición). */
function disponibleEn(sku: ExistenciaSku, almacenId: string): string {
  const fila = sku.stocks.find((s) => s.almacenId === almacenId);
  return fila ? fila.disponible : "0";
}

/** Valorización de un SKU en un almacén dado (0 si no tiene posición). */
function valorEn(sku: ExistenciaSku, almacenId: string): string {
  const fila = sku.stocks.find((s) => s.almacenId === almacenId);
  return fila ? fila.valorTotal : "0";
}

export default function PaginaExistencias(): React.JSX.Element {
  const [vista, setVista] = useState<Vista>("almacen");
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenId, setAlmacenId] = useState<string>("");

  const [datos, setDatos] = useState<ExistenciaSku[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [valorizadoTotal, setValorizadoTotal] = useState<string>("0");
  const [pagina, setPagina] = useState<number>(1);

  const [busqueda, setBusqueda] = useState<string>("");
  const [terminoActivo, setTerminoActivo] = useState<string>("");
  // "" = todas, "true" = solo renovables, "false" = solo no renovables.
  const [filtroRenovable, setFiltroRenovable] = useState<string>("");

  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (
      paginaPedida: number,
      termino: string,
      almacen: string,
      modo: Vista,
      renovable: string,
    ): Promise<void> => {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await obtenerExistencias({
          pagina: paginaPedida,
          porPagina: POR_PAGINA,
          busqueda: termino || undefined,
          almacenId: modo === "almacen" && almacen ? Number(almacen) : undefined,
          esRenovable: renovable === "" ? undefined : renovable === "true",
        });
        setDatos(respuesta.datos);
        setTotal(respuesta.total);
        setValorizadoTotal(respuesta.valorizadoTotal);
        if (almacenes.length === 0) setAlmacenes(respuesta.almacenes);
      } catch (e) {
        setError(
          e instanceof ErrorApi ? e.message : "No se pudieron cargar las existencias.",
        );
      } finally {
        setCargando(false);
      }
    },
    [almacenes.length],
  );

  useEffect(() => {
    void cargar(pagina, terminoActivo, almacenId, vista, filtroRenovable);
  }, [cargar, pagina, terminoActivo, almacenId, vista, filtroRenovable]);

  function buscar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setPagina(1);
    setTerminoActivo(busqueda.trim());
  }

  function cambiarVista(nueva: Vista): void {
    if (nueva === vista) return;
    setVista(nueva);
    setPagina(1);
  }

  function cambiarAlmacen(valor: string): void {
    setAlmacenId(valor);
    setPagina(1);
  }

  const [exportando, setExportando] = useState<boolean>(false);
  const [exportandoJson, setExportandoJson] = useState<boolean>(false);

  function filtrosExistencias(): string {
    const query = new URLSearchParams();
    if (terminoActivo) query.set("busqueda", terminoActivo);
    if (vista === "almacen" && almacenId) query.set("almacenId", almacenId);
    if (filtroRenovable !== "") query.set("esRenovable", filtroRenovable);
    const cadena = query.toString();
    return cadena ? `?${cadena}` : "";
  }

  async function exportar(): Promise<void> {
    setExportando(true);
    setError(null);
    try {
      await descargarArchivo(
        `/inventario/existencias/export.xlsx${filtrosExistencias()}`,
        "existencias_valorizadas.xlsx",
      );
    } catch (e) {
      setError(
        e instanceof ErrorApi ? e.message : "No se pudo exportar el reporte.",
      );
    } finally {
      setExportando(false);
    }
  }

  async function exportarJson(): Promise<void> {
    setExportandoJson(true);
    setError(null);
    try {
      await descargarJson(
        `/inventario/existencias${filtrosExistencias()}`,
        `existencias_${fechaHoy()}.json`,
      );
    } catch (e) {
      setError(
        e instanceof ErrorApi ? e.message : "No se pudo exportar el reporte.",
      );
    } finally {
      setExportandoJson(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  return (
    <div>
      <EncabezadoPagina
        titulo="Existencias"
        descripcion="Stock de todos los productos por almacén."
      />

      <section className="panel">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Stock general
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({formatearNumero(total)} SKUs)
            </span>
          </span>

          <div className="flex flex-wrap items-center gap-2">
            {/* Toggle de vista */}
            <div
              role="tablist"
              aria-label="Vista de existencias"
              className="inline-flex rounded-md border border-borde bg-panel-alt p-0.5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={vista === "almacen"}
                onClick={() => cambiarVista("almacen")}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  vista === "almacen" ? "bg-panel text-tinta shadow-sm" : "text-texto-sec"
                }`}
              >
                Por almacén
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={vista === "matriz"}
                onClick={() => cambiarVista("matriz")}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  vista === "matriz" ? "bg-panel text-tinta shadow-sm" : "text-texto-sec"
                }`}
              >
                Matriz
              </button>
            </div>

            {vista === "almacen" && (
              <select
                aria-label="Almacén"
                value={almacenId}
                onChange={(e) => cambiarAlmacen(e.target.value)}
                className="campo w-48"
              >
                <option value="">Todos los almacenes</option>
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </select>
            )}

            <select
              aria-label="Renovabilidad"
              value={filtroRenovable}
              onChange={(e) => {
                setPagina(1);
                setFiltroRenovable(e.target.value);
              }}
              className="campo w-44"
            >
              <option value="">Renovables y no</option>
              <option value="true">Solo renovables</option>
              <option value="false">Solo no renovables</option>
            </select>

            <form onSubmit={buscar} className="flex gap-2" role="search">
              <label htmlFor="busqueda" className="sr-only">
                Buscar producto
              </label>
              <input
                id="busqueda"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="campo w-60"
              />
              <button type="submit" className="btn btn-contorno">
                Buscar
              </button>
            </form>

            <button
              type="button"
              onClick={() => void exportar()}
              disabled={exportando}
              className="btn btn-contorno"
            >
              {exportando ? "Exportando…" : "Exportar a Excel"}
            </button>

            <button
              type="button"
              onClick={() => void exportarJson()}
              disabled={exportandoJson}
              className="btn btn-contorno"
            >
              {exportandoJson ? "Exportando…" : "Exportar JSON"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {error ? (
            <div role="alert" className="aviso aviso-peligro m-5">
              <span>{error}</span>
            </div>
          ) : cargando ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">Cargando…</p>
          ) : datos.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">
              No se encontraron existencias.
            </p>
          ) : vista === "almacen" ? (
            <TablaPorAlmacen datos={datos} valorizadoTotal={valorizadoTotal} />
          ) : (
            <TablaMatriz
              datos={datos}
              almacenes={almacenes}
              valorizadoTotal={valorizadoTotal}
            />
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

/** Vista lista: una fila por SKU con su disponible, comprometido, costo y valor. */
function TablaPorAlmacen({
  datos,
  valorizadoTotal,
}: {
  datos: ExistenciaSku[];
  valorizadoTotal: string;
}): React.JSX.Element {
  return (
    <table className="tabla-datos">
      <thead>
        <tr>
          <th>Código</th>
          <th>Producto</th>
          <th>Unidad</th>
          <th className="text-right">Disponible (buen uso)</th>
          <th className="text-right">Deteriorado</th>
          <th className="text-right">Comprometido</th>
          <th className="text-right">Costo prom. (S/)</th>
          <th className="text-right">Valor (S/)</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((sku) => (
          <tr key={sku.skuId}>
            <td className="font-mono text-texto">{sku.codigoParlante}</td>
            <td className="text-tinta">{sku.nombre}</td>
            <td className="text-texto-sec">{sku.unidad}</td>
            <td className="text-right font-mono text-tinta">
              {formatearNumero(sku.totalDisponible)}
            </td>
            <td className="text-right font-mono">
              {Number(sku.totalDeteriorado) > 0 ? (
                <span className="insignia insignia-peligro">
                  {formatearNumero(sku.totalDeteriorado)}
                </span>
              ) : (
                <span className="text-texto-ter">—</span>
              )}
            </td>
            <td className="text-right font-mono text-texto-sec">
              {formatearNumero(sku.totalComprometido)}
            </td>
            <td className="text-right font-mono text-texto-sec">
              {formatearSoles(sku.costoPromedio)}
            </td>
            <td className="text-right font-mono text-tinta">
              {formatearSoles(sku.valorTotal)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={7} className="text-right font-semibold text-texto-sec">
            Total valorizado
          </td>
          <td className="text-right font-mono font-semibold text-tinta">
            {formatearSoles(valorizadoTotal)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/**
 * Vista matriz: por almacén muestra disponible y valor (S/), más el total de
 * unidades y el total valorizado por SKU.
 */
function TablaMatriz({
  datos,
  almacenes,
  valorizadoTotal,
}: {
  datos: ExistenciaSku[];
  almacenes: Almacen[];
  valorizadoTotal: string;
}): React.JSX.Element {
  return (
    <table className="tabla-datos">
      <thead>
        <tr>
          <th rowSpan={2}>Código</th>
          <th rowSpan={2}>Producto</th>
          {almacenes.map((a) => (
            <th key={a.id} className="text-center" colSpan={2} title={a.nombre}>
              {a.codigo}
            </th>
          ))}
          <th className="text-right" rowSpan={2}>
            Total unid.
          </th>
          <th className="text-right" rowSpan={2}>
            Deteriorado
          </th>
          <th className="text-right" rowSpan={2}>
            Valor (S/)
          </th>
        </tr>
        <tr>
          {almacenes.map((a) => (
            <Fragment key={a.id}>
              <th className="text-right">Unid.</th>
              <th className="text-right">S/</th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {datos.map((sku) => (
          <tr key={sku.skuId}>
            <td className="font-mono text-texto">{sku.codigoParlante}</td>
            <td className="text-tinta">{sku.nombre}</td>
            {almacenes.map((a) => (
              <Fragment key={a.id}>
                <td className="text-right font-mono text-texto-sec">
                  {formatearNumero(disponibleEn(sku, a.id))}
                </td>
                <td className="text-right font-mono text-texto-ter">
                  {formatearSoles(valorEn(sku, a.id))}
                </td>
              </Fragment>
            ))}
            <td className="text-right font-mono font-semibold text-tinta">
              {formatearNumero(sku.totalDisponible)}
            </td>
            <td className="text-right font-mono">
              {Number(sku.totalDeteriorado) > 0 ? (
                <span className="insignia insignia-peligro">
                  {formatearNumero(sku.totalDeteriorado)}
                </span>
              ) : (
                <span className="text-texto-ter">—</span>
              )}
            </td>
            <td className="text-right font-mono font-semibold text-tinta">
              {formatearSoles(sku.valorTotal)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2 + almacenes.length * 2 + 2} className="text-right font-semibold text-texto-sec">
            Total valorizado
          </td>
          <td className="text-right font-mono font-semibold text-tinta">
            {formatearSoles(valorizadoTotal)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
