"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  actualizarTransportista,
  crearTransportista,
  obtenerTransportistas,
  type Transportista,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaTransportistas(): React.JSX.Element {
  const [transportistas, setTransportistas] = useState<Transportista[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const [codigo, setCodigo] = useState<string>("");
  const [nombre, setNombre] = useState<string>("");
  const [ruc, setRuc] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);

  async function refrescar(): Promise<void> {
    try {
      setTransportistas(await obtenerTransportistas());
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudieron cargar los transportistas."), tono: "error" });
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
    if (ruc.trim() !== "" && !/^\d{11}$/.test(ruc.trim())) {
      setAviso({ texto: "El RUC debe tener 11 dígitos.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      await crearTransportista({
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        ruc: ruc.trim() || undefined,
      });
      setAviso({ texto: "Transportista creado.", tono: "exito" });
      setCodigo("");
      setNombre("");
      setRuc("");
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo crear el transportista."), tono: "error" });
    } finally {
      setGuardando(false);
    }
  }

  async function alternarActivo(t: Transportista): Promise<void> {
    setAviso(null);
    try {
      await actualizarTransportista(t.id, { activo: !t.activo });
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo actualizar el transportista."), tono: "error" });
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Transportistas"
        descripcion="Maestro de transportistas para las guías de remisión."
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
            <span className="panel-titulo">Nuevo transportista</span>
          </div>
          <form onSubmit={manejarCrear} className="space-y-4 p-5">
            <div>
              <label htmlFor="codigo" className="etiqueta-campo">
                Código
              </label>
              <input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} className="campo" />
            </div>
            <div>
              <label htmlFor="nombre" className="etiqueta-campo">
                Nombre / Razón social
              </label>
              <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} className="campo" />
            </div>
            <div>
              <label htmlFor="ruc" className="etiqueta-campo">
                RUC <span className="text-texto-ter">(opcional)</span>
              </label>
              <input
                id="ruc"
                value={ruc}
                onChange={(e) => setRuc(e.target.value)}
                inputMode="numeric"
                className="campo font-mono"
              />
            </div>
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : "Crear transportista"}
            </button>
          </form>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Transportistas registrados</span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>RUC</th>
                  <th>Nombre</th>
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
                ) : transportistas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-texto-ter">
                      Sin transportistas registrados.
                    </td>
                  </tr>
                ) : (
                  transportistas.map((t) => (
                    <tr key={t.id}>
                      <td className="font-mono">{t.codigo}</td>
                      <td className="font-mono">{t.ruc ?? "—"}</td>
                      <td>{t.nombre}</td>
                      <td>
                        <span
                          className={t.activo ? "insignia insignia-exito" : "insignia insignia-peligro"}
                        >
                          {t.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          onClick={() => void alternarActivo(t)}
                          className="inline-flex items-center rounded-md border border-borde px-3 py-1.5 text-xs font-medium text-texto-sec transition-colors hover:bg-panel-alt"
                        >
                          {t.activo ? "Desactivar" : "Reactivar"}
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
