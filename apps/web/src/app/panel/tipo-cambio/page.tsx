"use client";

import { useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  guardarTipoCambio,
  obtenerTiposCambio,
  type TipoCambioDiario,
} from "@/lib/api";

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

/** Devuelve la cantidad de dias del mes (anio, mes 1-12). */
function diasDelMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

/** Construye "YYYY-MM-DD" para un dia dado. */
function fechaIso(anio: number, mes: number, dia: number): string {
  const mm = String(mes).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${anio}-${mm}-${dd}`;
}

/** Nombre corto del dia de la semana para una fecha local. */
function diaSemana(anio: number, mes: number, dia: number): string {
  const d = new Date(anio, mes - 1, dia);
  return ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()] ?? "";
}

interface FilaDia {
  dia: number;
  fecha: string;
  diaSemana: string;
  compra: string;
  venta: string;
  /** Indica si los valores en pantalla difieren de lo guardado. */
  sucio: boolean;
  guardando: boolean;
}

type Aviso = { tono: "ok" | "error"; texto: string } | null;

const HOY = new Date();

export default function PaginaTipoCambio(): React.JSX.Element {
  const [anio, setAnio] = useState<number>(HOY.getFullYear());
  const [mes, setMes] = useState<number>(HOY.getMonth() + 1);
  const [filas, setFilas] = useState<FilaDia[]>([]);
  const [cargando, setCargando] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso>(null);

  const anios = useMemo(() => {
    const actual = HOY.getFullYear();
    return [actual + 1, actual, actual - 1, actual - 2, actual - 3];
  }, []);

  // Carga los TC del mes y construye una fila por cada dia del mes.
  useEffect(() => {
    setCargando(true);
    setError(null);
    setAviso(null);
    void (async () => {
      try {
        const registros = await obtenerTiposCambio(anio, mes);
        const porFecha = new Map<string, TipoCambioDiario>(
          registros.map((r) => [r.fecha.slice(0, 10), r]),
        );
        const total = diasDelMes(anio, mes);
        const nuevas: FilaDia[] = [];
        for (let dia = 1; dia <= total; dia += 1) {
          const fecha = fechaIso(anio, mes, dia);
          const reg = porFecha.get(fecha);
          nuevas.push({
            dia,
            fecha,
            diaSemana: diaSemana(anio, mes, dia),
            compra: reg?.compra ?? "",
            venta: reg?.venta ?? "",
            sucio: false,
            guardando: false,
          });
        }
        setFilas(nuevas);
      } catch (err) {
        setError(
          err instanceof ErrorApi
            ? err.message
            : "No se pudo cargar el tipo de cambio del mes.",
        );
        setFilas([]);
      } finally {
        setCargando(false);
      }
    })();
  }, [anio, mes]);

  function editarFila(
    dia: number,
    campo: "compra" | "venta",
    valor: string,
  ): void {
    setFilas((prev) =>
      prev.map((f) =>
        f.dia === dia ? { ...f, [campo]: valor, sucio: true } : f,
      ),
    );
  }

  // Error derivado por celda: solo aplica cuando la fila tiene cambios sin
  // guardar (sucio). Una celda vacía no se marca en rojo; una con un valor
  // no positivo sí. Esta es la misma regla que respeta guardarFila.
  function errorCelda(fila: FilaDia, campo: "compra" | "venta"): string | undefined {
    if (!fila.sucio) return undefined;
    const texto = fila[campo].trim();
    if (texto === "") return undefined;
    const numero = Number(texto);
    if (!Number.isFinite(numero) || numero <= 0) {
      return "Debe ser mayor que cero.";
    }
    return undefined;
  }

  async function guardarFila(fila: FilaDia): Promise<void> {
    setAviso(null);
    const compra = Number(fila.compra);
    const venta = Number(fila.venta);
    if (
      fila.compra.trim() === "" ||
      fila.venta.trim() === "" ||
      !Number.isFinite(compra) ||
      !Number.isFinite(venta) ||
      compra <= 0 ||
      venta <= 0
    ) {
      setAviso({
        tono: "error",
        texto: `Ingresa compra y venta mayores a cero para el ${fila.fecha}.`,
      });
      return;
    }

    setFilas((prev) =>
      prev.map((f) => (f.dia === fila.dia ? { ...f, guardando: true } : f)),
    );
    try {
      const guardado = await guardarTipoCambio({
        fecha: fila.fecha,
        compra: fila.compra.trim(),
        venta: fila.venta.trim(),
      });
      setFilas((prev) =>
        prev.map((f) =>
          f.dia === fila.dia
            ? {
                ...f,
                compra: guardado.compra,
                venta: guardado.venta,
                sucio: false,
                guardando: false,
              }
            : f,
        ),
      );
      setAviso({
        tono: "ok",
        texto: `Tipo de cambio del ${fila.fecha} guardado.`,
      });
    } catch (err) {
      setFilas((prev) =>
        prev.map((f) => (f.dia === fila.dia ? { ...f, guardando: false } : f)),
      );
      setAviso({
        tono: "error",
        texto:
          err instanceof ErrorApi
            ? err.message
            : "No se pudo guardar el tipo de cambio.",
      });
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Tipo de cambio diario"
        descripcion="Registra la cotización de compra y venta por día. Se usa para valuar el inventario en dólares."
      />

      {/* Controles de periodo */}
      <div className="flex flex-wrap items-end gap-3">
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
      </div>

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
        <p className="mt-5 text-sm text-texto-ter">Cargando tipos de cambio…</p>
      )}

      {!cargando && !error && (
        <section className="panel mt-5">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {NOMBRES_MES[mes - 1]} {anio}
            </span>
            <span className="text-xs text-texto-sec">
              {filas.length} día{filas.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Día</th>
                  <th className="num">Compra</th>
                  <th className="num">Venta</th>
                  <th className="text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila) => (
                  <tr key={fila.fecha}>
                    <td className="whitespace-nowrap font-mono text-xs text-texto-sec">
                      {fila.diaSemana} {fila.fecha}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        className="campo h-9 w-28 text-right"
                        aria-label={`Compra del ${fila.fecha}`}
                        aria-invalid={errorCelda(fila, "compra") ? "true" : undefined}
                        value={fila.compra}
                        onChange={(e) =>
                          editarFila(fila.dia, "compra", e.target.value)
                        }
                      />
                      {errorCelda(fila, "compra") && (
                        <p className="mt-1.5 text-xs text-peligro">
                          {errorCelda(fila, "compra")}
                        </p>
                      )}
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.001"
                        min="0"
                        className="campo h-9 w-28 text-right"
                        aria-label={`Venta del ${fila.fecha}`}
                        aria-invalid={errorCelda(fila, "venta") ? "true" : undefined}
                        value={fila.venta}
                        onChange={(e) =>
                          editarFila(fila.dia, "venta", e.target.value)
                        }
                      />
                      {errorCelda(fila, "venta") && (
                        <p className="mt-1.5 text-xs text-peligro">
                          {errorCelda(fila, "venta")}
                        </p>
                      )}
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn-contorno h-9 text-sm"
                        disabled={fila.guardando || !fila.sucio}
                        onClick={() => void guardarFila(fila)}
                      >
                        {fila.guardando ? "Guardando…" : "Guardar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
