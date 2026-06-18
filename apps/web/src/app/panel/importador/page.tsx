"use client";

import { useState, type ChangeEvent } from "react";
import { read, utils } from "xlsx";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  importarProductos,
  type FilaImportador,
  type ImportarProductosRespuesta,
} from "@/lib/api";
import { formatearNumero } from "@/lib/formato";

const ALMACEN_PRINCIPAL = 1;
const MAX_ERRORES_VISIBLES = 20;

/**
 * Tamaño de cada lote enviado al backend. Importar miles de filas en un solo
 * request rebasa el límite de tamaño del cuerpo (request entity too large) y
 * arriesga timeouts, por lo que la carga se divide en lotes secuenciales.
 */
const TAMANO_LOTE = 400;

/** Divide un arreglo en lotes de tamaño fijo. */
function dividirEnLotes<T>(items: readonly T[], tamano: number): T[][] {
  const lotes: T[][] = [];
  for (let inicio = 0; inicio < items.length; inicio += tamano) {
    lotes.push(items.slice(inicio, inicio + tamano));
  }
  return lotes;
}

interface Progreso {
  lote: number;
  total: number;
}

/** Código parlante válido: exactamente 14 dígitos. */
const PATRON_CODIGO = /^\d{14}$/;

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** Normaliza una celda de SheetJS a string sin espacios extra. */
function celda(fila: unknown[], indice: number): string {
  const valor = fila[indice];
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

/**
 * Convierte las filas crudas de la hoja en filas del importador. Solo se
 * conservan las filas cuyo primer campo (columna 0) sea un código de 14 dígitos.
 * El stock se toma de la columna 6 y, si está vacía, de la columna 4.
 */
function construirFilas(matriz: unknown[][]): FilaImportador[] {
  const filas: FilaImportador[] = [];
  for (const fila of matriz) {
    const codigoParlante = celda(fila, 0);
    if (!PATRON_CODIGO.test(codigoParlante)) continue;
    const stockFisico = celda(fila, 6) || celda(fila, 4);
    filas.push({
      codigoParlante,
      descripcion: celda(fila, 1),
      unidadCodigo: celda(fila, 3),
      stockFisico,
    });
  }
  return filas;
}

export default function PaginaImportador(): React.JSX.Element {
  const [nombreArchivo, setNombreArchivo] = useState<string>("");
  const [filas, setFilas] = useState<FilaImportador[]>([]);
  const [leyendo, setLeyendo] = useState<boolean>(false);
  const [avisoArchivo, setAvisoArchivo] = useState<Aviso | null>(null);

  const [procesando, setProcesando] = useState<boolean>(false);
  const [resultado, setResultado] = useState<ImportarProductosRespuesta | null>(
    null,
  );
  const [avisoProceso, setAvisoProceso] = useState<Aviso | null>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [confirmacionAbierta, setConfirmacionAbierta] = useState<boolean>(false);

  async function manejarArchivo(
    evento: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;

    setAvisoArchivo(null);
    setAvisoProceso(null);
    setResultado(null);
    setFilas([]);
    setNombreArchivo(archivo.name);
    setLeyendo(true);
    try {
      const buffer = await archivo.arrayBuffer();
      const libro = read(buffer, { type: "array" });
      const primeraHoja = libro.SheetNames[0];
      const hoja =
        libro.Sheets["Hoja1"] ?? (primeraHoja ? libro.Sheets[primeraHoja] : undefined);
      if (!hoja) {
        setAvisoArchivo({
          texto: "El archivo no contiene hojas legibles.",
          tono: "error",
        });
        return;
      }
      const matriz = utils.sheet_to_json<unknown[]>(hoja, {
        header: 1,
        blankrows: false,
        defval: "",
      });
      const filasValidas = construirFilas(matriz);
      setFilas(filasValidas);
      setAvisoArchivo({
        texto:
          filasValidas.length > 0
            ? `Se detectaron ${filasValidas.length} fila(s) válida(s) con código de 14 dígitos.`
            : "No se detectaron filas con un código de 14 dígitos en la primera columna.",
        tono: filasValidas.length > 0 ? "exito" : "error",
      });
    } catch (error) {
      setAvisoArchivo({
        texto: mensajeError(error, "No se pudo leer el archivo Excel."),
        tono: "error",
      });
    } finally {
      setLeyendo(false);
    }
  }

  function solicitarImportacion(): void {
    setAvisoProceso(null);
    if (filas.length === 0) {
      setAvisoProceso({
        texto: "Carga un archivo con filas válidas antes de importar.",
        tono: "error",
      });
      return;
    }
    setConfirmacionAbierta(true);
  }

  async function confirmarImportacion(): Promise<void> {
    setConfirmacionAbierta(false);
    await ejecutarLotes(false);
  }

  /**
   * Procesa las filas en lotes secuenciales y acumula el resultado. Si un lote
   * falla, conserva lo procesado hasta ese punto y reporta el error.
   */
  async function ejecutarLotes(dryRun: boolean): Promise<void> {
    setAvisoProceso(null);
    setResultado(null);
    if (filas.length === 0) {
      setAvisoProceso({
        texto: "Carga un archivo con filas válidas antes de importar.",
        tono: "error",
      });
      return;
    }

    const lotes = dividirEnLotes(filas, TAMANO_LOTE);
    const acumulado: ImportarProductosRespuesta = {
      dryRun,
      creados: 0,
      actualizados: 0,
      conStock: 0,
      errores: [],
    };

    setProcesando(true);
    try {
      for (const [indice, lote] of lotes.entries()) {
        setProgreso({ lote: indice + 1, total: lotes.length });
        const respuesta = await importarProductos({
          almacenId: ALMACEN_PRINCIPAL,
          dryRun,
          filas: lote,
        });
        acumulado.creados += respuesta.creados;
        acumulado.actualizados += respuesta.actualizados;
        acumulado.conStock += respuesta.conStock;
        acumulado.errores.push(...respuesta.errores);
      }
      setResultado(acumulado);
      setAvisoProceso({
        texto: dryRun
          ? "Previsualización completada. No se escribió ningún cambio."
          : "Importación completada.",
        tono: "exito",
      });
    } catch (error) {
      setResultado(acumulado);
      setAvisoProceso({
        texto: mensajeError(error, "No se pudo procesar la importación."),
        tono: "error",
      });
    } finally {
      setProcesando(false);
      setProgreso(null);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Importador"
        descripcion="Carga masiva de productos desde un archivo Excel."
      />

      <div className="aviso border-borde bg-panel-alt text-texto-sec" role="note">
        <div>
          <p className="font-semibold text-tinta">¿Cómo funciona la importación?</p>
          <p className="mt-1">
            El proceso valida cada fila y es idempotente: reimportar el mismo archivo no genera
            duplicados, solo actualiza lo que corresponde. Usa primero la{" "}
            <span className="font-semibold">previsualización</span> para revisar el resultado sin
            escribir nada.
          </p>
        </div>
      </div>

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Archivo Excel</span>
        </div>
        <div className="p-5">
          {avisoArchivo && (
            <div
              role={avisoArchivo.tono === "error" ? "alert" : "status"}
              className={`mt-4 aviso ${avisoArchivo.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
            >
              <span>{avisoArchivo.texto}</span>
            </div>
          )}
          <div className="mt-4 space-y-2">
            <label htmlFor="archivo" className="etiqueta-campo">
              Selecciona un archivo .xlsx
            </label>
            <input
              id="archivo"
              type="file"
              accept=".xlsx"
              onChange={manejarArchivo}
              disabled={leyendo || procesando}
              className="campo flex items-center py-0 file:mr-4 file:h-full file:border-0 file:bg-panel-alt file:px-4 file:text-sm file:font-medium file:text-tinta"
            />
            {leyendo && (
              <p className="text-sm text-texto-sec" role="status">
                Leyendo archivo…
              </p>
            )}
            {nombreArchivo && !leyendo && (
              <p className="text-xs text-texto-ter">
                Archivo: {nombreArchivo} · {filas.length} fila(s) válida(s)
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Importación</span>
        </div>
        <div className="p-5">
          {avisoProceso && (
            <div
              role={avisoProceso.tono === "error" ? "alert" : "status"}
              className={`mt-4 aviso ${avisoProceso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
            >
              <span>{avisoProceso.texto}</span>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void ejecutarLotes(true)}
              disabled={procesando || leyendo || filas.length === 0}
              className="btn btn-contorno"
            >
              {procesando ? "Procesando…" : "Previsualizar (dry-run)"}
            </button>
            <button
              type="button"
              onClick={solicitarImportacion}
              disabled={procesando || leyendo || filas.length === 0}
              className="btn btn-primario"
            >
              {procesando ? "Procesando…" : "Importar de verdad"}
            </button>
          </div>
          {procesando && (
            <p className="mt-3 text-sm text-texto-sec" role="status">
              {progreso
                ? `Procesando lote ${progreso.lote} de ${progreso.total}… (${formatearNumero(filas.length)} fila(s) en total)`
                : `Procesando ${formatearNumero(filas.length)} fila(s)…`}
            </p>
          )}
        </div>
      </section>

      {resultado && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Resultado</span>
            <span
              className={
                resultado.dryRun ? "insignia insignia-oro" : "insignia insignia-exito"
              }
            >
              {resultado.dryRun ? "Previsualización" : "Aplicado"}
            </span>
          </div>
          <div className="p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="panel p-4">
                <p className="text-xs font-medium uppercase text-texto-sec">Creados</p>
                <p className="mt-1 font-mono text-xl font-semibold text-tinta">
                  {formatearNumero(resultado.creados)}
                </p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-medium uppercase text-texto-sec">Actualizados</p>
                <p className="mt-1 font-mono text-xl font-semibold text-tinta">
                  {formatearNumero(resultado.actualizados)}
                </p>
              </div>
              <div className="panel p-4">
                <p className="text-xs font-medium uppercase text-texto-sec">Con stock</p>
                <p className="mt-1 font-mono text-xl font-semibold text-tinta">
                  {formatearNumero(resultado.conStock)}
                </p>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="text-sm font-semibold text-tinta">
                Errores ({resultado.errores.length})
              </h3>
              {resultado.errores.length === 0 ? (
                <p className="mt-2 text-sm text-exito">
                  Sin errores. Todas las filas son válidas.
                </p>
              ) : (
                <>
                  <div className="mt-3 overflow-x-auto">
                    <table className="tabla-datos">
                      <thead>
                        <tr>
                          <th>Código</th>
                          <th>Motivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.errores
                          .slice(0, MAX_ERRORES_VISIBLES)
                          .map((err, indice) => (
                            <tr key={`${err.codigo}-${indice}`}>
                              <td className="font-mono">{err.codigo}</td>
                              <td className="text-peligro">{err.motivo}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {resultado.errores.length > MAX_ERRORES_VISIBLES && (
                    <p className="mt-2 text-xs text-texto-ter">
                      Mostrando los primeros {MAX_ERRORES_VISIBLES} de{" "}
                      {resultado.errores.length} errores.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <ModalConfirmacion
        abierto={confirmacionAbierta}
        titulo="Confirmar importación"
        mensaje={`Se importarán ${formatearNumero(filas.length)} fila(s) al almacén principal. Esta acción escribe en el inventario. ¿Deseas continuar?`}
        textoConfirmar="Importar"
        textoCancelar="Cancelar"
        onConfirmar={() => void confirmarImportacion()}
        onCancelar={() => setConfirmacionAbierta(false)}
      />
    </div>
  );
}
