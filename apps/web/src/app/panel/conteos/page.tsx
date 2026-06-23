"use client";

import { useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  abrirConteo,
  aplicarConteo,
  obtenerConteo,
  registrarLineaConteo,
  type Conteo,
  type Sku,
} from "@/lib/api";

const ALMACEN_PRINCIPAL = 1;

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** Insignia según el signo de la diferencia: cero éxito, negativa peligro, positiva oro. */
function insigniaDiferencia(diferencia: string): string {
  const valor = Number(diferencia);
  if (Number.isNaN(valor) || valor === 0) return "insignia insignia-exito";
  return valor < 0 ? "insignia insignia-peligro" : "insignia insignia-oro";
}

function AvisoBloque({ aviso }: { aviso: Aviso }): React.JSX.Element {
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`mt-4 aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
    >
      <span>{aviso.texto}</span>
    </div>
  );
}

export default function PaginaConteos(): React.JSX.Element {
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [observaciones, setObservaciones] = useState<string>("");
  const [abriendo, setAbriendo] = useState<boolean>(false);
  const [avisoConteo, setAvisoConteo] = useState<Aviso | null>(null);

  // Línea en borrador
  const [skuLinea, setSkuLinea] = useState<Sku | null>(null);
  const [cantidadContada, setCantidadContada] = useState<string>("");
  const [guardandoLinea, setGuardandoLinea] = useState<boolean>(false);
  const [avisoLinea, setAvisoLinea] = useState<Aviso | null>(null);
  // Visibilidad del feedback inline de la línea en borrador.
  const [tocadoLinea, setTocadoLinea] = useState<Record<string, boolean>>({});
  const [intentoLinea, setIntentoLinea] = useState<boolean>(false);

  // Nombres de SKU acumulados a partir de los seleccionados, para la tabla de líneas.
  const [nombreSku, setNombreSku] = useState<Map<number, string>>(new Map());

  // Aplicación
  const [aplicando, setAplicando] = useState<boolean>(false);
  const [avisoAplicar, setAvisoAplicar] = useState<Aviso | null>(null);

  const conteoAbierto = conteo?.estado === "ABIERTO";

  // Errores DERIVADOS de la línea en borrador. Misma fuente de verdad que
  // usa manejarLinea para bloquear el registro.
  const erroresLinea = useMemo<Record<string, string>>(() => {
    const e: Record<string, string> = {};
    if (!skuLinea) e.sku = "Selecciona un SKU.";
    const texto = cantidadContada.trim();
    if (texto === "") {
      e.cantidad = "Ingresa la cantidad contada.";
    } else if (!/^\d+(\.\d+)?$/.test(texto) || Number(texto) < 0) {
      e.cantidad = "Ingresa una cantidad válida (cero o mayor).";
    }
    return e;
  }, [skuLinea, cantidadContada]);

  function errorLineaVisible(campo: string): string | undefined {
    if (!tocadoLinea[campo] && !intentoLinea) return undefined;
    return erroresLinea[campo];
  }

  function marcarTocadoLinea(campo: string): void {
    setTocadoLinea((previo) => ({ ...previo, [campo]: true }));
  }

  async function refrescarConteo(id: number): Promise<void> {
    try {
      setConteo(await obtenerConteo(id));
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  async function manejarAbrir(): Promise<void> {
    setAvisoConteo(null);
    setAbriendo(true);
    try {
      const respuesta = await abrirConteo({
        almacenId: ALMACEN_PRINCIPAL,
        observaciones: observaciones || undefined,
      });
      await refrescarConteo(respuesta.id);
      setAvisoConteo({
        texto: `Conteo abierto (#${respuesta.id}). Registra las cantidades contadas.`,
        tono: "exito",
      });
      setObservaciones("");
      setAvisoLinea(null);
      setAvisoAplicar(null);
    } catch (error) {
      setAvisoConteo({
        texto: mensajeError(error, "No se pudo abrir el conteo."),
        tono: "error",
      });
    } finally {
      setAbriendo(false);
    }
  }

  async function manejarLinea(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoLinea(null);
    if (!conteo) return;
    setIntentoLinea(true);
    if (Object.keys(erroresLinea).length > 0 || !skuLinea) {
      return;
    }
    setGuardandoLinea(true);
    try {
      const respuesta = await registrarLineaConteo({
        conteoId: conteo.id,
        skuId: skuLinea.id,
        cantidadContada,
      });
      // Conserva el nombre del SKU para mostrarlo en la tabla de líneas.
      setNombreSku((previo) => {
        const mapa = new Map(previo);
        mapa.set(skuLinea.id, `${skuLinea.codigoParlante} — ${skuLinea.nombre}`);
        return mapa;
      });
      setAvisoLinea({
        texto: `Línea registrada. Diferencia: ${respuesta.diferencia}.`,
        tono: "exito",
      });
      setSkuLinea(null);
      setCantidadContada("");
      setTocadoLinea({});
      setIntentoLinea(false);
      await refrescarConteo(conteo.id);
    } catch (error) {
      setAvisoLinea({
        texto: mensajeError(error, "No se pudo registrar la línea."),
        tono: "error",
      });
    } finally {
      setGuardandoLinea(false);
    }
  }

  async function manejarAplicar(): Promise<void> {
    setAvisoAplicar(null);
    if (!conteo) return;
    setAplicando(true);
    try {
      const respuesta = await aplicarConteo(conteo.id);
      setAvisoAplicar({
        texto: `Conteo aplicado. Se generaron ${respuesta.ajustes} ajuste(s) en el kardex.`,
        tono: "exito",
      });
      await refrescarConteo(conteo.id);
    } catch (error) {
      setAvisoAplicar({
        texto: mensajeError(error, "No se pudo aplicar el conteo."),
        tono: "error",
      });
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Conteos"
        descripcion="Cuadre físico del inventario contra el sistema."
      />

      <div className="aviso border-borde bg-panel-alt text-texto-sec" role="note">
        <div>
          <p className="font-semibold text-tinta">¿Cómo funciona el conteo físico?</p>
          <p className="mt-1">
            El conteo físico permite cuadrar el stock real contra el sistema. Al{" "}
            <span className="font-semibold">aplicarlo</span>, las diferencias generan ajustes
            automáticos en el kardex.
          </p>
        </div>
      </div>

      {!conteo ? (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Abrir conteo</span>
          </div>
          <div className="p-5">
            {avisoConteo && <AvisoBloque aviso={avisoConteo} />}
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="observaciones" className="etiqueta-campo">
                  Observaciones <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="observaciones"
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  className="campo"
                />
              </div>
              <button
                type="button"
                onClick={manejarAbrir}
                disabled={abriendo}
                className="btn btn-primario"
              >
                {abriendo ? "Abriendo…" : "Abrir conteo"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <div>
                <span className="panel-titulo">Conteo #{conteo.id}</span>
                <p className="text-xs text-texto-sec">Almacén {conteo.almacenId}</p>
              </div>
              <span
                className={
                  conteoAbierto ? "insignia insignia-oro" : "insignia insignia-exito"
                }
              >
                {conteo.estado}
              </span>
            </div>
          </section>

          {conteoAbierto && (
            <section className="panel">
              <div className="panel-cabecera">
                <span className="panel-titulo">Agregar línea</span>
              </div>
              <div className="p-5">
                {avisoLinea && <AvisoBloque aviso={avisoLinea} />}
                <form
                  onSubmit={manejarLinea}
                  className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
                >
                  <div>
                    <label className="etiqueta-campo">SKU</label>
                    <SelectorSku
                      valor={skuLinea}
                      onSeleccionar={(s) => {
                        setSkuLinea(s);
                        marcarTocadoLinea("sku");
                      }}
                    />
                    {errorLineaVisible("sku") && (
                      <p className="mt-1.5 text-xs text-peligro">{errorLineaVisible("sku")}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="linea-cantidad" className="etiqueta-campo">
                      Cantidad contada
                    </label>
                    <input
                      id="linea-cantidad"
                      value={cantidadContada}
                      onChange={(e) => setCantidadContada(e.target.value)}
                      onBlur={() => marcarTocadoLinea("cantidad")}
                      inputMode="decimal"
                      aria-invalid={errorLineaVisible("cantidad") ? "true" : undefined}
                      className="campo w-36 font-mono"
                    />
                    {errorLineaVisible("cantidad") && (
                      <p className="mt-1.5 text-xs text-peligro">
                        {errorLineaVisible("cantidad")}
                      </p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={guardandoLinea}
                    className="btn btn-oscuro"
                  >
                    {guardandoLinea ? "Registrando…" : "Registrar línea"}
                  </button>
                </form>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Líneas registradas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th className="num">Sistema</th>
                    <th className="num">Contado</th>
                    <th className="num">Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {conteo.lineas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-texto-ter">
                        Sin líneas registradas.
                      </td>
                    </tr>
                  ) : (
                    conteo.lineas.map((linea) => (
                      <tr key={linea.skuId}>
                        <td>{nombreSku.get(linea.skuId) ?? `SKU ${linea.skuId}`}</td>
                        <td className="num">{linea.cantidadSistema}</td>
                        <td className="num">{linea.cantidadContada}</td>
                        <td className="num">
                          <span className={insigniaDiferencia(linea.diferencia)}>
                            {linea.diferencia}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Aplicar conteo</span>
            </div>
            <div className="p-5">
              {avisoAplicar && <AvisoBloque aviso={avisoAplicar} />}
              {conteoAbierto ? (
                <>
                  <p className="mt-4 text-sm text-texto-sec">
                    Al aplicar el conteo, las diferencias se convierten en ajustes de inventario
                    y el conteo queda cerrado.
                  </p>
                  <button
                    type="button"
                    onClick={manejarAplicar}
                    disabled={aplicando || conteo.lineas.length === 0}
                    className="btn btn-primario mt-4"
                  >
                    {aplicando ? "Aplicando…" : "Aplicar conteo"}
                  </button>
                </>
              ) : (
                <p className="mt-4 text-sm text-texto-sec">
                  Este conteo ya fue aplicado y se encuentra cerrado.
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
