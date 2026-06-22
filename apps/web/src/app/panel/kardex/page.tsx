"use client";

import { useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  descargarArchivo,
  descargarJson,
  ErrorApi,
  obtenerAlmacenes,
  obtenerKardex,
  type Almacen,
  type FilaKardex,
  type Sku,
} from "@/lib/api";
import { formatearDolares, formatearNumero, formatearSoles } from "@/lib/formato";

/** Convierte una fecha ISO a "dd/mm/aaaa hh:mm". */
function formatearFecha(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => n.toString().padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PaginaKardex(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenId, setAlmacenId] = useState<number | null>(null); // null = todos
  const [sku, setSku] = useState<Sku | null>(null);
  const [filas, setFilas] = useState<FilaKardex[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [tipoKardex, setTipoKardex] = useState<"fisico" | "valorizado">("valorizado");
  const [enUsd, setEnUsd] = useState<boolean>(false);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [consultado, setConsultado] = useState<boolean>(false);

  useEffect(() => {
    void (async () => {
      try {
        setAlmacenes(await obtenerAlmacenes());
      } catch {
        /* sin almacenes: queda solo "Todos" */
      }
    })();
  }, []);

  // Consulta el kardex cuando cambia el SKU o el almacén.
  useEffect(() => {
    if (!sku) {
      setFilas([]);
      setConsultado(false);
      return;
    }
    setCargando(true);
    setError(null);
    setConsultado(true);
    setFiltroTipo("");
    setTipoKardex("valorizado");
    setEnUsd(false);
    void (async () => {
      try {
        setFilas(await obtenerKardex(sku.id, almacenId));
      } catch (err) {
        setError(err instanceof ErrorApi ? err.message : "No se pudo cargar el kardex.");
        setFilas([]);
      } finally {
        setCargando(false);
      }
    })();
  }, [sku, almacenId]);

  const tipos = useMemo(
    () => [...new Set(filas.map((f) => f.tipo))].sort(),
    [filas],
  );
  const filasVisibles = useMemo(
    () => (filtroTipo ? filas.filter((f) => f.tipo === filtroTipo) : filas),
    [filas, filtroTipo],
  );
  // El toggle USD solo tiene sentido si al menos un movimiento trae valor en dolares.
  const hayUsd = useMemo(
    () => filas.some((f) => f.costoUnitarioUsd !== null),
    [filas],
  );
  const valorizado = tipoKardex === "valorizado";

  const [exportando, setExportando] = useState<boolean>(false);
  const [exportandoJson, setExportandoJson] = useState<boolean>(false);

  function filtrosKardex(): string {
    const query = new URLSearchParams({ skuId: String(sku!.id) });
    if (almacenId !== null) query.set("almacenId", String(almacenId));
    return query.toString();
  }

  async function exportar(): Promise<void> {
    if (!sku) return;
    setExportando(true);
    setError(null);
    try {
      await descargarArchivo(
        `/inventario/kardex/export.xlsx?${filtrosKardex()}`,
        "kardex.xlsx",
      );
    } catch (e) {
      setError(
        e instanceof ErrorApi ? e.message : "No se pudo exportar el kardex.",
      );
    } finally {
      setExportando(false);
    }
  }

  async function exportarJson(): Promise<void> {
    if (!sku) return;
    setExportandoJson(true);
    setError(null);
    try {
      const fecha = new Date();
      const p = (n: number): string => n.toString().padStart(2, "0");
      const hoy = `${fecha.getFullYear()}-${p(fecha.getMonth() + 1)}-${p(fecha.getDate())}`;
      await descargarJson(
        `/inventario/kardex?${filtrosKardex()}`,
        `kardex_${sku.codigoParlante}_${hoy}.json`,
      );
    } catch (e) {
      setError(
        e instanceof ErrorApi ? e.message : "No se pudo exportar el kardex.",
      );
    } finally {
      setExportandoJson(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Kardex valorizado"
        descripcion="Historial de movimientos y saldos por SKU y almacén."
      />

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-96">
          <label className="etiqueta-campo">Producto</label>
          <SelectorSku valor={sku} onSeleccionar={setSku} />
        </div>
        <div className="w-full sm:w-56">
          <label htmlFor="almacen" className="etiqueta-campo">
            Almacén
          </label>
          <select
            id="almacen"
            className="campo"
            value={almacenId === null ? "" : String(almacenId)}
            onChange={(e) => setAlmacenId(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Todos los almacenes</option>
            {almacenes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo} — {a.nombre}
              </option>
            ))}
          </select>
        </div>
        {consultado && filas.length > 0 && (
          <div className="w-full sm:w-48">
            <label htmlFor="tipo" className="etiqueta-campo">
              Tipo de movimiento
            </label>
            <select
              id="tipo"
              className="campo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="">Todos</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
        {consultado && filas.length > 0 && (
          <div className="w-full sm:w-auto">
            <span className="etiqueta-campo">Tipo de kardex</span>
            <div className="inline-flex rounded-lg border border-borde-fuerte bg-panel p-0.5">
              <button
                type="button"
                aria-pressed={tipoKardex === "fisico"}
                onClick={() => setTipoKardex("fisico")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tipoKardex === "fisico"
                    ? "bg-tinta text-white shadow-sm"
                    : "text-texto-sec hover:text-texto"
                }`}
              >
                Físico (unidades)
              </button>
              <button
                type="button"
                aria-pressed={tipoKardex === "valorizado"}
                onClick={() => setTipoKardex("valorizado")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  tipoKardex === "valorizado"
                    ? "bg-tinta text-white shadow-sm"
                    : "text-texto-sec hover:text-texto"
                }`}
              >
                Valorizado (costo)
              </button>
            </div>
          </div>
        )}
        {consultado && valorizado && hayUsd && (
          <label className="flex items-center gap-2 pb-2 text-sm text-texto-sec">
            <input
              type="checkbox"
              checked={enUsd}
              onChange={(e) => setEnUsd(e.target.checked)}
            />
            Ver valores en USD
          </label>
        )}
        {consultado && filas.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => void exportar()}
              disabled={exportando}
              className="btn btn-contorno ml-auto"
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
          </>
        )}
      </div>

      {error && (
        <div role="alert" className="aviso aviso-peligro mt-5">
          <span>{error}</span>
        </div>
      )}

      {!consultado && !error && (
        <div className="mt-5 flex flex-col items-center justify-center rounded-lg border border-dashed border-borde-fuerte bg-panel/50 px-6 py-16 text-center">
          <p className="text-sm font-medium text-texto">Busca un producto para ver su kardex</p>
          <p className="mt-1 max-w-sm text-sm text-texto-sec">
            Escribe el código o el nombre, elige el almacén, y el historial valorizado aparecerá aquí.
          </p>
        </div>
      )}

      {cargando && <p className="mt-5 text-sm text-texto-ter">Cargando kardex…</p>}

      {consultado && !cargando && !error && (
        <section className="panel mt-5">
          <div className="panel-cabecera">
            <span className="panel-titulo">Movimientos</span>
            <span className="text-xs text-texto-sec">
              {filasVisibles.length} de {filas.length} registro{filas.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            {filasVisibles.length === 0 ? (
              <p className="px-5 py-12 text-center text-sm text-texto-ter">
                {filas.length === 0
                  ? "Este producto no tiene movimientos en el almacén seleccionado."
                  : "No hay movimientos del tipo seleccionado."}
              </p>
            ) : (
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Almacén</th>
                    <th>Tipo</th>
                    <th>Op. SUNAT</th>
                    <th>Referencia</th>
                    <th className="num">Entradas</th>
                    <th className="num">Salidas</th>
                    {valorizado && (
                      <>
                        <th className="num">{enUsd ? "Costo unit. USD" : "Costo unit."}</th>
                        <th className="num">{enUsd ? "Costo total USD" : "Costo total"}</th>
                      </>
                    )}
                    <th className="num border-l border-borde">Saldo cant.</th>
                    {valorizado && (
                      <>
                        <th className="num">Saldo C.U.</th>
                        <th className="num">Saldo total</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filasVisibles.map((fila, indice) => (
                    <tr key={`${fila.almacen}-${fila.fecha}-${indice}`}>
                      <td className="whitespace-nowrap font-mono text-xs text-texto-sec">
                        {formatearFecha(fila.fecha)}
                      </td>
                      <td className="font-mono text-xs text-texto-sec">{fila.almacen}</td>
                      <td className="whitespace-nowrap text-tinta">{fila.tipo}</td>
                      <td className="font-mono text-texto-sec">{fila.tipoOperacionSunat}</td>
                      <td className="text-xs text-texto-sec">{fila.referencia}</td>
                      <td className="num text-texto">
                        {Number(fila.cantidadEntrada) > 0
                          ? formatearNumero(fila.cantidadEntrada)
                          : "—"}
                      </td>
                      <td className="num text-texto">
                        {Number(fila.cantidadSalida) > 0
                          ? formatearNumero(fila.cantidadSalida)
                          : "—"}
                      </td>
                      {valorizado && (
                        <>
                          <td className="num text-texto">
                            {enUsd
                              ? fila.costoUnitarioUsd === null
                                ? "—"
                                : formatearDolares(fila.costoUnitarioUsd)
                              : formatearSoles(fila.costoUnitario)}
                          </td>
                          <td className="num text-texto">
                            {enUsd
                              ? fila.costoTotalUsd === null
                                ? "—"
                                : formatearDolares(fila.costoTotalUsd)
                              : formatearSoles(fila.costoTotal)}
                          </td>
                        </>
                      )}
                      <td className="num border-l border-borde bg-panel-alt font-semibold text-tinta">
                        {fila.saldoCantidad}
                      </td>
                      {valorizado && (
                        <>
                          <td className="num bg-panel-alt font-semibold text-tinta">
                            {formatearSoles(fila.saldoCostoUnitario)}
                          </td>
                          <td className="num bg-panel-alt font-semibold text-tinta">
                            {formatearSoles(fila.saldoCostoTotal)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
