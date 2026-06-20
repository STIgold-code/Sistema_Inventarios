"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  actualizarFamilia,
  crearFamilia,
  darDeBajaFamilia,
  obtenerFamiliasGestion,
  type FamiliaGestion,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface FormFamilia {
  codigo: string;
  nombre: string;
}

const FAMILIA_VACIA: FormFamilia = {
  codigo: "",
  nombre: "",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaFamilias(): React.JSX.Element {
  const [familias, setFamilias] = useState<FamiliaGestion[]>([]);
  const [incluirInactivas, setIncluirInactivas] = useState<boolean>(false);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  const [form, setForm] = useState<FormFamilia>(FAMILIA_VACIA);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [familiaABaja, setFamiliaABaja] = useState<FamiliaGestion | null>(null);
  const [procesandoBaja, setProcesandoBaja] = useState<boolean>(false);

  async function refrescar(verTodas: boolean): Promise<void> {
    try {
      setFamilias(await obtenerFamiliasGestion(verTodas));
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudieron cargar las familias."),
        tono: "error",
      });
    }
  }

  useEffect(() => {
    void (async (): Promise<void> => {
      await refrescar(incluirInactivas);
      setCargandoBase(false);
    })();
    // Recarga cada vez que cambia el filtro de inactivas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incluirInactivas]);

  function actualizarForm(campo: keyof FormFamilia, valor: string): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  function iniciarEdicion(familia: FamiliaGestion): void {
    setEditandoId(familia.id);
    setForm({ codigo: familia.codigo, nombre: familia.nombre });
    setAviso(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function cancelarEdicion(): void {
    setEditandoId(null);
    setForm(FAMILIA_VACIA);
    setAviso(null);
  }

  async function manejarFamilia(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);

    const nombre = form.nombre.trim();
    if (!nombre) {
      setAviso({ texto: "Ingresa el nombre de la familia.", tono: "error" });
      return;
    }
    if (editandoId === null && !/^\d{3}$/.test(form.codigo.trim())) {
      setAviso({
        texto: "El código debe tener exactamente 3 dígitos numéricos.",
        tono: "error",
      });
      return;
    }

    setGuardando(true);
    try {
      if (editandoId !== null) {
        await actualizarFamilia(editandoId, { nombre });
        setAviso({ texto: "Familia actualizada.", tono: "exito" });
      } else {
        const creada = await crearFamilia({ codigo: form.codigo.trim(), nombre });
        setAviso({ texto: `Familia ${creada.codigo} registrada.`, tono: "exito" });
      }
      setEditandoId(null);
      setForm(FAMILIA_VACIA);
      await refrescar(incluirInactivas);
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo guardar la familia."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function reactivar(familia: FamiliaGestion): Promise<void> {
    setAviso(null);
    try {
      await actualizarFamilia(familia.id, { activo: true });
      setAviso({ texto: `Familia ${familia.codigo} reactivada.`, tono: "exito" });
      await refrescar(incluirInactivas);
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo reactivar la familia."),
        tono: "error",
      });
    }
  }

  async function confirmarBaja(): Promise<void> {
    if (!familiaABaja) return;
    setProcesandoBaja(true);
    setAviso(null);
    try {
      await darDeBajaFamilia(familiaABaja.id);
      setAviso({
        texto: `Familia ${familiaABaja.codigo} dada de baja.`,
        tono: "exito",
      });
      if (editandoId === familiaABaja.id) cancelarEdicion();
      setFamiliaABaja(null);
      await refrescar(incluirInactivas);
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo dar de baja la familia."),
        tono: "error",
      });
    } finally {
      setProcesandoBaja(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Familias"
        descripcion="Administra las familias de productos. El código de 3 dígitos identifica a la familia y es el prefijo del código parlante de sus SKU."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {editandoId !== null ? "Editar familia" : "Nueva familia"}
            </span>
          </div>
          <form onSubmit={manejarFamilia} className="space-y-4 p-5">
            {aviso && (
              <div
                role={aviso.tono === "error" ? "alert" : "status"}
                className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
              >
                <span>{aviso.texto}</span>
              </div>
            )}
            <div>
              <label htmlFor="codigo-familia" className="etiqueta-campo">
                Código
              </label>
              <input
                id="codigo-familia"
                value={form.codigo}
                onChange={(e) => actualizarForm("codigo", e.target.value)}
                inputMode="numeric"
                maxLength={3}
                disabled={editandoId !== null}
                aria-describedby="codigo-familia-ayuda"
                required
                className="campo font-mono sm:max-w-[10rem]"
              />
              <p id="codigo-familia-ayuda" className="mt-1.5 text-xs text-texto-ter">
                {editandoId !== null
                  ? "El código no se puede modificar."
                  : "Exactamente 3 dígitos numéricos (por ejemplo, 001)."}
              </p>
            </div>
            <div>
              <label htmlFor="nombre-familia" className="etiqueta-campo">
                Nombre
              </label>
              <input
                id="nombre-familia"
                value={form.nombre}
                onChange={(e) => actualizarForm("nombre", e.target.value)}
                required
                className="campo"
              />
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={guardando} className="btn btn-primario">
                {guardando
                  ? "Guardando…"
                  : editandoId !== null
                    ? "Guardar cambios"
                    : "Registrar familia"}
              </button>
              {editandoId !== null && (
                <button type="button" onClick={cancelarEdicion} className="btn btn-contorno">
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Familias registradas</span>
            <label className="flex items-center gap-2 text-sm text-texto-sec">
              <input
                type="checkbox"
                checked={incluirInactivas}
                onChange={(e) => setIncluirInactivas(e.target.checked)}
              />
              Ver inactivas
            </label>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargandoBase ? (
                  <tr>
                    <td colSpan={4} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : familias.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-texto-ter">
                      Sin familias registradas.
                    </td>
                  </tr>
                ) : (
                  familias.map((familia) => (
                    <tr key={familia.id}>
                      <td className="num">{familia.codigo}</td>
                      <td className="text-tinta">{familia.nombre}</td>
                      <td>
                        <span
                          className={`insignia ${familia.activo ? "insignia-exito" : "insignia-neutra"}`}
                        >
                          {familia.activo ? "Activa" : "Inactiva"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          {familia.activo ? (
                            <>
                              <button
                                type="button"
                                onClick={() => iniciarEdicion(familia)}
                                className="btn btn-contorno h-8"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => setFamiliaABaja(familia)}
                                className="btn btn-peligro h-8"
                              >
                                Dar de baja
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void reactivar(familia)}
                              className="btn btn-contorno h-8"
                            >
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ModalConfirmacion
        abierto={familiaABaja !== null}
        titulo="Dar de baja familia"
        mensaje={`¿Dar de baja la familia ${familiaABaja?.codigo ?? ""} (${familiaABaja?.nombre ?? ""})? No se eliminará el historial de productos asociados y podrás reactivarla luego.`}
        textoConfirmar="Dar de baja"
        tono="peligro"
        procesando={procesandoBaja}
        onConfirmar={() => void confirmarBaja()}
        onCancelar={() => !procesandoBaja && setFamiliaABaja(null)}
      />
    </div>
  );
}
