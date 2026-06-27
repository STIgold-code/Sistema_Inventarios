"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ErrorApi, obtenerProyeccionCompra, type ReporteProyeccion } from "@/lib/api";

export default function PaginaProyeccionCompra(): React.JSX.Element {
  const [dias, setDias] = useState<string>("90");
  const [diasCobertura, setDiasCobertura] = useState<string>("30");
  const [reporte, setReporte] = useState<ReporteProyeccion | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar(): Promise<void> {
    setCargando(true);
    setError(null);
    try {
      setReporte(await obtenerProyeccionCompra(Number(dias) || 90, Number(diasCobertura) || 30));
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : "No se pudo cargar el reporte.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <EncabezadoPagina
        titulo="Proyección de compra"
        descripcion="Días de cobertura del stock según el consumo y cantidad sugerida a pedir."
      />
      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label htmlFor="dias" className="etiqueta-campo">
            Ventana de consumo (días)
          </label>
          <input
            id="dias"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            inputMode="numeric"
            className="campo"
          />
        </div>
        <div className="w-40">
          <label htmlFor="cobertura" className="etiqueta-campo">
            Cobertura objetivo (días)
          </label>
          <input
            id="cobertura"
            value={diasCobertura}
            onChange={(e) => setDiasCobertura(e.target.value)}
            inputMode="numeric"
            className="campo"
          />
        </div>
        <button type="button" onClick={() => void cargar()} disabled={cargando} className="btn btn-primario">
          {cargando ? "Calculando…" : "Calcular"}
        </button>
      </div>

      {error && (
        <div className="aviso aviso-peligro mt-4" role="alert">
          <span>{error}</span>
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Sugerencia de reposición</span>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th className="num">Disponible</th>
                <th className="num">Consumo/día</th>
                <th className="num">Días de stock</th>
                <th className="num">Sugerido pedir</th>
              </tr>
            </thead>
            <tbody>
              {reporte && reporte.filas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-texto-ter">
                    Sin consumo en la ventana indicada.
                  </td>
                </tr>
              ) : (
                reporte?.filas.map((f) => (
                  <tr key={f.skuId}>
                    <td className="font-mono text-xs">{f.codigoParlante}</td>
                    <td>{f.producto}</td>
                    <td className="num">{f.disponible}</td>
                    <td className="num">{f.consumoPromedioDiario}</td>
                    <td className="num">{f.diasStock ?? "∞"}</td>
                    <td className="num font-semibold">{f.sugeridoPedir}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
