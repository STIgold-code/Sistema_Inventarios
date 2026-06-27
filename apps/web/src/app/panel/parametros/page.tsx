"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  actualizarParametros,
  obtenerParametros,
  type ParametrosEmpresa,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

const FLAGS: ReadonlyArray<{ id: keyof ParametrosEmpresa; etiqueta: string; nota: string }> = [
  { id: "costeoPromedioActivo", etiqueta: "Costeo promedio ponderado", nota: "Si se desactiva, la valuación de salidas usa PEPS (FIFO)." },
  { id: "preciosIncluyenIgv", etiqueta: "Precios incluyen IGV", nota: "Los precios capturados ya tienen el IGV incorporado." },
  { id: "permiteSerieUnica", etiqueta: "Permite registrar serie única", nota: "Habilita la captura de un único número de serie por artículo." },
  { id: "unidadReferencialVisible", etiqueta: "Mostrar unidad referencial", nota: "Muestra la unidad de referencia en las transferencias de código." },
];

export default function PaginaParametros(): React.JSX.Element {
  const [params, setParams] = useState<ParametrosEmpresa | null>(null);
  const [tasaIgvPct, setTasaIgvPct] = useState<string>("18");
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    obtenerParametros()
      .then((p) => {
        setParams(p);
        setTasaIgvPct(String(Number(p.tasaIgv) * 100));
      })
      .catch((e) => setAviso({ texto: mensajeError(e, "No se pudieron cargar los parámetros."), tono: "error" }));
  }, []);

  function alternar(id: keyof ParametrosEmpresa): void {
    setParams((p) => (p ? { ...p, [id]: !p[id] } : p));
  }

  async function guardar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!params) return;
    const pct = Number(tasaIgvPct);
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
      setAviso({ texto: "La tasa de IGV debe estar entre 0 y 100.", tono: "error" });
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const actualizado = await actualizarParametros({
        tasaIgv: (pct / 100).toFixed(4),
        costeoPromedioActivo: params.costeoPromedioActivo,
        preciosIncluyenIgv: params.preciosIncluyenIgv,
        permiteSerieUnica: params.permiteSerieUnica,
        unidadReferencialVisible: params.unidadReferencialVisible,
      });
      setParams(actualizado);
      setTasaIgvPct(String(Number(actualizado.tasaIgv) * 100));
      setAviso({ texto: "Parámetros guardados.", tono: "exito" });
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudieron guardar los parámetros."), tono: "error" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Parámetros"
        descripcion="Configuración general de la empresa: tasa de IGV y reglas de negocio."
      />

      {aviso && (
        <div
          role={aviso.tono === "error" ? "alert" : "status"}
          className={`aviso mt-4 ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
        >
          <span>{aviso.texto}</span>
        </div>
      )}

      {params && (
        <form onSubmit={guardar} className="mt-6 max-w-2xl space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Impuestos</span>
            </div>
            <div className="p-5">
              <label htmlFor="igv" className="etiqueta-campo">
                Tasa de IGV (%)
              </label>
              <input
                id="igv"
                value={tasaIgvPct}
                onChange={(e) => setTasaIgvPct(e.target.value)}
                inputMode="decimal"
                className="campo w-40 font-mono"
              />
              <p className="mt-1.5 text-xs text-texto-ter">
                Se aplica al calcular el IGV de órdenes de compra y venta.
              </p>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Reglas de negocio</span>
            </div>
            <div className="space-y-4 p-5">
              {FLAGS.map((f) => (
                <label key={f.id} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(params[f.id])}
                    onChange={() => alternar(f.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-medium text-texto">{f.etiqueta}</span>
                    <span className="block text-xs text-texto-ter">{f.nota}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : "Guardar parámetros"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
