"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  aprobarRequerimiento,
  crearRequerimiento,
  obtenerCentrosCosto,
  obtenerRequerimientos,
  rechazarRequerimiento,
  type CentroCosto,
  type EstadoRequerimiento,
  type Requerimiento,
  type Sku,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  justificacion: string;
}

interface AccionPendiente {
  id: number;
  numero: string;
  tipo: "aprobar" | "rechazar";
}

const INSIGNIA_ESTADO: Record<EstadoRequerimiento, string> = {
  BORRADOR: "insignia insignia-neutra",
  APROBADO: "insignia insignia-exito",
  RECHAZADO: "insignia insignia-peligro",
  CONVERTIDO: "insignia insignia-info",
};

const ETIQUETA_ESTADO: Record<EstadoRequerimiento, string> = {
  BORRADOR: "Borrador",
  APROBADO: "Aprobado",
  RECHAZADO: "Rechazado",
  CONVERTIDO: "Convertido",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "", justificacion: "" };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaRequerimientos(): React.JSX.Element {
  const [requerimientos, setRequerimientos] = useState<Requerimiento[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  const [centroCostoId, setCentroCostoId] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [accion, setAccion] = useState<AccionPendiente | null>(null);
  const [procesandoAccion, setProcesandoAccion] = useState<boolean>(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [reqs, centros] = await Promise.all([
          obtenerRequerimientos(),
          obtenerCentrosCosto(),
        ]);
        setRequerimientos(reqs);
        setCentrosCosto(centros.filter((c) => c.activo));
      } catch (error) {
        setAvisoLista({
          texto: mensajeError(error, "No se pudieron cargar los requerimientos."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescar(): Promise<void> {
    try {
      setRequerimientos(await obtenerRequerimientos());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  function actualizarLinea(indice: number, cambios: Partial<LineaBorrador>): void {
    setLineas((previas) =>
      previas.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)),
    );
  }

  function agregarLinea(): void {
    setLineas((previas) => [...previas, lineaVacia()]);
  }

  function quitarLinea(indice: number): void {
    setLineas((previas) =>
      previas.length === 1 ? previas : previas.filter((_, i) => i !== indice),
    );
  }

  async function manejarCreacion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    if (!centroCostoId) {
      setAvisoForm({ texto: "Selecciona un centro de costo.", tono: "error" });
      return;
    }
    const conDatos = lineas.filter((l) => l.cantidad.trim() && Number(l.cantidad) > 0);
    if (conDatos.length === 0) {
      setAvisoForm({
        texto: "Agrega al menos una línea con SKU y cantidad.",
        tono: "error",
      });
      return;
    }
    const validas = conDatos.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null,
    );
    if (validas.length !== conDatos.length) {
      setAvisoForm({ texto: "Selecciona un producto en cada línea.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await crearRequerimiento({
        centroCostoId: Number(centroCostoId),
        observaciones: observaciones.trim() || undefined,
        lineas: validas.map((l) => ({
          skuId: l.sku.id,
          cantidad: l.cantidad,
          justificacion: l.justificacion.trim() || undefined,
        })),
      });
      setAvisoForm({
        texto: `Requerimiento creado (#${respuesta.id}) en estado Borrador.`,
        tono: "exito",
      });
      setCentroCostoId("");
      setObservaciones("");
      setLineas([lineaVacia()]);
      await refrescar();
    } catch (error) {
      setAvisoForm({
        texto: mensajeError(error, "No se pudo crear el requerimiento."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarAccion(): Promise<void> {
    if (!accion) return;
    setProcesandoAccion(true);
    setAvisoLista(null);
    try {
      if (accion.tipo === "aprobar") {
        await aprobarRequerimiento(accion.id);
        setAvisoLista({ texto: `Requerimiento ${accion.numero} aprobado.`, tono: "exito" });
      } else {
        await rechazarRequerimiento(accion.id);
        setAvisoLista({ texto: `Requerimiento ${accion.numero} rechazado.`, tono: "exito" });
      }
      setAccion(null);
      await refrescar();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo actualizar el requerimiento."),
        tono: "error",
      });
    } finally {
      setProcesandoAccion(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Requerimientos"
        descripcion="Registra y aprueba solicitudes de compra antes de generar una orden."
      />

      <div className="space-y-6">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nuevo requerimiento</span>
          </div>
          <form onSubmit={manejarCreacion} className="space-y-4 p-5">
            {avisoForm && (
              <div
                role={avisoForm.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoForm.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoForm.texto}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="centro-costo" className="etiqueta-campo">
                  Centro de costo
                </label>
                <select
                  id="centro-costo"
                  value={centroCostoId}
                  onChange={(e) => setCentroCostoId(e.target.value)}
                  disabled={cargandoBase}
                  required
                  className="campo"
                >
                  <option value="">{cargandoBase ? "Cargando…" : "Selecciona…"}</option>
                  {centrosCosto.map((centro) => (
                    <option key={centro.id} value={centro.id}>
                      {centro.codigo} — {centro.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="observaciones-req" className="etiqueta-campo">
                  Observaciones <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="observaciones-req"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="campo"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-texto">Líneas</span>
                <button type="button" onClick={agregarLinea} className="btn btn-contorno">
                  Agregar línea
                </button>
              </div>

              {lineas.map((linea, indice) => (
                <div
                  key={indice}
                  className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_1fr_auto]"
                >
                  <div>
                    <label htmlFor={`req-sku-${indice}`} className="etiqueta-campo">
                      SKU
                    </label>
                    <SelectorSku
                      valor={linea.sku}
                      onSeleccionar={(sku) => actualizarLinea(indice, { sku })}
                      placeholder="Busca por código o nombre…"
                    />
                  </div>
                  <div>
                    <label htmlFor={`req-cantidad-${indice}`} className="etiqueta-campo">
                      Cantidad
                    </label>
                    <input
                      id={`req-cantidad-${indice}`}
                      value={linea.cantidad}
                      onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                      inputMode="decimal"
                      className="campo w-28 font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor={`req-justif-${indice}`} className="etiqueta-campo">
                      Justificación <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id={`req-justif-${indice}`}
                      value={linea.justificacion}
                      onChange={(e) =>
                        actualizarLinea(indice, { justificacion: e.target.value })
                      }
                      className="campo"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => quitarLinea(indice)}
                      disabled={lineas.length === 1}
                      className="btn btn-contorno"
                      aria-label={`Quitar línea ${indice + 1}`}
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end border-t border-borde pt-4">
              <button type="submit" disabled={guardando} className="btn btn-primario">
                {guardando ? "Creando…" : "Crear requerimiento"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Requerimientos registrados</span>
          </div>
          <div className="space-y-4 p-5">
            {avisoLista && (
              <div
                role={avisoLista.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoLista.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoLista.texto}</span>
              </div>
            )}
            {cargandoBase ? (
              <p className="text-sm text-texto-ter">Cargando…</p>
            ) : requerimientos.length === 0 ? (
              <p className="text-sm text-texto-ter">Sin requerimientos registrados.</p>
            ) : (
              requerimientos.map((req) => (
                <article key={req.id} className="rounded-md border border-borde p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm font-semibold text-tinta">
                        {req.numero}
                      </p>
                      <p className="text-xs text-texto-sec">
                        {req.centroCosto} · {req.solicitante}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={INSIGNIA_ESTADO[req.estado]}>
                        {ETIQUETA_ESTADO[req.estado]}
                      </span>
                      <Link
                        href={`/panel/requerimientos/${req.id}/imprimir`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-contorno h-9"
                      >
                        Imprimir
                      </Link>
                      {req.estado === "BORRADOR" && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setAccion({ id: req.id, numero: req.numero, tipo: "aprobar" })
                            }
                            className="btn btn-primario h-9"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setAccion({ id: req.id, numero: req.numero, tipo: "rechazar" })
                            }
                            className="btn btn-peligro h-9"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {req.observaciones && (
                    <p className="mt-2 text-xs text-texto-sec">{req.observaciones}</p>
                  )}
                  <div className="mt-3 overflow-x-auto">
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Cantidad</th>
                          <th>Justificación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {req.lineas.map((linea) => (
                          <tr key={linea.id}>
                            <td className="num">{linea.skuId}</td>
                            <td className="num">{linea.cantidad}</td>
                            <td className="text-texto-sec">{linea.justificacion ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <ModalConfirmacion
        abierto={accion !== null}
        titulo={accion?.tipo === "aprobar" ? "Aprobar requerimiento" : "Rechazar requerimiento"}
        mensaje={
          accion?.tipo === "aprobar"
            ? `¿Aprobar el requerimiento ${accion?.numero}? Quedará disponible para generar una orden de compra.`
            : `¿Rechazar el requerimiento ${accion?.numero ?? ""}? Esta acción no se puede revertir.`
        }
        textoConfirmar={accion?.tipo === "aprobar" ? "Aprobar" : "Rechazar"}
        tono={accion?.tipo === "aprobar" ? "primario" : "peligro"}
        procesando={procesandoAccion}
        onConfirmar={() => void confirmarAccion()}
        onCancelar={() => !procesandoAccion && setAccion(null)}
      />
    </div>
  );
}
