"use client";

import { useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  cerrarPeriodo,
  obtenerCierres,
  reabrirPeriodo,
  type CierrePeriodo,
  type EstadoCierrePeriodo,
} from "@/lib/api";
import { formatearDolares, formatearSoles } from "@/lib/formato";
import { leerUsuario } from "@/lib/sesion";

/** Permiso requerido para reabrir un periodo cerrado (solo administradores). */
const PERMISO_REABRIR = "cierre.reabrir";

const NOMBRES_MES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

const INSIGNIA_ESTADO: Record<EstadoCierrePeriodo, string> = {
  ABIERTO: "insignia insignia-info",
  CERRADO: "insignia insignia-neutra",
};

const ETIQUETA_ESTADO: Record<EstadoCierrePeriodo, string> = {
  ABIERTO: "Abierto",
  CERRADO: "Cerrado",
};

type Aviso = { tono: "ok" | "error"; texto: string } | null;

type TipoAccion = "cerrar" | "reabrir";

interface AccionPendiente {
  tipo: TipoAccion;
  periodo: string;
}

const HOY = new Date();

/** Convierte un periodo AAAAMM en una etiqueta legible: "Mayo 2026". */
function etiquetaPeriodo(periodo: string): string {
  const anio = periodo.slice(0, 4);
  const mes = Number(periodo.slice(4, 6));
  const nombre = NOMBRES_MES[mes - 1] ?? periodo;
  return `${nombre} ${anio}`;
}

export default function PaginaCierres(): React.JSX.Element {
  const [anio, setAnio] = useState<number>(HOY.getFullYear());
  const [mes, setMes] = useState<number>(HOY.getMonth() + 1);
  const [cierres, setCierres] = useState<CierrePeriodo[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [accion, setAccion] = useState<AccionPendiente | null>(null);
  const [procesando, setProcesando] = useState<boolean>(false);
  const [puedeReabrir, setPuedeReabrir] = useState<boolean>(false);

  const anios = useMemo(() => {
    const actual = HOY.getFullYear();
    return [actual + 1, actual, actual - 1, actual - 2, actual - 3];
  }, []);

  // Detecta si el usuario tiene permiso para reabrir (solo en cliente).
  useEffect(() => {
    const usuario = leerUsuario();
    setPuedeReabrir(usuario?.permisos.includes(PERMISO_REABRIR) ?? false);
  }, []);

  async function cargar(): Promise<void> {
    setCargando(true);
    setError(null);
    try {
      const datos = await obtenerCierres();
      setCierres(datos);
    } catch (err) {
      setError(
        err instanceof ErrorApi
          ? err.message
          : "No se pudieron cargar los cierres de periodo.",
      );
      setCierres([]);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  const periodoSeleccionado = `${anio}${String(mes).padStart(2, "0")}`;

  async function ejecutarAccion(): Promise<void> {
    if (!accion) return;
    setProcesando(true);
    setAviso(null);
    try {
      if (accion.tipo === "cerrar") {
        const resultado = await cerrarPeriodo(accion.periodo);
        setAviso({
          tono: "ok",
          texto: `Periodo ${etiquetaPeriodo(accion.periodo)} cerrado. Se congelaron ${resultado.skusCongelados} posiciones.`,
        });
      } else {
        await reabrirPeriodo(accion.periodo);
        setAviso({
          tono: "ok",
          texto: `Periodo ${etiquetaPeriodo(accion.periodo)} reabierto.`,
        });
      }
      setAccion(null);
      await cargar();
    } catch (err) {
      setAviso({
        tono: "error",
        texto:
          err instanceof ErrorApi
            ? err.message
            : "No se pudo completar la operación.",
      });
    } finally {
      setProcesando(false);
    }
  }

  const mensajeModal =
    accion?.tipo === "cerrar"
      ? `Vas a cerrar el periodo ${etiquetaPeriodo(accion.periodo)}. Esto congela el saldo valorizado y bloquea el registro de cualquier movimiento con fecha dentro de ese periodo. La operación se puede revertir solo con permiso de administrador.`
      : accion
        ? `Vas a reabrir el periodo ${etiquetaPeriodo(accion.periodo)}. Esto permite volver a registrar movimientos con fecha dentro de ese periodo. El saldo congelado del cierre se conserva como histórico.`
        : "";

  return (
    <div>
      <EncabezadoPagina
        titulo="Cierre mensual"
        descripcion="Cierra un periodo para congelar el inventario valorizado y bloquear movimientos con fecha dentro de ese mes."
      />

      {/* Selector de periodo a cerrar */}
      <section className="panel mt-1">
        <div className="panel-cabecera">
          <span className="panel-titulo">Cerrar un periodo</span>
        </div>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-full sm:w-44">
            <label htmlFor="mes" className="etiqueta-campo">
              Mes
            </label>
            <select
              id="mes"
              className="campo"
              value={mes}
              onChange={(e) => setMes(Number(e.target.value))}
            >
              {NOMBRES_MES.map((nombre, indice) => (
                <option key={nombre} value={indice + 1}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="w-full sm:w-32">
            <label htmlFor="anio" className="etiqueta-campo">
              Año
            </label>
            <select
              id="anio"
              className="campo"
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn btn-primario"
            disabled={procesando}
            onClick={() =>
              setAccion({ tipo: "cerrar", periodo: periodoSeleccionado })
            }
          >
            Cerrar mes
          </button>
        </div>
      </section>

      {aviso && (
        <div
          role="status"
          className={`aviso mt-5 ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
        >
          <span>{aviso.texto}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="aviso aviso-peligro mt-5">
          <span>{error}</span>
        </div>
      )}

      {cargando && (
        <p className="mt-5 text-sm text-texto-ter">Cargando cierres…</p>
      )}

      {!cargando && !error && (
        <section className="panel mt-5">
          <div className="panel-cabecera">
            <span className="panel-titulo">Periodos</span>
            <span className="text-xs text-texto-sec">
              {cierres.length} registro{cierres.length === 1 ? "" : "s"}
            </span>
          </div>
          {cierres.length === 0 ? (
            <p className="p-4 text-sm text-texto-ter">
              Aún no hay periodos cerrados. Selecciona un mes y presiona Cerrar
              mes para registrar el primero.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Estado</th>
                    <th className="num">Valorizado (S/)</th>
                    <th className="num">Valorizado (US$)</th>
                    <th>Cerrado por</th>
                    <th className="text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cierres.map((cierre) => (
                    <tr key={cierre.id}>
                      <td className="whitespace-nowrap font-medium text-tinta">
                        {etiquetaPeriodo(cierre.periodo)}
                        <span className="ml-2 font-mono text-xs text-texto-ter">
                          {cierre.periodo}
                        </span>
                      </td>
                      <td>
                        <span className={INSIGNIA_ESTADO[cierre.estado]}>
                          {ETIQUETA_ESTADO[cierre.estado]}
                        </span>
                      </td>
                      <td className="num">
                        {formatearSoles(cierre.totalValorizadoSoles)}
                      </td>
                      <td className="num">
                        {cierre.totalValorizadoUsd === null ? (
                          <span className="text-texto-ter">—</span>
                        ) : (
                          formatearDolares(cierre.totalValorizadoUsd)
                        )}
                      </td>
                      <td className="whitespace-nowrap text-sm text-texto-sec">
                        {cierre.cerradoPor?.nombre ?? "—"}
                      </td>
                      <td className="text-right">
                        {cierre.estado === "CERRADO" && puedeReabrir ? (
                          <button
                            type="button"
                            className="btn btn-contorno h-9 text-sm"
                            disabled={procesando}
                            onClick={() =>
                              setAccion({
                                tipo: "reabrir",
                                periodo: cierre.periodo,
                              })
                            }
                          >
                            Reabrir
                          </button>
                        ) : (
                          <span className="text-texto-ter">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <ModalConfirmacion
        abierto={accion !== null}
        titulo={accion?.tipo === "reabrir" ? "Reabrir periodo" : "Cerrar mes"}
        mensaje={mensajeModal}
        textoConfirmar={accion?.tipo === "reabrir" ? "Reabrir" : "Cerrar mes"}
        tono={accion?.tipo === "reabrir" ? "primario" : "peligro"}
        procesando={procesando}
        onConfirmar={() => void ejecutarAccion()}
        onCancelar={() => {
          if (!procesando) setAccion(null);
        }}
      />
    </div>
  );
}
