"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  actualizarProveedor,
  crearProveedor,
  desactivarProveedor,
  obtenerProveedores,
  type Proveedor,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface FormProveedor {
  ruc: string;
  razonSocial: string;
  direccion: string;
  telefono: string;
  email: string;
  condicionPago: string;
  monedaHabitual: string;
  cci: string;
  contactoNombre: string;
  tipoDocIdentidad: string;
}

const PROVEEDOR_VACIO: FormProveedor = {
  ruc: "",
  razonSocial: "",
  direccion: "",
  telefono: "",
  email: "",
  condicionPago: "",
  monedaHabitual: "",
  cci: "",
  contactoNombre: "",
  tipoDocIdentidad: "",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function proveedorAForm(p: Proveedor): FormProveedor {
  return {
    ruc: p.ruc,
    razonSocial: p.razonSocial,
    direccion: p.direccion ?? "",
    telefono: p.telefono ?? "",
    email: p.email ?? "",
    condicionPago: p.condicionPago ?? "",
    monedaHabitual: p.monedaHabitual ?? "",
    cci: p.cci ?? "",
    contactoNombre: p.contactoNombre ?? "",
    tipoDocIdentidad: p.tipoDocIdentidad ?? "",
  };
}

export default function PaginaProveedores(): React.JSX.Element {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);

  const [form, setForm] = useState<FormProveedor>(PROVEEDOR_VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [proveedorADesactivar, setProveedorADesactivar] = useState<Proveedor | null>(null);
  const [desactivando, setDesactivando] = useState<boolean>(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setProveedores(await obtenerProveedores());
      } catch (error) {
        setAviso({
          texto: mensajeError(error, "No se pudieron cargar los proveedores."),
          tono: "error",
        });
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  async function refrescarProveedores(): Promise<void> {
    try {
      setProveedores(await obtenerProveedores());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  function actualizarForm(campo: keyof FormProveedor, valor: string): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  function iniciarEdicion(proveedor: Proveedor): void {
    setEditandoId(proveedor.id);
    setForm(proveedorAForm(proveedor));
    setAviso(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function cancelarEdicion(): void {
    setEditandoId(null);
    setForm(PROVEEDOR_VACIO);
    setAviso(null);
  }

  async function manejarProveedor(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (editandoId === null && !/^\d{11}$/.test(form.ruc)) {
      setAviso({ texto: "El RUC debe tener 11 dígitos.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      const camposOpcionales = {
        razonSocial: form.razonSocial,
        direccion: form.direccion || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        condicionPago: form.condicionPago || undefined,
        monedaHabitual: form.monedaHabitual || undefined,
        cci: form.cci || undefined,
        contactoNombre: form.contactoNombre || undefined,
        tipoDocIdentidad: form.tipoDocIdentidad || undefined,
      };
      if (editandoId !== null) {
        await actualizarProveedor(editandoId, camposOpcionales);
        setAviso({ texto: "Proveedor actualizado.", tono: "exito" });
      } else {
        const respuesta = await crearProveedor({ ruc: form.ruc, ...camposOpcionales });
        setAviso({
          texto: `Proveedor registrado (#${respuesta.id}).`,
          tono: "exito",
        });
      }
      setEditandoId(null);
      setForm(PROVEEDOR_VACIO);
      await refrescarProveedores();
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo guardar el proveedor."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarDesactivacion(): Promise<void> {
    if (!proveedorADesactivar) return;
    setDesactivando(true);
    setAviso(null);
    try {
      await desactivarProveedor(proveedorADesactivar.id);
      setAviso({
        texto: `Proveedor ${proveedorADesactivar.razonSocial} desactivado.`,
        tono: "exito",
      });
      if (editandoId === proveedorADesactivar.id) cancelarEdicion();
      setProveedorADesactivar(null);
      await refrescarProveedores();
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo desactivar el proveedor."),
        tono: "error",
      });
    } finally {
      setDesactivando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Registra y administra los proveedores de la empresa."
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {editandoId !== null ? "Editar proveedor" : "Nuevo proveedor"}
            </span>
          </div>
          <form onSubmit={manejarProveedor} className="space-y-4 p-5">
            {aviso && (
              <div
                role={aviso.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{aviso.texto}</span>
              </div>
            )}
            <div>
              <label htmlFor="ruc" className="etiqueta-campo">
                RUC
              </label>
              <input
                id="ruc"
                value={form.ruc}
                onChange={(e) => actualizarForm("ruc", e.target.value)}
                inputMode="numeric"
                maxLength={11}
                required
                disabled={editandoId !== null}
                className="campo font-mono disabled:opacity-60"
              />
              {editandoId !== null && (
                <p className="mt-1.5 text-xs text-texto-ter">
                  El RUC no se puede modificar.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="razon-social" className="etiqueta-campo">
                Razón social
              </label>
              <input
                id="razon-social"
                value={form.razonSocial}
                onChange={(e) => actualizarForm("razonSocial", e.target.value)}
                required
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="direccion" className="etiqueta-campo">
                Dirección <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id="direccion"
                value={form.direccion}
                onChange={(e) => actualizarForm("direccion", e.target.value)}
                className="campo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="telefono" className="etiqueta-campo">
                  Teléfono <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="telefono"
                  value={form.telefono}
                  onChange={(e) => actualizarForm("telefono", e.target.value)}
                  inputMode="tel"
                  className="campo font-mono"
                />
              </div>
              <div>
                <label htmlFor="email-proveedor" className="etiqueta-campo">
                  Email <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="email-proveedor"
                  type="email"
                  value={form.email}
                  onChange={(e) => actualizarForm("email", e.target.value)}
                  className="campo"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="condicion-pago" className="etiqueta-campo">
                  Condición de pago <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="condicion-pago"
                  value={form.condicionPago}
                  onChange={(e) => actualizarForm("condicionPago", e.target.value)}
                  placeholder="Ej. Crédito 30 días"
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="moneda-habitual" className="etiqueta-campo">
                  Moneda habitual <span className="text-texto-ter">(opcional)</span>
                </label>
                <select
                  id="moneda-habitual"
                  value={form.monedaHabitual}
                  onChange={(e) => actualizarForm("monedaHabitual", e.target.value)}
                  className="campo"
                >
                  <option value="">Sin definir</option>
                  <option value="PEN">PEN — Soles</option>
                  <option value="USD">USD — Dólares</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="cci" className="etiqueta-campo">
                  CCI <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="cci"
                  value={form.cci}
                  onChange={(e) => actualizarForm("cci", e.target.value)}
                  inputMode="numeric"
                  className="campo font-mono"
                />
              </div>
              <div>
                <label htmlFor="tipo-doc-identidad" className="etiqueta-campo">
                  Tipo doc. identidad <span className="text-texto-ter">(opcional)</span>
                </label>
                <select
                  id="tipo-doc-identidad"
                  value={form.tipoDocIdentidad}
                  onChange={(e) => actualizarForm("tipoDocIdentidad", e.target.value)}
                  className="campo"
                >
                  <option value="">Sin definir</option>
                  <option value="6">RUC</option>
                  <option value="1">DNI</option>
                  <option value="4">Carnet de extranjería</option>
                  <option value="7">Pasaporte</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="contacto-nombre" className="etiqueta-campo">
                Nombre de contacto <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id="contacto-nombre"
                value={form.contactoNombre}
                onChange={(e) => actualizarForm("contactoNombre", e.target.value)}
                className="campo"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={guardando}
                className="btn btn-primario"
              >
                {guardando
                  ? "Guardando…"
                  : editandoId !== null
                    ? "Guardar cambios"
                    : "Registrar proveedor"}
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
            <span className="panel-titulo">Proveedores registrados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>RUC</th>
                  <th>Razón social</th>
                  <th>Contacto</th>
                  <th>Condición</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : proveedores.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-texto-ter">
                      Sin proveedores registrados.
                    </td>
                  </tr>
                ) : (
                  proveedores.map((proveedor) => (
                    <tr key={proveedor.id}>
                      <td className="num">{proveedor.ruc}</td>
                      <td className="text-tinta">{proveedor.razonSocial}</td>
                      <td className="text-texto-sec">
                        {proveedor.contactoNombre || proveedor.telefono || "—"}
                      </td>
                      <td className="text-texto-sec">{proveedor.condicionPago || "—"}</td>
                      <td>
                        <span
                          className={`insignia ${
                            proveedor.activo ? "insignia-exito" : "insignia-neutra"
                          }`}
                        >
                          {proveedor.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => iniciarEdicion(proveedor)}
                            className="btn btn-contorno h-8"
                          >
                            Editar
                          </button>
                          {proveedor.activo && (
                            <button
                              type="button"
                              onClick={() => setProveedorADesactivar(proveedor)}
                              className="btn btn-peligro h-8"
                            >
                              Desactivar
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
        abierto={proveedorADesactivar !== null}
        titulo="Desactivar proveedor"
        mensaje={`¿Desactivar a ${proveedorADesactivar?.razonSocial ?? ""}? No podrás usarlo en nuevas órdenes de compra.`}
        textoConfirmar="Desactivar"
        tono="peligro"
        procesando={desactivando}
        onConfirmar={() => void confirmarDesactivacion()}
        onCancelar={() => !desactivando && setProveedorADesactivar(null)}
      />
    </div>
  );
}
