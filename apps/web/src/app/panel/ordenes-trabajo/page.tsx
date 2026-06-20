"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  actualizarOrdenTrabajo,
  cerrarOrdenTrabajo,
  crearOrdenTrabajo,
  obtenerCentrosCosto,
  obtenerOrdenesTrabajo,
  type CentroCosto,
  type EstadoOrdenTrabajo,
  type OrdenTrabajo,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface CierrePendiente {
  id: number;
  numero: string;
}

const INSIGNIA_ESTADO: Record<EstadoOrdenTrabajo, string> = {
  ABIERTA: "insignia insignia-info",
  CERRADA: "insignia insignia-neutra",
};

const ETIQUETA_ESTADO: Record<EstadoOrdenTrabajo, string> = {
  ABIERTA: "Abierta",
  CERRADA: "Cerrada",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function formatearFecha(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function PaginaOrdenesTrabajo(): React.JSX.Element {
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Formulario: crea cuando editandoId es null, edita en caso contrario.
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [descripcion, setDescripcion] = useState<string>("");
  const [centroCostoId, setCentroCostoId] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [cierre, setCierre] = useState<CierrePendiente | null>(null);
  const [procesandoCierre, setProcesandoCierre] = useState<boolean>(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [ots, centros] = await Promise.all([
          obtenerOrdenesTrabajo(),
          obtenerCentrosCosto(),
        ]);
        setOrdenes(ots);
        setCentrosCosto(centros.filter((c) => c.activo));
      } catch (error) {
        setAvisoLista({
          texto: mensajeError(error, "No se pudieron cargar las órdenes de trabajo."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescar(): Promise<void> {
    try {
      setOrdenes(await obtenerOrdenesTrabajo());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  function limpiarFormulario(): void {
    setEditandoId(null);
    setDescripcion("");
    setCentroCostoId("");
    setAvisoForm(null);
  }

  function iniciarEdicion(ot: OrdenTrabajo): void {
    setEditandoId(ot.id);
    setDescripcion(ot.descripcion);
    setCentroCostoId(String(ot.centroCostoId));
    setAvisoForm(null);
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    if (!descripcion.trim()) {
      setAvisoForm({ texto: "Ingresa una descripción.", tono: "error" });
      return;
    }
    if (!centroCostoId) {
      setAvisoForm({ texto: "Selecciona un centro de costo.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      if (editandoId === null) {
        const respuesta = await crearOrdenTrabajo({
          descripcion: descripcion.trim(),
          centroCostoId: Number(centroCostoId),
        });
        setAvisoForm({
          texto: `Orden de trabajo creada (#${respuesta.id}).`,
          tono: "exito",
        });
      } else {
        await actualizarOrdenTrabajo(editandoId, {
          descripcion: descripcion.trim(),
          centroCostoId: Number(centroCostoId),
        });
        setAvisoForm({ texto: "Orden de trabajo actualizada.", tono: "exito" });
      }
      limpiarFormulario();
      await refrescar();
    } catch (error) {
      setAvisoForm({
        texto: mensajeError(error, "No se pudo guardar la orden de trabajo."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarCierre(): Promise<void> {
    if (!cierre) return;
    setProcesandoCierre(true);
    setAvisoLista(null);
    try {
      await cerrarOrdenTrabajo(cierre.id);
      setAvisoLista({
        texto: `Orden de trabajo ${cierre.numero} cerrada.`,
        tono: "exito",
      });
      if (editandoId === cierre.id) limpiarFormulario();
      setCierre(null);
      await refrescar();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo cerrar la orden de trabajo."),
        tono: "error",
      });
    } finally {
      setProcesandoCierre(false);
    }
  }

  const editando = editandoId !== null;

  return (
    <div>
      <EncabezadoPagina
        titulo="Órdenes de trabajo"
        descripcion="Agrupa el consumo de materiales por trabajo o proyecto. Imputa vales de salida a una orden abierta y ciérrala al finalizar."
      />

      <div className="space-y-6">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {editando ? "Editar orden de trabajo" : "Nueva orden de trabajo"}
            </span>
          </div>
          <form onSubmit={manejarEnvio} className="space-y-4 p-5">
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
                <label htmlFor="ot-descripcion" className="etiqueta-campo">
                  Descripción
                </label>
                <input
                  id="ot-descripcion"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  required
                  placeholder="Trabajo, obra o proyecto"
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="ot-centro-costo" className="etiqueta-campo">
                  Centro de costo
                </label>
                <select
                  id="ot-centro-costo"
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
            </div>

            <div className="flex justify-end gap-3 border-t border-borde pt-4">
              {editando && (
                <button
                  type="button"
                  onClick={limpiarFormulario}
                  disabled={guardando}
                  className="btn btn-contorno"
                >
                  Cancelar
                </button>
              )}
              <button type="submit" disabled={guardando} className="btn btn-primario">
                {guardando
                  ? "Guardando…"
                  : editando
                    ? "Guardar cambios"
                    : "Crear orden"}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Órdenes registradas</span>
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
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Número</th>
                    <th>Descripción</th>
                    <th>Centro de costo</th>
                    <th>Estado</th>
                    <th>Apertura</th>
                    <th>Cierre</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoBase ? (
                    <tr>
                      <td colSpan={7} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : ordenes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-texto-ter">
                        Sin órdenes de trabajo registradas.
                      </td>
                    </tr>
                  ) : (
                    ordenes.map((ot) => (
                      <tr key={ot.id}>
                        <td className="font-mono font-semibold text-tinta">{ot.numero}</td>
                        <td className="text-tinta">{ot.descripcion}</td>
                        <td className="text-texto-sec">{ot.centroCosto ?? "—"}</td>
                        <td>
                          <span className={INSIGNIA_ESTADO[ot.estado]}>
                            {ETIQUETA_ESTADO[ot.estado]}
                          </span>
                        </td>
                        <td className="text-texto-sec">{formatearFecha(ot.fechaApertura)}</td>
                        <td className="text-texto-sec">{formatearFecha(ot.fechaCierre)}</td>
                        <td>
                          {ot.estado === "ABIERTA" && (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(ot)}
                                className="btn btn-contorno h-9"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setCierre({ id: ot.id, numero: ot.numero })
                                }
                                className="btn btn-primario h-9"
                              >
                                Cerrar
                              </button>
                            </div>
                          )}
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

      <ModalConfirmacion
        abierto={cierre !== null}
        titulo="Cerrar orden de trabajo"
        mensaje={
          cierre
            ? `¿Cerrar la orden de trabajo ${cierre.numero}? Una vez cerrada no podrás imputarle nuevos vales de salida ni editarla.`
            : ""
        }
        textoConfirmar="Cerrar"
        tono="primario"
        procesando={procesandoCierre}
        onConfirmar={() => void confirmarCierre()}
        onCancelar={() => !procesandoCierre && setCierre(null)}
      />
    </div>
  );
}
