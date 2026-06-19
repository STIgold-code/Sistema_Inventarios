"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ErrorApi, obtenerGuias, type GuiaRemision } from "@/lib/api";
import { etiquetaMotivo } from "@/lib/guias";

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function formatearFecha(iso: string): string {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime())
    ? iso
    : new Intl.DateTimeFormat("es-PE", { dateStyle: "medium" }).format(fecha);
}

/** Texto del recurso al que refiere la guia (traslado u orden de venta). */
function referencia(guia: GuiaRemision): string {
  if (guia.trasladoNumero) return `Traslado ${guia.trasladoNumero}`;
  if (guia.ordenVentaNumero) return `Orden de venta ${guia.ordenVentaNumero}`;
  return "—";
}

export default function PaginaGuias(): React.JSX.Element {
  const [guias, setGuias] = useState<GuiaRemision[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setGuias(await obtenerGuias());
      } catch (e) {
        setError(mensajeError(e, "No se pudieron cargar las guías de remisión."));
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div>
      <EncabezadoPagina
        titulo="Guías de remisión"
        descripcion="Registro de referencia de las guías emitidas por traslados y despachos."
      />

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Guías registradas</span>
        </div>
        <div className="space-y-4 p-5">
          {error && (
            <div role="alert" className="aviso aviso-peligro">
              <span>{error}</span>
            </div>
          )}
          {cargando ? (
            <p className="text-sm text-texto-ter">Cargando…</p>
          ) : guias.length === 0 ? (
            <p className="text-sm text-texto-ter">Sin guías de remisión registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Serie-Número</th>
                    <th>Fecha</th>
                    <th>Motivo</th>
                    <th>Partida → Llegada</th>
                    <th>Transportista</th>
                    <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  {guias.map((g) => (
                    <tr key={g.id}>
                      <td className="font-mono text-xs font-semibold text-tinta">
                        {g.serieNumero}
                      </td>
                      <td className="text-xs text-texto-sec">
                        {formatearFecha(g.fechaTraslado)}
                      </td>
                      <td>{etiquetaMotivo(g.motivoTraslado)}</td>
                      <td className="text-xs text-texto-sec">
                        {g.puntoPartida} → {g.puntoLlegada}
                      </td>
                      <td className="text-xs text-texto-sec">
                        {g.transportistaNombre ?? "—"}
                      </td>
                      <td className="text-xs text-texto-sec">{referencia(g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
