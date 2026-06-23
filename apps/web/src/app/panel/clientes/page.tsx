"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
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

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Errores derivados del formulario, una entrada por campo inválido.
 * Única fuente de verdad: el submit reutiliza esta misma función.
 */
function calcularErrores(form: FormCliente): Partial<Record<keyof FormCliente, string>> {
  const errores: Partial<Record<keyof FormCliente, string>> = {};

  const numeroDoc = form.numeroDoc.trim();
  if (!numeroDoc) {
    errores.numeroDoc = "El número de documento es obligatorio.";
  } else if (form.tipoDocIdentidad === "6" && !/^\d{11}$/.test(numeroDoc)) {
    errores.numeroDoc = "El RUC debe tener 11 dígitos.";
  } else if (form.tipoDocIdentidad === "1" && !/^\d{8}$/.test(numeroDoc)) {
    errores.numeroDoc = "El DNI debe tener 8 dígitos.";
  }

  if (!form.razonSocial.trim()) {
    errores.razonSocial = "La razón social es obligatoria.";
  }
  if (form.email.trim() && !REGEX_EMAIL.test(form.email.trim())) {
    errores.email = "Ingresa un email válido.";
  }
  return errores;
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

function etiquetaPrecio(valor: number | null | undefined): string {
  if (valor == null) return "Público";
  return TIPOS_PRECIO.find((t) => t.valor === String(valor))?.etiqueta ?? "Público";
}

function AvisoLinea({ aviso }: { aviso: Aviso }): React.JSX.Element {
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
    >
      <span>{aviso.texto}</span>
    </div>
  );
}

export default function PaginaClientes(): React.JSX.Element {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [busqueda, setBusqueda] = useState<string>("");

  const [panelAbierto, setPanelAbierto] = useState<boolean>(false);
  const [form, setForm] = useState<FormCliente>(CLIENTE_VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);

  // Aviso de lista (arriba de la tabla) y aviso del formulario (dentro del panel).
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  const [clienteADesactivar, setClienteADesactivar] = useState<Cliente | null>(null);
  const [desactivando, setDesactivando] = useState<boolean>(false);

  // Visibilidad del feedback inline: el error existe siempre (derivado),
  // pero solo se muestra tras tocar el campo o intentar enviar.
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [intentoEnvio, setIntentoEnvio] = useState<boolean>(false);

  const errores = useMemo(() => calcularErrores(form), [form]);

  function errorVisible(campo: keyof FormCliente): string | undefined {
    if (!tocado[campo] && !intentoEnvio) return undefined;
    return errores[campo];
  }

  function marcarTocado(campo: keyof FormCliente): void {
    setTocado((previo) => ({ ...previo, [campo]: true }));
  }

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setClientes(await obtenerClientes());
      } catch (error) {
        setAvisoLista({
          texto: mensajeError(error, "No se pudieron cargar los clientes."),
          tono: "error",
        });
      } finally {
        setCargando(false);
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

  function abrirNuevo(): void {
    setEditandoId(null);
    setForm(CLIENTE_VACIO);
    setAvisoForm(null);
    setTocado({});
    setIntentoEnvio(false);
    setPanelAbierto(true);
  }

  function abrirEdicion(cliente: Cliente): void {
    setEditandoId(cliente.id);
    setForm(clienteAForm(cliente));
    setAvisoForm(null);
    setTocado({});
    setIntentoEnvio(false);
    setPanelAbierto(true);
  }

  function cerrarPanel(): void {
    if (guardando) return;
    setPanelAbierto(false);
    setEditandoId(null);
    setForm(CLIENTE_VACIO);
    setAvisoForm(null);
    setTocado({});
    setIntentoEnvio(false);
  }

  async function manejarCliente(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    setIntentoEnvio(true);
    if (Object.keys(errores).length > 0) return;
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
        setAvisoLista({ texto: "Cliente actualizado.", tono: "exito" });
      } else {
        const respuesta = await crearCliente(datos);
        setAvisoLista({ texto: `Cliente registrado (#${respuesta.id}).`, tono: "exito" });
      }
      setPanelAbierto(false);
      setEditandoId(null);
      setForm(CLIENTE_VACIO);
      setTocado({});
      setIntentoEnvio(false);
      await refrescar();
    } catch (error) {
      setAvisoForm({
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
    try {
      await desactivarCliente(clienteADesactivar.id);
      setAvisoLista({
        texto: `Cliente ${clienteADesactivar.razonSocial} desactivado.`,
        tono: "exito",
      });
      setClienteADesactivar(null);
      await refrescar();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo desactivar el cliente."),
        tono: "error",
      });
    } finally {
      setDesactivando(false);
    }
  }

  const termino = busqueda.trim().toLowerCase();
  const visibles = termino
    ? clientes.filter(
        (c) =>
          c.razonSocial.toLowerCase().includes(termino) ||
          c.numeroDoc.includes(termino),
      )
    : clientes;

  return (
    <div>
      <EncabezadoPagina
        titulo="Clientes"
        descripcion="Administra el maestro de clientes para las órdenes y comprobantes de venta."
      />

      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Clientes registrados
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({clientes.length})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="buscar-cliente" className="sr-only">
              Buscar cliente
            </label>
            <input
              id="buscar-cliente"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por documento o razón social…"
              className="campo w-72"
            />
            <button type="button" onClick={abrirNuevo} className="btn btn-primario whitespace-nowrap">
              Nuevo cliente
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Documento</th>
                <th>Razón social</th>
                <th>Contacto</th>
                <th>Nivel de precio</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={5} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-texto-ter">
                    {termino ? "Sin coincidencias." : "Sin clientes registrados."}
                  </td>
                </tr>
              ) : (
                visibles.map((cliente) => (
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
                    <td className="text-texto-sec">{etiquetaPrecio(cliente.tipoPrecio)}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicion(cliente)}
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

      <PanelLateral
        abierto={panelAbierto}
        titulo={editandoId !== null ? "Editar cliente" : "Nuevo cliente"}
        descripcion={
          editandoId !== null
            ? "Modifica los datos del cliente."
            : "Registra un cliente nuevo."
        }
        onCerrar={cerrarPanel}
      >
        <form onSubmit={manejarCliente} className="space-y-4">
          {avisoForm && <AvisoLinea aviso={avisoForm} />}
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
                {TIPOS_DOC_IDENTIDAD.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.etiqueta}
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
                onBlur={() => marcarTocado("numeroDoc")}
                inputMode="numeric"
                required
                aria-invalid={errorVisible("numeroDoc") ? "true" : undefined}
                className="campo font-mono"
              />
              {errorVisible("numeroDoc") && (
                <p className="mt-1.5 text-xs text-peligro">{errorVisible("numeroDoc")}</p>
              )}
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
              onBlur={() => marcarTocado("razonSocial")}
              required
              aria-invalid={errorVisible("razonSocial") ? "true" : undefined}
              className="campo"
            />
            {errorVisible("razonSocial") && (
              <p className="mt-1.5 text-xs text-peligro">{errorVisible("razonSocial")}</p>
            )}
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
                onBlur={() => marcarTocado("email")}
                aria-invalid={errorVisible("email") ? "true" : undefined}
                className="campo"
              />
              {errorVisible("email") && (
                <p className="mt-1.5 text-xs text-peligro">{errorVisible("email")}</p>
              )}
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
              className="campo"
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
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando
                ? "Guardando…"
                : editandoId !== null
                  ? "Guardar cambios"
                  : "Registrar cliente"}
            </button>
            <button type="button" onClick={cerrarPanel} className="btn btn-contorno">
              Cancelar
            </button>
          </div>
        </form>
      </PanelLateral>

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
