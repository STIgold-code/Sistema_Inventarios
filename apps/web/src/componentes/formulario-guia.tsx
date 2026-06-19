"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ErrorApi,
  crearGuia,
  obtenerGuias,
  type GuiaRemision,
} from "@/lib/api";
import { MOTIVOS_GUIA, etiquetaMotivo } from "@/lib/guias";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface Props {
  /** Vinculo de la guia: exactamente uno. */
  vinculo: { trasladoId: number } | { ordenVentaId: number };
  /** Codigo de motivo por defecto (ej. "04" traslados, "01" ventas). */
  motivoDefecto: string;
  /** Valores sugeridos para puntos de partida/llegada (origen/destino). */
  puntoPartidaSugerido?: string;
  puntoLlegadaSugerido?: string;
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/**
 * Panel inline para registrar una guia de remision (registro de referencia)
 * asociada a un traslado o a una orden de venta, y listar las ya registradas.
 * El vinculo se pasa por props y determina contra que recurso se crea la guia.
 */
export function FormularioGuia({
  vinculo,
  motivoDefecto,
  puntoPartidaSugerido = "",
  puntoLlegadaSugerido = "",
}: Props): React.JSX.Element {
  const [guias, setGuias] = useState<GuiaRemision[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [abierto, setAbierto] = useState<boolean>(false);

  const [serie, setSerie] = useState<string>("");
  const [numero, setNumero] = useState<string>("");
  const [fechaTraslado, setFechaTraslado] = useState<string>("");
  const [motivo, setMotivo] = useState<string>(motivoDefecto);
  const [transportistaDoc, setTransportistaDoc] = useState<string>("");
  const [transportistaNombre, setTransportistaNombre] = useState<string>("");
  const [puntoPartida, setPuntoPartida] = useState<string>(puntoPartidaSugerido);
  const [puntoLlegada, setPuntoLlegada] = useState<string>(puntoLlegadaSugerido);
  const [pesoBruto, setPesoBruto] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const filtro =
    "trasladoId" in vinculo
      ? { trasladoId: vinculo.trasladoId }
      : { ordenVentaId: vinculo.ordenVentaId };
  const claveVinculo =
    "trasladoId" in vinculo ? `t${vinculo.trasladoId}` : `o${vinculo.ordenVentaId}`;

  useEffect(() => {
    let activo = true;
    setCargando(true);
    void (async (): Promise<void> => {
      try {
        const datos = await obtenerGuias(filtro);
        if (activo) setGuias(datos);
      } catch {
        // Lista vacia ante error de carga; el registro seguira disponible.
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => {
      activo = false;
    };
    // claveVinculo identifica de forma estable el recurso vinculado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveVinculo]);

  function limpiar(): void {
    setSerie("");
    setNumero("");
    setFechaTraslado("");
    setMotivo(motivoDefecto);
    setTransportistaDoc("");
    setTransportistaNombre("");
    setPuntoPartida(puntoPartidaSugerido);
    setPuntoLlegada(puntoLlegadaSugerido);
    setPesoBruto("");
    setObservaciones("");
  }

  async function manejarSubmit(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (!serie.trim() || !numero.trim() || !fechaTraslado) {
      setAviso({ texto: "Completa serie, número y fecha de traslado.", tono: "error" });
      return;
    }
    if (!puntoPartida.trim() || !puntoLlegada.trim()) {
      setAviso({ texto: "Completa el punto de partida y el de llegada.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      await crearGuia({
        ...filtro,
        serie: serie.trim(),
        numero: numero.trim(),
        fechaTraslado: new Date(fechaTraslado).toISOString(),
        motivoTraslado: motivo,
        transportistaDoc: transportistaDoc.trim() || undefined,
        transportistaNombre: transportistaNombre.trim() || undefined,
        puntoPartida: puntoPartida.trim(),
        puntoLlegada: puntoLlegada.trim(),
        pesoBruto: pesoBruto.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      });
      setAviso({ texto: "Guía de remisión registrada.", tono: "exito" });
      limpiar();
      setGuias(await obtenerGuias(filtro));
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo registrar la guía de remisión."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-3 border-t border-borde pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-texto-sec">
          Guías de remisión
          {!cargando && guias.length > 0 ? ` (${guias.length})` : ""}
        </span>
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className="btn btn-contorno"
        >
          {abierto ? "Cerrar" : "Registrar guía"}
        </button>
      </div>

      {!cargando && guias.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Serie-Número</th>
                <th>Motivo</th>
                <th>Partida → Llegada</th>
                <th>Transportista</th>
              </tr>
            </thead>
            <tbody>
              {guias.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono text-xs">{g.serieNumero}</td>
                  <td>{etiquetaMotivo(g.motivoTraslado)}</td>
                  <td className="text-xs text-texto-sec">
                    {g.puntoPartida} → {g.puntoLlegada}
                  </td>
                  <td className="text-xs text-texto-sec">
                    {g.transportistaNombre ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierto && (
        <form onSubmit={manejarSubmit} className="mt-3 space-y-3 rounded-md border border-borde bg-panel-alt p-3">
          {aviso && (
            <div
              role={aviso.tono === "error" ? "alert" : "status"}
              className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
            >
              <span>{aviso.texto}</span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`guia-serie-${claveVinculo}`} className="etiqueta-campo">
                Serie
              </label>
              <input
                id={`guia-serie-${claveVinculo}`}
                value={serie}
                onChange={(e) => setSerie(e.target.value)}
                placeholder="Ej. T001"
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor={`guia-numero-${claveVinculo}`} className="etiqueta-campo">
                Número
              </label>
              <input
                id={`guia-numero-${claveVinculo}`}
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="Ej. 0001234"
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor={`guia-fecha-${claveVinculo}`} className="etiqueta-campo">
                Fecha de traslado
              </label>
              <input
                id={`guia-fecha-${claveVinculo}`}
                type="date"
                value={fechaTraslado}
                onChange={(e) => setFechaTraslado(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`guia-motivo-${claveVinculo}`} className="etiqueta-campo">
              Motivo de traslado
            </label>
            <select
              id={`guia-motivo-${claveVinculo}`}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="campo"
            >
              {MOTIVOS_GUIA.map((m) => (
                <option key={m.codigo} value={m.codigo}>
                  {m.codigo} — {m.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`guia-tdoc-${claveVinculo}`} className="etiqueta-campo">
                Documento del transportista <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id={`guia-tdoc-${claveVinculo}`}
                value={transportistaDoc}
                onChange={(e) => setTransportistaDoc(e.target.value)}
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor={`guia-tnom-${claveVinculo}`} className="etiqueta-campo">
                Nombre del transportista <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id={`guia-tnom-${claveVinculo}`}
                value={transportistaNombre}
                onChange={(e) => setTransportistaNombre(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`guia-partida-${claveVinculo}`} className="etiqueta-campo">
                Punto de partida
              </label>
              <input
                id={`guia-partida-${claveVinculo}`}
                value={puntoPartida}
                onChange={(e) => setPuntoPartida(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor={`guia-llegada-${claveVinculo}`} className="etiqueta-campo">
                Punto de llegada
              </label>
              <input
                id={`guia-llegada-${claveVinculo}`}
                value={puntoLlegada}
                onChange={(e) => setPuntoLlegada(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`guia-peso-${claveVinculo}`} className="etiqueta-campo">
                Peso bruto (kg) <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id={`guia-peso-${claveVinculo}`}
                value={pesoBruto}
                onChange={(e) => setPesoBruto(e.target.value)}
                inputMode="decimal"
                className="campo font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`guia-obs-${claveVinculo}`} className="etiqueta-campo">
                Observaciones <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id={`guia-obs-${claveVinculo}`}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                className="campo"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Registrando…" : "Registrar guía"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
