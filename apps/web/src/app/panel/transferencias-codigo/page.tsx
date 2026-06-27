"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  crearTransferenciaCodigo,
  obtenerAlmacenes,
  obtenerTransferenciasCodigo,
  type Almacen,
  type Sku,
  type TransferenciaCodigo,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaTransferenciasCodigo(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [almacenId, setAlmacenId] = useState<string>("");
  const [numero, setNumero] = useState<string>("");
  const [skuOrigen, setSkuOrigen] = useState<Sku | null>(null);
  const [skuDestino, setSkuDestino] = useState<Sku | null>(null);
  const [cantidadOrigen, setCantidadOrigen] = useState<string>("");
  const [factor, setFactor] = useState<string>("1");
  const [observaciones, setObservaciones] = useState<string>("");
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [transferencias, setTransferencias] = useState<TransferenciaCodigo[]>([]);

  async function refrescar(): Promise<void> {
    try {
      setTransferencias(await obtenerTransferenciasCodigo());
    } catch {
      /* el aviso principal ya informó */
    }
  }

  useEffect(() => {
    obtenerAlmacenes()
      .then((l) => {
        setAlmacenes(l);
        const primero = l[0];
        if (primero) setAlmacenId(primero.id);
      })
      .catch(() => undefined);
    void refrescar();
  }, []);

  async function manejar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (almacenId === "" || numero.trim() === "" || !skuOrigen || !skuDestino) {
      setAviso({ texto: "Completa almacén, número y los SKU de origen y destino.", tono: "error" });
      return;
    }
    if (skuOrigen.id === skuDestino.id) {
      setAviso({ texto: "El SKU origen y destino deben ser distintos.", tono: "error" });
      return;
    }
    if (!(Number(cantidadOrigen) > 0) || !(Number(factor) > 0)) {
      setAviso({ texto: "La cantidad y el factor deben ser mayores a 0.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await crearTransferenciaCodigo({
        almacenId: Number(almacenId),
        numero: numero.trim(),
        observaciones: observaciones.trim() || undefined,
        lineas: [
          {
            skuOrigenId: skuOrigen.id,
            skuDestinoId: skuDestino.id,
            cantidadOrigen: cantidadOrigen.trim(),
            factorConversion: factor.trim(),
          },
        ],
      });
      setAviso({ texto: `Transferencia ${respuesta.numero} confirmada.`, tono: "exito" });
      setNumero("");
      setSkuOrigen(null);
      setSkuDestino(null);
      setCantidadOrigen("");
      setFactor("1");
      setObservaciones("");
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo registrar la transferencia."), tono: "error" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Transferencia de código"
        descripcion="Transforma un artículo en otro (kits, re-empaque) conservando el valor del stock."
      />

      {aviso && (
        <div
          role={aviso.tono === "error" ? "alert" : "status"}
          className={`aviso mt-4 ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
        >
          <span>{aviso.texto}</span>
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Nueva transformación</span>
        </div>
        <form onSubmit={manejar} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="almacen" className="etiqueta-campo">
                Almacén
              </label>
              <select
                id="almacen"
                value={almacenId}
                onChange={(e) => setAlmacenId(e.target.value)}
                className="campo"
              >
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="numero" className="etiqueta-campo">
                Número
              </label>
              <input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} className="campo" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="etiqueta-campo">SKU origen (se consume)</label>
              <SelectorSku valor={skuOrigen} onSeleccionar={setSkuOrigen} />
            </div>
            <div>
              <label className="etiqueta-campo">SKU destino (se genera)</label>
              <SelectorSku valor={skuDestino} onSeleccionar={setSkuDestino} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="cant" className="etiqueta-campo">
                Cantidad de origen
              </label>
              <input
                id="cant"
                value={cantidadOrigen}
                onChange={(e) => setCantidadOrigen(e.target.value)}
                inputMode="decimal"
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor="factor" className="etiqueta-campo">
                Factor (destino por origen)
              </label>
              <input
                id="factor"
                value={factor}
                onChange={(e) => setFactor(e.target.value)}
                inputMode="decimal"
                className="campo font-mono"
              />
            </div>
            <div>
              <label className="etiqueta-campo">Cantidad destino</label>
              <input
                value={
                  Number(cantidadOrigen) > 0 && Number(factor) > 0
                    ? String(Number(cantidadOrigen) * Number(factor))
                    : ""
                }
                readOnly
                className="campo font-mono bg-panel-alt"
              />
            </div>
          </div>

          <div>
            <label htmlFor="obs" className="etiqueta-campo">
              Observaciones <span className="text-texto-ter">(opcional)</span>
            </label>
            <input id="obs" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} className="campo" />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Confirmando…" : "Confirmar transformación"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Transformaciones registradas</span>
        </div>
        <div className="space-y-4 p-5">
          {transferencias.length === 0 ? (
            <p className="text-sm text-texto-ter">Sin transformaciones registradas.</p>
          ) : (
            transferencias.map((t) => (
              <article key={t.id} className="rounded-md border border-borde p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-tinta">{t.numero}</p>
                  <span className="insignia insignia-exito">{t.estado}</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>Origen</th>
                        <th>Destino</th>
                        <th className="num">Cant. origen</th>
                        <th className="num">Factor</th>
                        <th className="num">Cant. destino</th>
                        <th className="num">Costo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.lineas.map((l) => (
                        <tr key={l.id}>
                          <td>{l.origen}</td>
                          <td>{l.destino}</td>
                          <td className="num">{l.cantidadOrigen}</td>
                          <td className="num">{l.factorConversion}</td>
                          <td className="num">{l.cantidadDestino}</td>
                          <td className="num">{l.costoTotal}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
