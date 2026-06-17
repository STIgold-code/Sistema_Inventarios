"use client";

import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  crearAlmacen,
  crearSucursal,
  ErrorApi,
  obtenerAlmacenesDetalle,
  obtenerSucursales,
  type AlmacenDetalle,
  type Sucursal,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaAlmacenes(): React.JSX.Element {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [almacenes, setAlmacenes] = useState<AlmacenDetalle[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);

  // Form almacén
  const [sucursalId, setSucursalId] = useState<string>("");
  const [codAlm, setCodAlm] = useState<string>("");
  const [nomAlm, setNomAlm] = useState<string>("");
  const [avisoAlm, setAvisoAlm] = useState<Aviso | null>(null);
  const [guardandoAlm, setGuardandoAlm] = useState<boolean>(false);

  // Form sucursal
  const [codSuc, setCodSuc] = useState<string>("");
  const [nomSuc, setNomSuc] = useState<string>("");
  const [avisoSuc, setAvisoSuc] = useState<Aviso | null>(null);
  const [guardandoSuc, setGuardandoSuc] = useState<boolean>(false);

  async function recargar(): Promise<void> {
    const [suc, alm] = await Promise.all([obtenerSucursales(), obtenerAlmacenesDetalle()]);
    setSucursales(suc);
    setAlmacenes(alm);
    if (!sucursalId && suc[0]) setSucursalId(suc[0].id);
  }

  useEffect(() => {
    void (async () => {
      try {
        await recargar();
      } finally {
        setCargando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function guardarAlmacen(): Promise<void> {
    setAvisoAlm(null);
    if (!sucursalId) return setAvisoAlm({ texto: "Selecciona una sucursal.", tono: "error" });
    if (!codAlm.trim() || !nomAlm.trim()) {
      return setAvisoAlm({ texto: "Completa el código y el nombre.", tono: "error" });
    }
    setGuardandoAlm(true);
    try {
      await crearAlmacen({ sucursalId: Number(sucursalId), codigo: codAlm.trim(), nombre: nomAlm.trim() });
      setAvisoAlm({ texto: "Almacén creado.", tono: "exito" });
      setCodAlm("");
      setNomAlm("");
      await recargar();
    } catch (error) {
      setAvisoAlm({ texto: mensajeError(error, "No se pudo crear el almacén."), tono: "error" });
    } finally {
      setGuardandoAlm(false);
    }
  }

  async function guardarSucursal(): Promise<void> {
    setAvisoSuc(null);
    if (!codSuc.trim() || !nomSuc.trim()) {
      return setAvisoSuc({ texto: "Completa el código y el nombre.", tono: "error" });
    }
    setGuardandoSuc(true);
    try {
      await crearSucursal({ codigo: codSuc.trim(), nombre: nomSuc.trim() });
      setAvisoSuc({ texto: "Sucursal creada.", tono: "exito" });
      setCodSuc("");
      setNomSuc("");
      await recargar();
    } catch (error) {
      setAvisoSuc({ texto: mensajeError(error, "No se pudo crear la sucursal."), tono: "error" });
    } finally {
      setGuardandoSuc(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Almacenes"
        descripcion="Gestiona las sucursales y los almacenes donde se guarda el inventario."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Almacenes */}
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nuevo almacén</span>
          </div>
          <div className="space-y-4 p-5">
            {avisoAlm && (
              <div
                role={avisoAlm.tono === "error" ? "alert" : "status"}
                className={`aviso ${avisoAlm.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
              >
                <span>{avisoAlm.texto}</span>
              </div>
            )}
            <div>
              <label htmlFor="suc" className="etiqueta-campo">Sucursal</label>
              <select id="suc" className="campo" value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
                {sucursales.length === 0 && <option value="">Crea una sucursal primero</option>}
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>{s.codigo} — {s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="codAlm" className="etiqueta-campo">Código</label>
                <input id="codAlm" className="campo font-mono" value={codAlm} onChange={(e) => setCodAlm(e.target.value)} placeholder="03" />
              </div>
              <div>
                <label htmlFor="nomAlm" className="etiqueta-campo">Nombre</label>
                <input id="nomAlm" className="campo" value={nomAlm} onChange={(e) => setNomAlm(e.target.value)} placeholder="Almacén de obra" />
              </div>
            </div>
            <button type="button" onClick={guardarAlmacen} disabled={guardandoAlm} className="btn btn-primario">
              {guardandoAlm ? "Guardando…" : "Crear almacén"}
            </button>
          </div>
        </section>

        {/* Sucursales */}
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nueva sucursal</span>
          </div>
          <div className="space-y-4 p-5">
            {avisoSuc && (
              <div
                role={avisoSuc.tono === "error" ? "alert" : "status"}
                className={`aviso ${avisoSuc.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
              >
                <span>{avisoSuc.texto}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
              <div>
                <label htmlFor="codSuc" className="etiqueta-campo">Código</label>
                <input id="codSuc" className="campo font-mono" value={codSuc} onChange={(e) => setCodSuc(e.target.value)} placeholder="LIMA" />
              </div>
              <div>
                <label htmlFor="nomSuc" className="etiqueta-campo">Nombre</label>
                <input id="nomSuc" className="campo" value={nomSuc} onChange={(e) => setNomSuc(e.target.value)} placeholder="Sucursal Lima" />
              </div>
            </div>
            <button type="button" onClick={guardarSucursal} disabled={guardandoSuc} className="btn btn-contorno">
              {guardandoSuc ? "Guardando…" : "Crear sucursal"}
            </button>
          </div>
        </section>
      </div>

      {/* Listado de almacenes */}
      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Almacenes registrados</span>
          <span className="text-xs text-texto-sec">{almacenes.length}</span>
        </div>
        <div className="overflow-x-auto">
          {cargando ? (
            <p className="px-5 py-8 text-center text-sm text-texto-ter">Cargando…</p>
          ) : almacenes.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-texto-ter">Aún no hay almacenes.</p>
          ) : (
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Sucursal</th>
                </tr>
              </thead>
              <tbody>
                {almacenes.map((a) => (
                  <tr key={a.id}>
                    <td className="font-mono text-texto-sec">{a.codigo}</td>
                    <td className="text-tinta">{a.nombre}</td>
                    <td className="text-texto-sec">{a.sucursal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
