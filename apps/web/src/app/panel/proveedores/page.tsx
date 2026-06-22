"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
import type { OpcionSelector } from "@/componentes/selector-busqueda";
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

/** Tabla 2 SUNAT — tipos de documento de identidad mas usados en proveedores. */
const OPCIONES_TIPO_DOC_IDENTIDAD: OpcionSelector[] = [
  { valor: "6", etiqueta: "RUC" },
  { valor: "1", etiqueta: "DNI" },
  { valor: "4", etiqueta: "Carnet de extranjería" },
  { valor: "7", etiqueta: "Pasaporte" },
];

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

export default function PaginaProveedores(): React.JSX.Element {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [busqueda, setBusqueda] = useState<string>("");

  const [panelAbierto, setPanelAbierto] = useState<boolean>(false);
  const [form, setForm] = useState<FormProveedor>(PROVEEDOR_VACIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState<boolean>(false);

  // Aviso de lista (arriba de la tabla) y aviso del formulario (dentro del panel).
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  const [proveedorADesactivar, setProveedorADesactivar] = useState<Proveedor | null>(null);
  const [desactivando, setDesactivando] = useState<boolean>(false);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        setProveedores(await obtenerProveedores());
      } catch (error) {
        setAvisoLista({
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

  function abrirNuevo(): void {
    setEditandoId(null);
    setForm(PROVEEDOR_VACIO);
    setAvisoForm(null);
    setPanelAbierto(true);
  }

  function abrirEdicion(proveedor: Proveedor): void {
    setEditandoId(proveedor.id);
    setForm(proveedorAForm(proveedor));
    setAvisoForm(null);
    setPanelAbierto(true);
  }

  function cerrarPanel(): void {
    if (guardando) return;
    setPanelAbierto(false);
    setEditandoId(null);
    setForm(PROVEEDOR_VACIO);
    setAvisoForm(null);
  }

  async function manejarProveedor(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    if (editandoId === null && !/^\d{11}$/.test(form.ruc)) {
      setAvisoForm({ texto: "El RUC debe tener 11 dígitos.", tono: "error" });
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
        setAvisoLista({ texto: "Proveedor actualizado.", tono: "exito" });
      } else {
        const respuesta = await crearProveedor({ ruc: form.ruc, ...camposOpcionales });
        setAvisoLista({
          texto: `Proveedor registrado (#${respuesta.id}).`,
          tono: "exito",
        });
      }
      setPanelAbierto(false);
      setEditandoId(null);
      setForm(PROVEEDOR_VACIO);
      await refrescarProveedores();
    } catch (error) {
      setAvisoForm({
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
    try {
      await desactivarProveedor(proveedorADesactivar.id);
      setAvisoLista({
        texto: `Proveedor ${proveedorADesactivar.razonSocial} desactivado.`,
        tono: "exito",
      });
      setProveedorADesactivar(null);
      await refrescarProveedores();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo desactivar el proveedor."),
        tono: "error",
      });
    } finally {
      setDesactivando(false);
    }
  }

  const termino = busqueda.trim().toLowerCase();
  const visibles = termino
    ? proveedores.filter(
        (p) =>
          p.razonSocial.toLowerCase().includes(termino) ||
          p.ruc.includes(termino) ||
          (p.contactoNombre ?? "").toLowerCase().includes(termino),
      )
    : proveedores;

  return (
    <div>
      <EncabezadoPagina
        titulo="Proveedores"
        descripcion="Registra y administra los proveedores de la empresa."
      />

      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Proveedores registrados
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({proveedores.length})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="buscar-prov" className="sr-only">
              Buscar proveedor
            </label>
            <input
              id="buscar-prov"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por RUC, razón social o contacto…"
              className="campo w-72"
            />
            <button type="button" onClick={abrirNuevo} className="btn btn-primario whitespace-nowrap">
              Nuevo proveedor
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>RUC</th>
                <th>Razón social</th>
                <th>Contacto</th>
                <th>Condición de pago</th>
                <th>Moneda</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={7} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-texto-ter">
                    {termino ? "Sin coincidencias." : "Sin proveedores registrados."}
                  </td>
                </tr>
              ) : (
                visibles.map((proveedor) => (
                  <tr key={proveedor.id}>
                    <td className="num">{proveedor.ruc}</td>
                    <td className="text-tinta">{proveedor.razonSocial}</td>
                    <td className="text-texto-sec">
                      {proveedor.contactoNombre || proveedor.telefono || "—"}
                    </td>
                    <td className="text-texto-sec">{proveedor.condicionPago || "—"}</td>
                    <td className="text-texto-sec">{proveedor.monedaHabitual || "—"}</td>
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
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => abrirEdicion(proveedor)}
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

      <PanelLateral
        abierto={panelAbierto}
        titulo={editandoId !== null ? "Editar proveedor" : "Nuevo proveedor"}
        descripcion={
          editandoId !== null
            ? "Modifica los datos del proveedor."
            : "Registra un proveedor nuevo."
        }
        onCerrar={cerrarPanel}
      >
        <form onSubmit={manejarProveedor} className="space-y-4">
          {avisoForm && <AvisoLinea aviso={avisoForm} />}
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
              <p className="mt-1.5 text-xs text-texto-ter">El RUC no se puede modificar.</p>
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
                {OPCIONES_TIPO_DOC_IDENTIDAD.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
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
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando
                ? "Guardando…"
                : editandoId !== null
                  ? "Guardar cambios"
                  : "Registrar proveedor"}
            </button>
            <button type="button" onClick={cerrarPanel} className="btn btn-contorno">
              Cancelar
            </button>
          </div>
        </form>
      </PanelLateral>

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
