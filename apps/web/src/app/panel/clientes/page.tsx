"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  actualizarCliente,
  crearCliente,
  desactivarCliente,
  obtenerClientes,
  type Cliente,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface FormCliente {
  tipoDocIdentidad: string;
  numeroDoc: string;
  razonSocial: string;
  direccion: string;
  telefono: string;
  email: string;
  tipoPrecio: string;
}

/** Niveles de precio de venta aplicables a un cliente. */
const TIPOS_PRECIO: readonly { valor: string; etiqueta: string }[] = [
  { valor: "1", etiqueta: "Público" },
  { valor: "2", etiqueta: "Distribuidor" },
];

/** Tabla 2 SUNAT — tipos de documento de identidad mas usados en clientes. */
const TIPOS_DOC_IDENTIDAD: readonly { codigo: string; etiqueta: string }[] = [
  { codigo: "6", etiqueta: "RUC" },
  { codigo: "1", etiqueta: "DNI" },
  { codigo: "4", etiqueta: "Carnet de extranjería" },
  { codigo: "7", etiqueta: "Pasaporte" },
  { codigo: "0", etiqueta: "Doc. tributario no domiciliado" },
];

const ETIQUETA_DOC: Record<string, string> = Object.fromEntries(
  TIPOS_DOC_IDENTIDAD.map((t) => [t.codigo, t.etiqueta]),
);

const CLIENTE_VACIO: FormCliente = {
  tipoDocIdentidad: "6",
  numeroDoc: "",
  razonSocial: "",
  direccion: "",
  telefono: "",
  email: "",
  tipoPrecio: "1",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function clienteAForm(c: Cliente): FormCliente {
  return {
    tipoDocIdentidad: c.tipoDocIdentidad || "6",
    numeroDoc: c.numeroDoc,
    razonSocial: c.razonSocial,
    direccion: c.direccion ?? "",
    telefono: c.telefono ?? "",
    email: c.email ?? "",
    tipoPrecio: c.tipoPrecio != null ? String(c.tipoPrecio) : "1",
  };
}

export default function PaginaClientes(): React.JSX.Element {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  const [form, setForm] = useState<FormCliente>(CLIENTE_VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [clienteADesactivar, setClienteADesactivar] = useState<Cliente | null>(null);
  const [desactivando, setDesactivando] = useState<boolean>(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setClientes(await obtenerClientes());
      } catch (error) {
        setAviso({
          texto: mensajeError(error, "No se pudieron cargar los clientes."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescar(): Promise<void> {
    try {
      setClientes(await obtenerClientes());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  function actualizarForm(campo: keyof FormCliente, valor: string): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  function iniciarEdicion(cliente: Cliente): void {
    setEditandoId(cliente.id);
    setForm(clienteAForm(cliente));
    setAviso(null);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function cancelarEdicion(): void {
    setEditandoId(null);
    setForm(CLIENTE_VACIO);
    setAviso(null);
  }

  async function manejarCliente(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (!form.numeroDoc.trim() || !form.razonSocial.trim()) {
      setAviso({ texto: "Completa el número de documento y la razón social.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        tipoDocIdentidad: form.tipoDocIdentidad || undefined,
        numeroDoc: form.numeroDoc.trim(),
        razonSocial: form.razonSocial.trim(),
        direccion: form.direccion || undefined,
        telefono: form.telefono || undefined,
        email: form.email || undefined,
        tipoPrecio: form.tipoPrecio ? Number(form.tipoPrecio) : undefined,
      };
      if (editandoId !== null) {
        await actualizarCliente(editandoId, datos);
        setAviso({ texto: "Cliente actualizado.", tono: "exito" });
      } else {
        const respuesta = await crearCliente(datos);
        setAviso({ texto: `Cliente registrado (#${respuesta.id}).`, tono: "exito" });
      }
      setEditandoId(null);
      setForm(CLIENTE_VACIO);
      await refrescar();
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo guardar el cliente."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarDesactivacion(): Promise<void> {
    if (!clienteADesactivar) return;
    setDesactivando(true);
    setAviso(null);
    try {
      await desactivarCliente(clienteADesactivar.id);
      setAviso({
        texto: `Cliente ${clienteADesactivar.razonSocial} desactivado.`,
        tono: "exito",
      });
      if (editandoId === clienteADesactivar.id) cancelarEdicion();
      setClienteADesactivar(null);
      await refrescar();
    } catch (error) {
      setAviso({
        texto: mensajeError(error, "No se pudo desactivar el cliente."),
        tono: "error",
      });
    } finally {
      setDesactivando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Administra el maestro de clientes para las órdenes y comprobantes de venta."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {editandoId !== null ? "Editar cliente" : "Nuevo cliente"}
            </span>
          </div>
          <form onSubmit={manejarCliente} className="space-y-4 p-5">
            {aviso && (
              <div
                role={aviso.tono === "error" ? "alert" : "status"}
                className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
              >
                <span>{aviso.texto}</span>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[1fr_1.2fr]">
              <div>
                <label htmlFor="tipo-doc-identidad" className="etiqueta-campo">
                  Tipo de documento
                </label>
                <select
                  id="tipo-doc-identidad"
                  value={form.tipoDocIdentidad}
                  onChange={(e) => actualizarForm("tipoDocIdentidad", e.target.value)}
                  className="campo"
                >
                  {TIPOS_DOC_IDENTIDAD.map((tipo) => (
                    <option key={tipo.codigo} value={tipo.codigo}>
                      {tipo.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="numero-doc" className="etiqueta-campo">
                  Número de documento
                </label>
                <input
                  id="numero-doc"
                  value={form.numeroDoc}
                  onChange={(e) => actualizarForm("numeroDoc", e.target.value)}
                  inputMode="numeric"
                  required
                  className="campo font-mono"
                />
              </div>
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
                <label htmlFor="email-cliente" className="etiqueta-campo">
                  Email <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="email-cliente"
                  type="email"
                  value={form.email}
                  onChange={(e) => actualizarForm("email", e.target.value)}
                  className="campo"
                />
              </div>
            </div>
            <div>
              <label htmlFor="tipo-precio" className="etiqueta-campo">
                Nivel de precio
              </label>
              <select
                id="tipo-precio"
                value={form.tipoPrecio}
                onChange={(e) => actualizarForm("tipoPrecio", e.target.value)}
                aria-describedby="tipo-precio-ayuda"
                className="campo sm:max-w-xs"
              >
                {TIPOS_PRECIO.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>
                    {tipo.etiqueta}
                  </option>
                ))}
              </select>
              <p id="tipo-precio-ayuda" className="mt-1.5 text-xs text-texto-ter">
                Define qué precio del producto se sugiere al crear órdenes de venta
                para este cliente.
              </p>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={guardando} className="btn btn-primario">
                {guardando
                  ? "Guardando…"
                  : editandoId !== null
                    ? "Guardar cambios"
                    : "Registrar cliente"}
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
            <span className="panel-titulo">Clientes registrados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Razón social</th>
                  <th>Contacto</th>
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
                ) : clientes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-texto-ter">
                      Sin clientes registrados.
                    </td>
                  </tr>
                ) : (
                  clientes.map((cliente) => (
                    <tr key={cliente.id}>
                      <td>
                        <span className="block text-[0.68rem] uppercase tracking-wide text-texto-ter">
                          {ETIQUETA_DOC[cliente.tipoDocIdentidad] ?? "Doc."}
                        </span>
                        <span className="num">{cliente.numeroDoc}</span>
                      </td>
                      <td className="text-tinta">{cliente.razonSocial}</td>
                      <td className="text-texto-sec">
                        {cliente.telefono || cliente.email || "—"}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => iniciarEdicion(cliente)}
                            className="btn btn-contorno h-8"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setClienteADesactivar(cliente)}
                            className="btn btn-peligro h-8"
                          >
                            Desactivar
                          </button>
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
        abierto={clienteADesactivar !== null}
        titulo="Desactivar cliente"
        mensaje={`¿Desactivar a ${clienteADesactivar?.razonSocial ?? ""}? No podrás usarlo en nuevas órdenes de venta.`}
        textoConfirmar="Desactivar"
        tono="peligro"
        procesando={desactivando}
        onConfirmar={() => void confirmarDesactivacion()}
        onCancelar={() => !desactivando && setClienteADesactivar(null)}
      />
    </div>
  );
}
