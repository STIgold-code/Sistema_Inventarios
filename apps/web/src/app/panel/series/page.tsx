"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  obtenerSeries,
  type EstadoSerieArticulo,
  type SerieArticulo,
  type Sku,
} from "@/lib/api";

type FiltroEstado = "" | EstadoSerieArticulo;

interface Aviso {
  texto: string;
  tono: "error";
}

const INSIGNIA_ESTADO: Record<EstadoSerieArticulo, string> = {
  DISPONIBLE: "insignia insignia-exito",
  DESPACHADO: "insignia insignia-neutra",
};

const ETIQUETA_ESTADO: Record<EstadoSerieArticulo, string> = {
  DISPONIBLE: "Disponible",
  DESPACHADO: "Despachado",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaSeries(): React.JSX.Element {
  const [sku, setSku] = useState<Sku | null>(null);
  const [estado, setEstado] = useState<FiltroEstado>("");
  const [series, setSeries] = useState<SerieArticulo[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [consultado, setConsultado] = useState<boolean>(false);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    setAviso(null);
    void (async (): Promise<void> => {
      try {
        const datos = await obtenerSeries({
          skuId: sku?.id,
          estado: estado || undefined,
        });
        if (!activo) return;
        setSeries(datos);
      } catch (error) {
        if (activo) {
          setAviso({
            texto: mensajeError(error, "No se pudieron cargar las series."),
            tono: "error",
          });
          setSeries([]);
        }
      } finally {
        if (activo) {
          setCargando(false);
          setConsultado(true);
        }
      }
    })();
    return () => {
      activo = false;
    };
  }, [sku, estado]);

  const disponibles = series.filter((s) => s.estado === "DISPONIBLE").length;
  const despachadas = series.filter((s) => s.estado === "DESPACHADO").length;

  return (
    <div>
      <EncabezadoPagina
        titulo="Series"
        descripcion="Consulta la trazabilidad por número de serie de los artículos serializados, con su estado y almacén actual."
      />

      <section className="panel">
        <div className="panel-cabecera">
          <span className="panel-titulo">Filtros</span>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <label className="etiqueta-campo">Artículo (SKU)</label>
            <SelectorSku
              valor={sku}
              onSeleccionar={setSku}
              placeholder="Busca por código o nombre…"
            />
          </div>
          <div>
            <label htmlFor="filtro-estado" className="etiqueta-campo">
              Estado
            </label>
            <select
              id="filtro-estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value as FiltroEstado)}
              className="campo"
            >
              <option value="">Todos</option>
              <option value="DISPONIBLE">Disponible</option>
              <option value="DESPACHADO">Despachado</option>
            </select>
          </div>
        </div>
      </section>

      <section className="panel mt-6">
        <div className="panel-cabecera flex items-center justify-between">
          <span className="panel-titulo">Series</span>
          {consultado && !cargando && (
            <span className="text-xs text-texto-ter">
              {series.length} total · {disponibles} disponibles · {despachadas}{" "}
              despachadas
            </span>
          )}
        </div>
        <div className="p-5">
          {aviso && (
            <div role="alert" className="aviso aviso-peligro mb-4">
              <span>{aviso.texto}</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Número de serie</th>
                  <th>Artículo</th>
                  <th>Estado</th>
                  <th>Almacén</th>
                  <th>Registrada</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : series.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-texto-ter">
                      {sku
                        ? "Este artículo no tiene números de serie registrados."
                        : "No hay números de serie registrados con los filtros actuales."}
                    </td>
                  </tr>
                ) : (
                  series.map((s) => (
                    <tr key={s.id}>
                      <td className="font-mono text-tinta">{s.numeroSerie}</td>
                      <td>
                        <span className="font-mono text-xs text-texto-sec">
                          {s.codigoParlante}
                        </span>{" "}
                        <span className="text-texto">{s.skuNombre ?? "—"}</span>
                      </td>
                      <td>
                        <span className={INSIGNIA_ESTADO[s.estado]}>
                          {ETIQUETA_ESTADO[s.estado]}
                        </span>
                      </td>
                      <td className="text-texto-sec">{s.almacen ?? "—"}</td>
                      <td className="text-texto-sec">
                        {new Date(s.creadoEn).toLocaleDateString("es-PE")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
