"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  anularPedido,
  aprobarPedido,
  crearPedido,
  generarOrdenDesdePedido,
  obtenerAlmacenes,
  obtenerClientes,
  obtenerPedidos,
  obtenerVendedores,
  type Almacen,
  type Cliente,
  type Pedido,
  type Sku,
  type Vendedor,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  precio: string;
}

const INSIGNIA: Record<Pedido["estado"], string> = {
  BORRADOR: "insignia insignia-oro",
  APROBADO: "insignia insignia-info",
  ATENDIDO_PARCIAL: "insignia insignia-info",
  ATENDIDO: "insignia insignia-exito",
  ANULADO: "insignia insignia-peligro",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaPedidos(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  const [almacenId, setAlmacenId] = useState<string>("");
  const [numero, setNumero] = useState<string>("");
  const [clienteId, setClienteId] = useState<string>("");
  const [vendedorId, setVendedorId] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([{ sku: null, cantidad: "", precio: "" }]);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  async function refrescar(): Promise<void> {
    try {
      setPedidos(await obtenerPedidos());
    } catch {
      /* el aviso principal ya informó */
    }
  }

  useEffect(() => {
    obtenerAlmacenes()
      .then((l) => {
        setAlmacenes(l);
        const p = l[0];
        if (p) setAlmacenId(p.id);
      })
      .catch(() => undefined);
    obtenerClientes().then(setClientes).catch(() => undefined);
    obtenerVendedores().then((v) => setVendedores(v.filter((x) => x.activo))).catch(() => undefined);
    void refrescar();
  }, []);

  function actualizarLinea(i: number, cambios: Partial<LineaBorrador>): void {
    setLineas((p) => p.map((l, idx) => (idx === i ? { ...l, ...cambios } : l)));
  }

  async function manejar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAviso(null);
    if (almacenId === "" || numero.trim() === "") {
      setAviso({ texto: "Completa almacén y número.", tono: "error" });
      return;
    }
    const validas = lineas.filter((l) => l.sku && Number(l.cantidad) > 0);
    if (validas.length === 0) {
      setAviso({ texto: "Agrega al menos una línea con producto y cantidad.", tono: "error" });
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await crearPedido({
        almacenId: Number(almacenId),
        numero: numero.trim(),
        clienteId: clienteId ? Number(clienteId) : undefined,
        vendedorId: vendedorId ? Number(vendedorId) : undefined,
        lineas: validas.map((l) => ({
          skuId: l.sku!.id,
          cantidad: l.cantidad.trim(),
          precioUnitario: l.precio.trim() || undefined,
        })),
      });
      setAviso({ texto: `Pedido ${respuesta.numero} creado.`, tono: "exito" });
      setNumero("");
      setClienteId("");
      setVendedorId("");
      setLineas([{ sku: null, cantidad: "", precio: "" }]);
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo crear el pedido."), tono: "error" });
    } finally {
      setGuardando(false);
    }
  }

  async function accion(fn: () => Promise<unknown>, exito: string): Promise<void> {
    setAviso(null);
    try {
      await fn();
      setAviso({ texto: exito, tono: "exito" });
      await refrescar();
    } catch (error) {
      setAviso({ texto: mensajeError(error, "No se pudo completar la acción."), tono: "error" });
    }
  }

  function generar(p: Pedido): void {
    const numeroOrden = window.prompt(`Número de la orden de venta a generar desde el pedido ${p.numero}:`);
    if (!numeroOrden || numeroOrden.trim() === "") return;
    void accion(
      () => generarOrdenDesdePedido(p.id, numeroOrden.trim()),
      `Orden de venta generada desde el pedido ${p.numero}.`,
    );
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Pedidos"
        descripcion="Documento previo a la venta. Al aprobarlo, se puede generar la orden de venta."
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
          <span className="panel-titulo">Nuevo pedido</span>
        </div>
        <form onSubmit={manejar} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="almacen" className="etiqueta-campo">Almacén</label>
              <select id="almacen" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)} className="campo">
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="numero" className="etiqueta-campo">Número</label>
              <input id="numero" value={numero} onChange={(e) => setNumero(e.target.value)} className="campo" />
            </div>
            <div>
              <label htmlFor="cliente" className="etiqueta-campo">Cliente <span className="text-texto-ter">(opc.)</span></label>
              <select id="cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="campo">
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.razonSocial}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="vendedor" className="etiqueta-campo">Vendedor <span className="text-texto-ter">(opc.)</span></label>
              <select id="vendedor" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)} className="campo">
                <option value="">Sin vendedor</option>
                {vendedores.map((v) => (
                  <option key={v.id} value={v.id}>{v.codigo} — {v.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium text-texto">Líneas</span>
            {lineas.map((l, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
                <SelectorSku valor={l.sku} onSeleccionar={(s) => actualizarLinea(i, { sku: s })} />
                <input
                  value={l.cantidad}
                  onChange={(e) => actualizarLinea(i, { cantidad: e.target.value })}
                  placeholder="Cantidad"
                  inputMode="decimal"
                  className="campo font-mono"
                />
                <input
                  value={l.precio}
                  onChange={(e) => actualizarLinea(i, { precio: e.target.value })}
                  placeholder="Precio"
                  inputMode="decimal"
                  className="campo font-mono"
                />
                <button
                  type="button"
                  onClick={() => setLineas((p) => (p.length === 1 ? p : p.filter((_, idx) => idx !== i)))}
                  className="btn btn-texto"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setLineas((p) => [...p, { sku: null, cantidad: "", precio: "" }])}
              className="btn btn-contorno"
            >
              Agregar línea
            </button>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Creando…" : "Crear pedido"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel mt-6">
        <div className="panel-cabecera">
          <span className="panel-titulo">Pedidos</span>
        </div>
        <div className="space-y-4 p-5">
          {pedidos.length === 0 ? (
            <p className="text-sm text-texto-ter">Sin pedidos registrados.</p>
          ) : (
            pedidos.map((p) => (
              <article key={p.id} className="rounded-md border border-borde p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-tinta">{p.numero}</p>
                    <p className="text-xs text-texto-sec">
                      {new Date(p.fechaEmision).toLocaleDateString("es-PE")} · Total S/ {p.total}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={INSIGNIA[p.estado]}>{p.estado}</span>
                    {p.estado === "BORRADOR" && (
                      <button
                        type="button"
                        onClick={() => void accion(() => aprobarPedido(p.id), "Pedido aprobado.")}
                        className="btn btn-contorno btn-sm inline-flex items-center rounded-md border border-borde px-3 py-1.5 text-xs"
                      >
                        Aprobar
                      </button>
                    )}
                    {p.estado === "APROBADO" && (
                      <button
                        type="button"
                        onClick={() => generar(p)}
                        className="inline-flex items-center rounded-md border border-borde px-3 py-1.5 text-xs font-medium text-texto-sec hover:bg-panel-alt"
                      >
                        Generar orden de venta
                      </button>
                    )}
                    {(p.estado === "BORRADOR" || p.estado === "APROBADO") && (
                      <button
                        type="button"
                        onClick={() => void accion(() => anularPedido(p.id), "Pedido anulado.")}
                        className="inline-flex items-center rounded-md border border-borde px-3 py-1.5 text-xs font-medium text-peligro hover:bg-panel-alt"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th className="num">Cantidad</th>
                        <th className="num">Atendido</th>
                        <th className="num">Por atender</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.lineas.map((l) => (
                        <tr key={l.id}>
                          <td>
                            <span className="font-mono text-xs text-texto-sec">{l.codigoSku ?? `#${l.skuId}`}</span>{" "}
                            {l.nombreSku ?? ""}
                          </td>
                          <td className="num">{l.cantidad}</td>
                          <td className="num">{l.cantidadAtendida}</td>
                          <td className="num font-semibold">{l.porAtender}</td>
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
