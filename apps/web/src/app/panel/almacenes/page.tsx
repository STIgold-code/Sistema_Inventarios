"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  SelectorBusqueda,
  type OpcionSelector,
} from "@/componentes/selector-busqueda";
import {
  actualizarZona,
  crearAlmacen,
  crearSucursal,
  crearZona,
  darBajaZona,
  ErrorApi,
  obtenerAlmacenesDetalle,
  obtenerSucursales,
  obtenerZonas,
  type AlmacenDetalle,
  type Sucursal,
  type Zona,
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

  // Gestión de zonas
  const [almZonaId, setAlmZonaId] = useState<string>("");
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [cargandoZonas, setCargandoZonas] = useState<boolean>(false);
  const [avisoZona, setAvisoZona] = useState<Aviso | null>(null);
  const [guardandoZona, setGuardandoZona] = useState<boolean>(false);
  // edición: id de la zona en edición, o "nueva" para alta
  const [edicionZona, setEdicionZona] = useState<string | null>(null);
  const [codZona, setCodZona] = useState<string>("");
  const [nomZona, setNomZona] = useState<string>("");
  const [zonaBaja, setZonaBaja] = useState<Zona | null>(null);
  const [procesandoBaja, setProcesandoBaja] = useState<boolean>(false);

  const recargarZonas = useCallback(async (almacenId: string): Promise<void> => {
    if (!almacenId) {
      setZonas([]);
      return;
    }
    setCargandoZonas(true);
    try {
      setZonas(await obtenerZonas(Number(almacenId)));
    } finally {
      setCargandoZonas(false);
    }
  }, []);

  useEffect(() => {
    void recargarZonas(almZonaId);
    setEdicionZona(null);
    setAvisoZona(null);
  }, [almZonaId, recargarZonas]);

  function abrirAltaZona(): void {
    setEdicionZona("nueva");
    setCodZona("");
    setNomZona("");
    setAvisoZona(null);
  }

  function abrirEdicionZona(zona: Zona): void {
    setEdicionZona(zona.id);
    setCodZona(zona.codigo);
    setNomZona(zona.nombre);
    setAvisoZona(null);
  }

  async function guardarZona(): Promise<void> {
    setAvisoZona(null);
    if (!almZonaId) return setAvisoZona({ texto: "Selecciona un almacén.", tono: "error" });
    if (!codZona.trim() || !nomZona.trim()) {
      return setAvisoZona({ texto: "Completa el código y el nombre.", tono: "error" });
    }
    setGuardandoZona(true);
    try {
      if (edicionZona === "nueva") {
        await crearZona(Number(almZonaId), { codigo: codZona.trim(), nombre: nomZona.trim() });
        setAvisoZona({ texto: "Zona creada.", tono: "exito" });
      } else if (edicionZona) {
        await actualizarZona(Number(almZonaId), Number(edicionZona), {
          codigo: codZona.trim(),
          nombre: nomZona.trim(),
        });
        setAvisoZona({ texto: "Zona actualizada.", tono: "exito" });
      }
      setEdicionZona(null);
      await recargarZonas(almZonaId);
    } catch (error) {
      setAvisoZona({ texto: mensajeError(error, "No se pudo guardar la zona."), tono: "error" });
    } finally {
      setGuardandoZona(false);
    }
  }

  async function confirmarBajaZona(): Promise<void> {
    if (!zonaBaja || !almZonaId) return;
    setProcesandoBaja(true);
    try {
      await darBajaZona(Number(almZonaId), Number(zonaBaja.id));
      setAvisoZona({ texto: "Zona dada de baja.", tono: "exito" });
      setZonaBaja(null);
      await recargarZonas(almZonaId);
    } catch (error) {
      setAvisoZona({ texto: mensajeError(error, "No se pudo dar de baja la zona."), tono: "error" });
    } finally {
      setProcesandoBaja(false);
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

  const opcionesSucursal = useMemo<OpcionSelector[]>(
    () =>
      sucursales.map((s) => ({
        valor: s.id,
        etiqueta: `${s.codigo} — ${s.nombre}`,
      })),
    [sucursales],
  );

  const opcionesAlmacenZona = useMemo<OpcionSelector[]>(
    () =>
      almacenes.map((a) => ({
        valor: a.id,
        etiqueta: `${a.codigo} — ${a.nombre} (${a.sucursal})`,
      })),
    [almacenes],
  );

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
              <SelectorBusqueda
                id="suc"
                opciones={opcionesSucursal}
                valor={sucursalId}
                onCambio={setSucursalId}
                placeholder={
                  sucursales.length === 0
                    ? "Crea una sucursal primero"
                    : "Selecciona una sucursal"
                }
                ariaLabel="Sucursal"
              />
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

      {/* Zonas por almacén */}
      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Zonas por almacén</span>
          {almZonaId && <span className="text-xs text-texto-sec">{zonas.length}</span>}
        </div>
        <div className="space-y-4 p-5">
          {avisoZona && (
            <div
              role={avisoZona.tono === "error" ? "alert" : "status"}
              className={`aviso ${avisoZona.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
            >
              <span>{avisoZona.texto}</span>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-4">
            <div className="grow">
              <label htmlFor="almZona" className="etiqueta-campo">Almacén</label>
              <SelectorBusqueda
                id="almZona"
                opciones={opcionesAlmacenZona}
                valor={almZonaId}
                onCambio={setAlmZonaId}
                placeholder="Selecciona un almacén"
                ariaLabel="Almacén"
              />
            </div>
            {almZonaId && edicionZona === null && (
              <button type="button" onClick={abrirAltaZona} className="btn btn-primario">
                Nueva zona
              </button>
            )}
          </div>

          {edicionZona !== null && (
            <div className="rounded-lg border border-borde bg-fondo-sutil p-4">
              <p className="mb-3 text-sm font-medium text-tinta">
                {edicionZona === "nueva" ? "Nueva zona" : "Editar zona"}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label htmlFor="codZona" className="etiqueta-campo">Código</label>
                  <input
                    id="codZona"
                    className="campo font-mono"
                    value={codZona}
                    onChange={(e) => setCodZona(e.target.value)}
                    placeholder="A1"
                  />
                </div>
                <div>
                  <label htmlFor="nomZona" className="etiqueta-campo">Nombre</label>
                  <input
                    id="nomZona"
                    className="campo"
                    value={nomZona}
                    onChange={(e) => setNomZona(e.target.value)}
                    placeholder="Pasillo A — Estante 1"
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={guardarZona}
                  disabled={guardandoZona}
                  className="btn btn-primario"
                >
                  {guardandoZona ? "Guardando…" : "Guardar"}
                </button>
                <button
                  type="button"
                  onClick={() => setEdicionZona(null)}
                  disabled={guardandoZona}
                  className="btn btn-contorno"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {!almZonaId ? (
            <p className="py-6 text-center text-sm text-texto-ter">
              Selecciona un almacén para ver y gestionar sus zonas.
            </p>
          ) : cargandoZonas ? (
            <p className="py-6 text-center text-sm text-texto-ter">Cargando…</p>
          ) : zonas.length === 0 ? (
            <p className="py-6 text-center text-sm text-texto-ter">Este almacén aún no tiene zonas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Estado</th>
                    <th className="text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {zonas.map((z) => (
                    <tr key={z.id}>
                      <td className="font-mono text-texto-sec">{z.codigo}</td>
                      <td className="text-tinta">{z.nombre}</td>
                      <td>
                        <span className={`insignia ${z.activo ? "insignia-exito" : "insignia-neutra"}`}>
                          {z.activo ? "Activa" : "De baja"}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicionZona(z)}
                            className="btn btn-contorno btn-sm"
                          >
                            Editar
                          </button>
                          {z.activo && (
                            <button
                              type="button"
                              onClick={() => setZonaBaja(z)}
                              className="btn btn-peligro btn-sm"
                            >
                              Dar de baja
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <ModalConfirmacion
        abierto={zonaBaja !== null}
        titulo="Dar de baja zona"
        mensaje={
          zonaBaja
            ? `¿Confirmas dar de baja la zona ${zonaBaja.codigo} — ${zonaBaja.nombre}? Dejará de estar disponible para asignar.`
            : ""
        }
        textoConfirmar="Dar de baja"
        tono="peligro"
        procesando={procesandoBaja}
        onConfirmar={confirmarBajaZona}
        onCancelar={() => setZonaBaja(null)}
      />
    </div>
  );
}
