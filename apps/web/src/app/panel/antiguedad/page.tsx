"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ErrorApi, obtenerAntiguedadStock, type ReporteAntiguedad } from "@/lib/api";

export default function PaginaAntiguedad(): React.JSX.Element {
  const [reporte, setReporte] = useState<ReporteAntiguedad | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerAntiguedadStock()
      .then(setReporte)
      .catch((e) =>
        setError(e instanceof ErrorApi ? e.message : "No se pudo cargar el reporte."),
      )
      .finally(() => setCargando(false));
  }, []);

  return (
    <div>
      <EncabezadoPagina
        titulo="Antigüedad de stock"
        descripcion="Composición del inventario valorizado por antigüedad de las capas de costo."
      />
      {error && (
        <div className="aviso aviso-peligro mt-4" role="alert">
          <span>{error}</span>
        </div>
      )}
      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Distribución por antigüedad</span>
          {reporte && (
            <span className="text-xs text-texto-sec">
              Total valorizado: S/ {reporte.totalValor}
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Rango</th>
                <th className="num">Cantidad</th>
                <th className="num">Valor (S/)</th>
                <th className="num">% del valor</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={4} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : (
                reporte?.rangos.map((r) => (
                  <tr key={r.clave}>
                    <td>{r.etiqueta}</td>
                    <td className="num">{r.cantidad}</td>
                    <td className="num">{r.valor}</td>
                    <td className="num">{r.porcentajeValor}%</td>
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
