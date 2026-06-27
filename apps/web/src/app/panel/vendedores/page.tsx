"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  actualizarVendedor,
  crearVendedor,
  obtenerVendedores,
  type Vendedor,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaVendedores(): React.JSX.Element {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const [codigo, setCodigo] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [documento, setDocumento] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);

  async function refrescar(): Promise<void> {
    try {
      setVendedores(await obtenerVendedores());
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudieron cargar los vendedores."), tono: "error" });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void refrescar();
  }, []);

  async function manejarCrear(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (codigo.trim() === "" || nombre.trim() === "") {
      setAviso({ texto: "El código y el nombre son obligatorios.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      await crearVendedor({
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        documento: documento.trim() || undefined,
      });
      setAviso({ texto: "Vendedor creado.", tono: "exito" });
      setCodigo("");
      setNombre("");
      setDocumento("");
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo crear el vendedor."), tono: "error" });
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(vendedor: Vendedor): Promise<void> {
    setAviso(null);
    try {
      await actualizarVendedor(vendedor.id, { activo: !vendedor.activo });
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo actualizar el vendedor."), tono: "error" });
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Vendedores"
        descripcion="Asesores comerciales. Se asignan al cliente y a la venta para los reportes por vendedor."
      />

      {aviso && (
        <div
          role={aviso.tono === "error" ? "alert" : "status"}
          className={`aviso mt-4 ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
        >
          <span>{aviso.texto}</span>
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[20rem_1fr]">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nuevo vendedor</span>
          </div>
          <form onSubmit={manejarCrear} className="space-y-4 p-5">
            <div>
              <label htmlFor="codigo" className="etiqueta-campo">
                Código
              </label>
              <input
                id="codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="nombre" className="etiqueta-campo">
                Nombre
              </label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="campo"
              />
            </div>
            <div>
              <label htmlFor="documento" className="etiqueta-campo">
                Documento <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id="documento"
                value={documento}
                onChange={(e) => setDocumento(e.target.value)}
                className="campo"
              />
            </div>
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : "Crear vendedor"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Vendedores registrados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Documento</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cargando ? (
                  <tr>
                    <td colSpan={5} className="text-texto-ter">
                      Cargando…
                    </td>
                  </tr>
                ) : vendedores.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-texto-ter">
                      Sin vendedores registrados.
                    </td>
                  </tr>
                ) : (
                  vendedores.map((v) => (
                    <tr key={v.id}>
                      <td className="font-mono">{v.codigo}</td>
                      <td>{v.nombre}</td>
                      <td>{v.documento ?? "—"}</td>
                      <td>
                        <span
                          className={
                            v.activo ? "insignia insignia-exito" : "insignia insignia-peligro"
                          }
                        >
                          {v.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => void alternarActivo(v)}
                          className="inline-flex items-center rounded-md border border-borde px-3 py-1.5 text-xs font-medium text-texto-sec transition-colors hover:bg-panel-alt"
                        >
                          {v.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
