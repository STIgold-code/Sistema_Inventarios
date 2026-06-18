"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  obtenerExistencias,
  type Almacen,
  type ExistenciaSku,
} from "@/lib/api";
import { formatearNumero } from "@/lib/formato";

const POR_PAGINA = 50;

type Vista = "almacen" | "matriz";

/** Cantidad disponible de un SKU en un almacén dado (0 si no tiene posición). */
function disponibleEn(sku: ExistenciaSku, almacenId: string): string {
  const fila = sku.stocks.find((s) => s.almacenId === almacenId);
  return fila ? fila.disponible : "0";
}

export default function PaginaExistencias(): React.JSX.Element {
  const [vista, setVista] = useState<Vista>("almacen");
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenId, setAlmacenId] = useState<string>("");

  const [datos, setDatos] = useState<ExistenciaSku[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [pagina, setPagina] = useState<number>(1);

  const [busqueda, setBusqueda] = useState<string>("");
  const [terminoActivo, setTerminoActivo] = useState<string>("");

  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (paginaPedida: number, termino: string, almacen: string, modo: Vista): Promise<void> => {
      setCargando(true);
      setError(null);
      try {
        const respuesta = await obtenerExistencias({
          pagina: paginaPedida,
          porPagina: POR_PAGINA,
          busqueda: termino || undefined,
          almacenId: modo === "almacen" && almacen ? Number(almacen) : undefined,
        });
        setDatos(respuesta.datos);
        setTotal(respuesta.total);
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
    void cargar(pagina, terminoActivo, almacenId, vista);
  }, [cargar, pagina, terminoActivo, almacenId, vista]);

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
            <TablaPorAlmacen datos={datos} />
          ) : (
            <TablaMatriz datos={datos} almacenes={almacenes} />
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

/** Vista lista: una fila por SKU con su disponible y comprometido totales. */
function TablaPorAlmacen({ datos }: { datos: ExistenciaSku[] }): React.JSX.Element {
  return (
    <table className="tabla-datos">
      <thead>
        <tr>
          <th>Código</th>
          <th>Producto</th>
          <th>Unidad</th>
          <th className="text-right">Disponible</th>
          <th className="text-right">Comprometido</th>
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
            <td className="text-right font-mono text-texto-sec">
              {formatearNumero(sku.totalComprometido)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Vista matriz: una columna por almacén + total. */
function TablaMatriz({
  datos,
  almacenes,
}: {
  datos: ExistenciaSku[];
  almacenes: Almacen[];
}): React.JSX.Element {
  return (
    <table className="tabla-datos">
      <thead>
        <tr>
          <th>Código</th>
          <th>Producto</th>
          {almacenes.map((a) => (
            <th key={a.id} className="text-right" title={a.nombre}>
              {a.codigo}
            </th>
          ))}
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {datos.map((sku) => (
          <tr key={sku.skuId}>
            <td className="font-mono text-texto">{sku.codigoParlante}</td>
            <td className="text-tinta">{sku.nombre}</td>
            {almacenes.map((a) => (
              <td key={a.id} className="text-right font-mono text-texto-sec">
                {formatearNumero(disponibleEn(sku, a.id))}
              </td>
            ))}
            <td className="text-right font-mono font-semibold text-tinta">
              {formatearNumero(sku.totalDisponible)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
