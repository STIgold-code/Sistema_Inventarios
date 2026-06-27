"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorBusqueda } from "@/componentes/selector-busqueda";
import {
  ErrorApi,
  crearDevolucionProveedor,
  obtenerDetalleRecepcion,
  obtenerDevolucionesProveedor,
  obtenerRecepciones,
  type DetalleRecepcion,
  type DevolucionProveedor,
  type Recepcion,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaDevolucionesProveedor(): React.JSX.Element {
  const [recepciones, setRecepciones] = useState<Recepcion[]>([]);
  const [devoluciones, setDevoluciones] = useState<DevolucionProveedor[]>([]);
  const [recepcionId, setRecepcionId] = useState<string>("");
  const [detalle, setDetalle] = useState<DetalleRecepcion | null>(null);
  const [motivo, setMotivo] = useState<string>("");
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function refrescarDevoluciones(): Promise<void> {
    try {
      setDevoluciones(await obtenerDevolucionesProveedor());
    } catch {
      /* el aviso principal ya informó */
    }
  }

  useEffect(() => {
    obtenerRecepciones().then(setRecepciones).catch(() => undefined);
    void refrescarDevoluciones();
  }, []);

  useEffect(() => {
    if (recepcionId === "") {
      setDetalle(null);
      setCantidades({});
      return;
    }
    obtenerDetalleRecepcion(recepcionId)
      .then((d) => {
        setDetalle(d);
        setCantidades({});
      })
      .catch((e) => setAviso({ texto: mensajeError(e, "No se pudo cargar la recepción."), tono: "error" }));
  }, [recepcionId]);

  const lineasParaEnviar = useMemo(
    () =>
      (detalle?.lineas ?? [])
        .map((l) => ({ l, cant: (cantidades[l.skuId] ?? "").trim() }))
        .filter(({ cant }) => cant !== "" && Number(cant) > 0),
    [detalle, cantidades],
  );

  async function manejar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (!detalle) {
      setAviso({ texto: "Selecciona una recepción.", tono: "error" });
      return;
    }
    if (lineasParaEnviar.length === 0) {
      setAviso({ texto: "Ingresa la cantidad a devolver en al menos una línea.", tono: "error" });
      return;
    }
    for (const { l, cant } of lineasParaEnviar) {
      if (Number(cant) > Number(l.cantidad)) {
        setAviso({
          texto: `No puedes devolver más de lo recibido en ${l.skuNombre} (${l.cantidad}).`,
          tono: "error",
        });
        return;
      }
    }
    setGuardando(true);
    try {
      const respuesta = await crearDevolucionProveedor({
        recepcionId: Number(detalle.id),
        motivo: motivo.trim() || undefined,
        lineas: lineasParaEnviar.map(({ l, cant }) => ({ skuId: Number(l.skuId), cantidad: cant })),
      });
      setAviso({ texto: `Devolución ${respuesta.numero} registrada. El stock salió del almacén.`, tono: "exito" });
      setRecepcionId("");
      setMotivo("");
      setCantidades({});
      await refrescarDevoluciones();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo registrar la devolución."), tono: "error" });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Devoluciones a proveedor"
        descripcion="Devuelve mercadería recibida a su proveedor. El stock sale del almacén valorizado."
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
          <span className="panel-titulo">Nueva devolución</span>
        </div>
        <form onSubmit={manejar} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="recepcion" className="etiqueta-campo">
                Recepción
              </label>
              <SelectorBusqueda
                id="recepcion"
                valor={recepcionId}
                onCambio={setRecepcionId}
                placeholder="Selecciona una recepción…"
                opciones={recepciones.map((r) => ({
                  valor: r.id,
                  etiqueta: `${r.ordenCompraNumero} — ${r.proveedor} (${r.comprobante})`,
                }))}
              />
            </div>
            <div>
              <label htmlFor="motivo" className="etiqueta-campo">
                Motivo <span className="text-texto-ter">(opcional)</span>
              </label>
              <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo" />
            </div>
          </div>

          {detalle && (
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th className="num">Recibido</th>
                    <th>Cantidad a devolver</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.lineas.map((l) => (
                    <tr key={l.skuId}>
                      <td>
                        <span className="font-mono text-xs text-texto-sec">{l.skuCodigo}</span>{" "}
                        {l.skuNombre}
                      </td>
                      <td className="num font-semibold">{l.cantidad}</td>
                      <td>
                        <input
                          value={cantidades[l.skuId] ?? ""}
                          onChange={(e) =>
                            setCantidades((p) => ({ ...p, [l.skuId]: e.target.value }))
                          }
                          inputMode="decimal"
                          className="campo w-28 font-mono"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={guardando || !detalle} className="btn btn-primario">
              {guardando ? "Registrando…" : "Registrar devolución"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Devoluciones registradas</span>
        </div>
        <div className="space-y-4 p-5">
          {devoluciones.length === 0 ? (
            <p className="text-sm text-texto-ter">Sin devoluciones registradas.</p>
          ) : (
            devoluciones.map((d) => (
              <article key={d.id} className="rounded-md border border-borde p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-tinta">{d.numero}</p>
                    <p className="text-xs text-texto-sec">
                      OC {d.ordenCompraNumero} · {d.proveedor} ·{" "}
                      {new Date(d.fecha).toLocaleDateString("es-PE")}
                      {d.motivo ? ` · ${d.motivo}` : ""}
                    </p>
                  </div>
                  <span className="insignia insignia-exito">{d.estado}</span>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th className="num">Cantidad</th>
                        <th className="num">Costo unit.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.lineas.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <span className="font-mono text-xs text-texto-sec">
                              {l.codigoSku ?? `#${l.skuId}`}
                            </span>{" "}
                            {l.nombreSku ?? ""}
                          </td>
                          <td className="num">{l.cantidad}</td>
                          <td className="num">{l.costoUnitario}</td>
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
