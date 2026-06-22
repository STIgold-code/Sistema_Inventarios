"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
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

export default function PaginaAlmacenes(): React.JSX.Element {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [almacenes, setAlmacenes] = useState<AlmacenDetalle[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [busqueda, setBusqueda] = useState<string>("");
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);

  // Panel "Nuevo almacén" (el backend solo permite crear almacenes).
  const [panelAlmAbierto, setPanelAlmAbierto] = useState<boolean>(false);
  const [sucursalId, setSucursalId] = useState<string>("");
  const [codAlm, setCodAlm] = useState<string>("");
  const [nomAlm, setNomAlm] = useState<string>("");
  const [avisoAlm, setAvisoAlm] = useState<Aviso | null>(null);
  const [guardandoAlm, setGuardandoAlm] = useState<boolean>(false);

  // Panel "Nueva sucursal".
  const [panelSucAbierto, setPanelSucAbierto] = useState<boolean>(false);
  const [codSuc, setCodSuc] = useState<string>("");
  const [nomSuc, setNomSuc] = useState<string>("");
  const [avisoSuc, setAvisoSuc] = useState<Aviso | null>(null);
  const [guardandoSuc, setGuardandoSuc] = useState<boolean>(false);

  // Panel "Zonas de {almacén}".
  const [almacenZonas, setAlmacenZonas] = useState<AlmacenDetalle | null>(null);
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [cargandoZonas, setCargandoZonas] = useState<boolean>(false);
  const [avisoZona, setAvisoZona] = useState<Aviso | null>(null);
  const [guardandoZona, setGuardandoZona] = useState<boolean>(false);
  // edición de zona: "nueva" para alta, id de la zona para editar, o null sin formulario.
  const [edicionZona, setEdicionZona] = useState<string | null>(null);
  const [codZona, setCodZona] = useState<string>("");
  const [nomZona, setNomZona] = useState<string>("");
  const [zonaBaja, setZonaBaja] = useState<Zona | null>(null);
  const [procesandoBaja, setProcesandoBaja] = useState<boolean>(false);

  const recargar = useCallback(async (): Promise<void> => {
    const [suc, alm] = await Promise.all([
      obtenerSucursales(),
      obtenerAlmacenesDetalle(),
    ]);
    setSucursales(suc);
    setAlmacenes(alm);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await recargar();
      } catch (error) {
        setAvisoLista({
          texto: mensajeError(error, "No se pudieron cargar los almacenes."),
          tono: "error",
        });
      } finally {
        setCargando(false);
      }
    })();
  }, [recargar]);

  // --- Almacén ---
  function abrirNuevoAlmacen(): void {
    setSucursalId(sucursales[0]?.id ?? "");
    setCodAlm("");
    setNomAlm("");
    setAvisoAlm(null);
    setPanelAlmAbierto(true);
  }

  function cerrarPanelAlmacen(): void {
    if (guardandoAlm) return;
    setPanelAlmAbierto(false);
    setAvisoAlm(null);
  }

  async function guardarAlmacen(): Promise<void> {
    setAvisoAlm(null);
    if (!sucursalId) {
      setAvisoAlm({ texto: "Selecciona una sucursal.", tono: "error" });
      return;
    }
    if (!codAlm.trim() || !nomAlm.trim()) {
      setAvisoAlm({ texto: "Completa el código y el nombre.", tono: "error" });
      return;
    }
    setGuardandoAlm(true);
    try {
      await crearAlmacen({
        sucursalId: Number(sucursalId),
        codigo: codAlm.trim(),
        nombre: nomAlm.trim(),
      });
      setAvisoLista({ texto: "Almacén creado.", tono: "exito" });
      setPanelAlmAbierto(false);
      await recargar();
    } catch (error) {
      setAvisoAlm({
        texto: mensajeError(error, "No se pudo crear el almacén."),
        tono: "error",
      });
    } finally {
      setGuardandoAlm(false);
    }
  }

  // --- Sucursal ---
  function abrirNuevaSucursal(): void {
    setCodSuc("");
    setNomSuc("");
    setAvisoSuc(null);
    setPanelSucAbierto(true);
  }

  function cerrarPanelSucursal(): void {
    if (guardandoSuc) return;
    setPanelSucAbierto(false);
    setAvisoSuc(null);
  }

  async function guardarSucursal(): Promise<void> {
    setAvisoSuc(null);
    if (!codSuc.trim() || !nomSuc.trim()) {
      setAvisoSuc({ texto: "Completa el código y el nombre.", tono: "error" });
      return;
    }
    setGuardandoSuc(true);
    try {
      await crearSucursal({ codigo: codSuc.trim(), nombre: nomSuc.trim() });
      setAvisoLista({ texto: "Sucursal creada.", tono: "exito" });
      setPanelSucAbierto(false);
      await recargar();
    } catch (error) {
      setAvisoSuc({
        texto: mensajeError(error, "No se pudo crear la sucursal."),
        tono: "error",
      });
    } finally {
      setGuardandoSuc(false);
    }
  }

  // --- Zonas ---
  const recargarZonas = useCallback(async (almacenId: string): Promise<void> => {
    setCargandoZonas(true);
    try {
      setZonas(await obtenerZonas(Number(almacenId)));
    } finally {
      setCargandoZonas(false);
    }
  }, []);

  function abrirPanelZonas(almacen: AlmacenDetalle): void {
    setAlmacenZonas(almacen);
    setEdicionZona(null);
    setAvisoZona(null);
    setZonas([]);
    void recargarZonas(almacen.id);
  }

  function cerrarPanelZonas(): void {
    if (guardandoZona) return;
    setAlmacenZonas(null);
    setEdicionZona(null);
    setAvisoZona(null);
  }

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
    if (!almacenZonas) return;
    setAvisoZona(null);
    if (!codZona.trim() || !nomZona.trim()) {
      setAvisoZona({ texto: "Completa el código y el nombre.", tono: "error" });
      return;
    }
    setGuardandoZona(true);
    try {
      if (edicionZona === "nueva") {
        await crearZona(Number(almacenZonas.id), {
          codigo: codZona.trim(),
          nombre: nomZona.trim(),
        });
        setAvisoZona({ texto: "Zona creada.", tono: "exito" });
      } else if (edicionZona) {
        await actualizarZona(Number(almacenZonas.id), Number(edicionZona), {
          codigo: codZona.trim(),
          nombre: nomZona.trim(),
        });
        setAvisoZona({ texto: "Zona actualizada.", tono: "exito" });
      }
      setEdicionZona(null);
      await recargarZonas(almacenZonas.id);
    } catch (error) {
      setAvisoZona({
        texto: mensajeError(error, "No se pudo guardar la zona."),
        tono: "error",
      });
    } finally {
      setGuardandoZona(false);
    }
  }

  async function confirmarBajaZona(): Promise<void> {
    if (!zonaBaja || !almacenZonas) return;
    setProcesandoBaja(true);
    try {
      await darBajaZona(Number(almacenZonas.id), Number(zonaBaja.id));
      setAvisoZona({ texto: "Zona dada de baja.", tono: "exito" });
      setZonaBaja(null);
      await recargarZonas(almacenZonas.id);
    } catch (error) {
      setAvisoZona({
        texto: mensajeError(error, "No se pudo dar de baja la zona."),
        tono: "error",
      });
    } finally {
      setProcesandoBaja(false);
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

  const termino = busqueda.trim().toLowerCase();
  const visibles = termino
    ? almacenes.filter(
        (a) =>
          a.codigo.toLowerCase().includes(termino) ||
          a.nombre.toLowerCase().includes(termino) ||
          a.sucursal.toLowerCase().includes(termino),
      )
    : almacenes;

  return (
    <div>
      <EncabezadoPagina
        titulo="Almacenes"
        descripcion="Gestiona las sucursales, los almacenes y sus zonas de almacenamiento."
      />

      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Almacenes registrados
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({almacenes.length})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="buscar-alm" className="sr-only">
              Buscar almacén
            </label>
            <input
              id="buscar-alm"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código, nombre o sucursal…"
              className="campo w-72"
            />
            <button
              type="button"
              onClick={abrirNuevaSucursal}
              className="btn btn-contorno whitespace-nowrap"
            >
              Nueva sucursal
            </button>
            <button
              type="button"
              onClick={abrirNuevoAlmacen}
              className="btn btn-primario whitespace-nowrap"
            >
              Nuevo almacén
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Sucursal</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={4} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : visibles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-texto-ter">
                    {termino ? "Sin coincidencias." : "Aún no hay almacenes."}
                  </td>
                </tr>
              ) : (
                visibles.map((almacen) => (
                  <tr key={almacen.id}>
                    <td className="num">{almacen.codigo}</td>
                    <td className="text-tinta">{almacen.nombre}</td>
                    <td className="text-texto-sec">{almacen.sucursal}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => abrirPanelZonas(almacen)}
                          className="btn btn-contorno h-8"
                        >
                          Zonas
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

      {/* Panel: Nuevo almacén */}
      <PanelLateral
        abierto={panelAlmAbierto}
        titulo="Nuevo almacén"
        descripcion="Registra un almacén dentro de una sucursal."
        onCerrar={cerrarPanelAlmacen}
      >
        <div className="space-y-4">
          {avisoAlm && <AvisoLinea aviso={avisoAlm} />}
          <div>
            <label htmlFor="suc" className="etiqueta-campo">
              Sucursal
            </label>
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
              <label htmlFor="codAlm" className="etiqueta-campo">
                Código
              </label>
              <input
                id="codAlm"
                className="campo font-mono"
                value={codAlm}
                onChange={(e) => setCodAlm(e.target.value)}
                placeholder="03"
              />
            </div>
            <div>
              <label htmlFor="nomAlm" className="etiqueta-campo">
                Nombre
              </label>
              <input
                id="nomAlm"
                className="campo"
                value={nomAlm}
                onChange={(e) => setNomAlm(e.target.value)}
                placeholder="Almacén de obra"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={guardarAlmacen}
              disabled={guardandoAlm}
              className="btn btn-primario"
            >
              {guardandoAlm ? "Guardando…" : "Crear almacén"}
            </button>
            <button
              type="button"
              onClick={cerrarPanelAlmacen}
              className="btn btn-contorno"
            >
              Cancelar
            </button>
          </div>
        </div>
      </PanelLateral>

      {/* Panel: Nueva sucursal */}
      <PanelLateral
        abierto={panelSucAbierto}
        titulo="Nueva sucursal"
        descripcion="Registra una sucursal para agrupar almacenes."
        onCerrar={cerrarPanelSucursal}
      >
        <div className="space-y-4">
          {avisoSuc && <AvisoLinea aviso={avisoSuc} />}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
            <div>
              <label htmlFor="codSuc" className="etiqueta-campo">
                Código
              </label>
              <input
                id="codSuc"
                className="campo font-mono"
                value={codSuc}
                onChange={(e) => setCodSuc(e.target.value)}
                placeholder="LIMA"
              />
            </div>
            <div>
              <label htmlFor="nomSuc" className="etiqueta-campo">
                Nombre
              </label>
              <input
                id="nomSuc"
                className="campo"
                value={nomSuc}
                onChange={(e) => setNomSuc(e.target.value)}
                placeholder="Sucursal Lima"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={guardarSucursal}
              disabled={guardandoSuc}
              className="btn btn-primario"
            >
              {guardandoSuc ? "Guardando…" : "Crear sucursal"}
            </button>
            <button
              type="button"
              onClick={cerrarPanelSucursal}
              className="btn btn-contorno"
            >
              Cancelar
            </button>
          </div>
        </div>
      </PanelLateral>

      {/* Panel: Zonas de {almacén} */}
      <PanelLateral
        abierto={almacenZonas !== null}
        titulo={almacenZonas ? `Zonas de ${almacenZonas.nombre}` : "Zonas"}
        descripcion={
          almacenZonas
            ? `${almacenZonas.codigo} — ${almacenZonas.sucursal}`
            : undefined
        }
        onCerrar={cerrarPanelZonas}
      >
        <div className="space-y-4">
          {avisoZona && <AvisoLinea aviso={avisoZona} />}

          {edicionZona === null && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={abrirAltaZona}
                className="btn btn-primario"
              >
                Nueva zona
              </button>
            </div>
          )}

          {edicionZona !== null && (
            <div className="rounded-lg border border-borde bg-fondo-sutil p-4">
              <p className="mb-3 text-sm font-medium text-tinta">
                {edicionZona === "nueva" ? "Nueva zona" : "Editar zona"}
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label htmlFor="codZona" className="etiqueta-campo">
                    Código
                  </label>
                  <input
                    id="codZona"
                    className="campo font-mono"
                    value={codZona}
                    onChange={(e) => setCodZona(e.target.value)}
                    placeholder="A1"
                  />
                </div>
                <div>
                  <label htmlFor="nomZona" className="etiqueta-campo">
                    Nombre
                  </label>
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

          {cargandoZonas ? (
            <p className="py-6 text-center text-sm text-texto-ter">Cargando…</p>
          ) : zonas.length === 0 ? (
            <p className="py-6 text-center text-sm text-texto-ter">
              Este almacén aún no tiene zonas.
            </p>
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
                      <td className="num">{z.codigo}</td>
                      <td className="text-tinta">{z.nombre}</td>
                      <td>
                        <span
                          className={`insignia ${z.activo ? "insignia-exito" : "insignia-neutra"}`}
                        >
                          {z.activo ? "Activa" : "De baja"}
                        </span>
                      </td>
                      <td>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicionZona(z)}
                            className="btn btn-contorno h-8"
                          >
                            Editar
                          </button>
                          {z.activo && (
                            <button
                              type="button"
                              onClick={() => setZonaBaja(z)}
                              className="btn btn-peligro h-8"
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
      </PanelLateral>

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
        onCancelar={() => !procesandoBaja && setZonaBaja(null)}
      />
    </div>
  );
}
