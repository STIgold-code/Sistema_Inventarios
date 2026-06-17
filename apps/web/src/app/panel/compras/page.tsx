"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  crearOrdenCompra,
  crearProveedor,
  crearRecepcion,
  obtenerOrdenesCompra,
  obtenerProveedores,
  type EstadoOrdenCompra,
  type OrdenCompra,
  type Proveedor,
  type Sku,
} from "@/lib/api";
import { formatearSoles } from "@/lib/formato";

const ALMACEN_PRINCIPAL = 1;

type Pestania = "proveedores" | "ordenes" | "recepcion";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
  costoUnitario: string;
}

interface RecepcionBorrador {
  [ordenCompraLineaId: number]: string;
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "proveedores", etiqueta: "Proveedores" },
  { id: "ordenes", etiqueta: "Órdenes de compra" },
  { id: "recepcion", etiqueta: "Recepción" },
];

const INSIGNIA_ESTADO: Record<EstadoOrdenCompra, string> = {
  EMITIDA: "insignia insignia-neutra",
  PARCIAL: "insignia insignia-oro",
  COMPLETA: "insignia insignia-exito",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "", costoUnitario: "" };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaCompras(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("proveedores");

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Proveedores
  const [ruc, setRuc] = useState<string>("");
  const [razonSocial, setRazonSocial] = useState<string>("");
  const [direccion, setDireccion] = useState<string>("");
  const [telefono, setTelefono] = useState<string>("");
  const [emailProveedor, setEmailProveedor] = useState<string>("");
  const [guardandoProveedor, setGuardandoProveedor] = useState<boolean>(false);
  const [avisoProveedor, setAvisoProveedor] = useState<Aviso | null>(null);

  // Órdenes de compra
  const [proveedorOrden, setProveedorOrden] = useState<string>("");
  const [numeroOrden, setNumeroOrden] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [guardandoOrden, setGuardandoOrden] = useState<boolean>(false);
  const [avisoOrden, setAvisoOrden] = useState<Aviso | null>(null);

  // Recepción
  const [ordenRecepcion, setOrdenRecepcion] = useState<string>("");
  const [tipoDocumento, setTipoDocumento] = useState<string>("");
  const [serie, setSerie] = useState<string>("");
  const [numeroComprobante, setNumeroComprobante] = useState<string>("");
  const [recibidos, setRecibidos] = useState<RecepcionBorrador>({});
  const [guardandoRecepcion, setGuardandoRecepcion] = useState<boolean>(false);
  const [avisoRecepcion, setAvisoRecepcion] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [respProveedores, respOrdenes] = await Promise.all([
          obtenerProveedores(),
          obtenerOrdenesCompra(),
        ]);
        setProveedores(respProveedores);
        setOrdenes(respOrdenes);
      } catch (error) {
        setAvisoOrden({
          texto: mensajeError(error, "No se pudieron cargar los datos de compras."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescarOrdenes(): Promise<void> {
    try {
      setOrdenes(await obtenerOrdenesCompra());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  const totalBorrador = useMemo(() => {
    return lineas.reduce((acumulado, linea) => {
      const cantidad = Number(linea.cantidad);
      const costo = Number(linea.costoUnitario);
      if (Number.isNaN(cantidad) || Number.isNaN(costo)) return acumulado;
      return acumulado + cantidad * costo;
    }, 0);
  }, [lineas]);

  const ordenesRecepcionables = useMemo(
    () => ordenes.filter((o) => o.estado === "EMITIDA" || o.estado === "PARCIAL"),
    [ordenes],
  );

  const ordenSeleccionada = useMemo(
    () => ordenes.find((o) => String(o.id) === ordenRecepcion) ?? null,
    [ordenes, ordenRecepcion],
  );

  // ── Proveedores ────────────────────────────────────────────────────────────

  async function manejarProveedor(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoProveedor(null);
    if (!/^\d{11}$/.test(ruc)) {
      setAvisoProveedor({ texto: "El RUC debe tener 11 dígitos.", tono: "error" });
      return;
    }
    setGuardandoProveedor(true);
    try {
      const respuesta = await crearProveedor({
        ruc,
        razonSocial,
        direccion: direccion || undefined,
        telefono: telefono || undefined,
        email: emailProveedor || undefined,
      });
      setAvisoProveedor({
        texto: `Proveedor registrado (#${respuesta.id}).`,
        tono: "exito",
      });
      setRuc("");
      setRazonSocial("");
      setDireccion("");
      setTelefono("");
      setEmailProveedor("");
      setProveedores(await obtenerProveedores());
    } catch (error) {
      setAvisoProveedor({
        texto: mensajeError(error, "No se pudo registrar el proveedor."),
        tono: "error",
      });
    } finally {
      setGuardandoProveedor(false);
    }
  }

  // ── Órdenes de compra ────────────────────────────────────────────────────────

  function actualizarLinea(indice: number, cambios: Partial<LineaBorrador>): void {
    setLineas((previas) =>
      previas.map((linea, i) => (i === indice ? { ...linea, ...cambios } : linea)),
    );
  }

  function agregarLinea(): void {
    setLineas((previas) => [...previas, lineaVacia()]);
  }

  function quitarLinea(indice: number): void {
    setLineas((previas) =>
      previas.length === 1 ? previas : previas.filter((_, i) => i !== indice),
    );
  }

  async function manejarOrden(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoOrden(null);
    if (!proveedorOrden) {
      setAvisoOrden({ texto: "Selecciona un proveedor.", tono: "error" });
      return;
    }
    const lineasConDatos = lineas.filter((l) => l.cantidad && l.costoUnitario);
    if (lineasConDatos.length === 0) {
      setAvisoOrden({
        texto: "Agrega al menos una línea con SKU, cantidad y costo.",
        tono: "error",
      });
      return;
    }
    const lineasValidas = lineasConDatos.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null,
    );
    if (lineasValidas.length !== lineasConDatos.length) {
      setAvisoOrden({
        texto: "Selecciona un producto en cada línea.",
        tono: "error",
      });
      return;
    }
    setGuardandoOrden(true);
    try {
      const respuesta = await crearOrdenCompra({
        proveedorId: Number(proveedorOrden),
        almacenId: ALMACEN_PRINCIPAL,
        numero: numeroOrden,
        observaciones: observaciones || undefined,
        lineas: lineasValidas.map((l) => ({
          skuId: l.sku.id,
          cantidad: l.cantidad,
          costoUnitario: l.costoUnitario,
        })),
      });
      setAvisoOrden({
        texto: `Orden de compra creada (#${respuesta.id}, total: ${respuesta.total}).`,
        tono: "exito",
      });
      setProveedorOrden("");
      setNumeroOrden("");
      setObservaciones("");
      setLineas([lineaVacia()]);
      await refrescarOrdenes();
    } catch (error) {
      setAvisoOrden({
        texto: mensajeError(error, "No se pudo crear la orden de compra."),
        tono: "error",
      });
    } finally {
      setGuardandoOrden(false);
    }
  }

  // ── Recepción ──────────────────────────────────────────────────────────────

  function actualizarRecibido(ordenCompraLineaId: number, valor: string): void {
    setRecibidos((previos) => ({ ...previos, [ordenCompraLineaId]: valor }));
  }

  async function manejarRecepcion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoRecepcion(null);
    if (!ordenSeleccionada) {
      setAvisoRecepcion({ texto: "Selecciona una orden de compra.", tono: "error" });
      return;
    }
    const lineasRecepcion = ordenSeleccionada.lineas
      .map((linea) => ({
        ordenCompraLineaId: linea.id,
        cantidad: recibidos[linea.id]?.trim() ?? "",
      }))
      .filter((l) => l.cantidad !== "" && Number(l.cantidad) > 0);
    if (lineasRecepcion.length === 0) {
      setAvisoRecepcion({
        texto: "Ingresa la cantidad recibida en al menos una línea.",
        tono: "error",
      });
      return;
    }
    setGuardandoRecepcion(true);
    try {
      const respuesta = await crearRecepcion({
        ordenCompraId: ordenSeleccionada.id,
        tipoDocumentoSunat: tipoDocumento || undefined,
        serieComprobante: serie || undefined,
        numeroComprobante: numeroComprobante || undefined,
        lineas: lineasRecepcion,
      });
      setAvisoRecepcion({
        texto: `Recepción registrada (#${respuesta.recepcionId}). Stock y estado actualizados.`,
        tono: "exito",
      });
      setTipoDocumento("");
      setSerie("");
      setNumeroComprobante("");
      setRecibidos({});
      await refrescarOrdenes();
    } catch (error) {
      setAvisoRecepcion({
        texto: mensajeError(error, "No se pudo registrar la recepción."),
        tono: "error",
      });
    } finally {
      setGuardandoRecepcion(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Compras"
        descripcion="Gestiona proveedores, órdenes de compra y recepciones de mercadería."
      />

      <div
        className="flex gap-1 border-b border-borde"
        role="tablist"
        aria-label="Secciones de compras"
      >
        {PESTANIAS.map((p) => {
          const activa = pestania === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setPestania(p.id)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activa
                  ? "border-oro text-tinta"
                  : "border-transparent text-texto-sec hover:text-tinta"
              }`}
            >
              {p.etiqueta}
            </button>
          );
        })}
      </div>

      {pestania === "proveedores" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Nuevo proveedor</span>
            </div>
            <form onSubmit={manejarProveedor} className="space-y-4 p-5">
              {avisoProveedor && (
                <div
                  role={avisoProveedor.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoProveedor.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoProveedor.texto}</span>
                </div>
              )}
              <div>
                <label htmlFor="ruc" className="etiqueta-campo">
                  RUC
                </label>
                <input
                  id="ruc"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  inputMode="numeric"
                  maxLength={11}
                  required
                  className="campo font-mono"
                />
              </div>
              <div>
                <label htmlFor="razon-social" className="etiqueta-campo">
                  Razón social
                </label>
                <input
                  id="razon-social"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  required
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="direccion" className="etiqueta-campo">
                  Dirección <span className="text-texto-ter">(opcional)</span>
                </label>
                <input
                  id="direccion"
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  className="campo"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="telefono" className="etiqueta-campo">
                    Teléfono <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="telefono"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    inputMode="tel"
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="email-proveedor" className="etiqueta-campo">
                    Email <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="email-proveedor"
                    type="email"
                    value={emailProveedor}
                    onChange={(e) => setEmailProveedor(e.target.value)}
                    className="campo"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={guardandoProveedor}
                className="btn btn-primario"
              >
                {guardandoProveedor ? "Guardando…" : "Registrar proveedor"}
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Proveedores registrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>RUC</th>
                    <th>Razón social</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoBase ? (
                    <tr>
                      <td colSpan={2} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : proveedores.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="text-texto-ter">
                        Sin proveedores registrados.
                      </td>
                    </tr>
                  ) : (
                    proveedores.map((proveedor) => (
                      <tr key={proveedor.id}>
                        <td className="num">{proveedor.ruc}</td>
                        <td className="text-tinta">{proveedor.razonSocial}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {pestania === "ordenes" && (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Nueva orden de compra</span>
            </div>
            <form onSubmit={manejarOrden} className="space-y-4 p-5">
              {avisoOrden && (
                <div
                  role={avisoOrden.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoOrden.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoOrden.texto}</span>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="proveedor-orden" className="etiqueta-campo">
                    Proveedor
                  </label>
                  <select
                    id="proveedor-orden"
                    value={proveedorOrden}
                    onChange={(e) => setProveedorOrden(e.target.value)}
                    disabled={cargandoBase}
                    required
                    className="campo"
                  >
                    <option value="">{cargandoBase ? "Cargando…" : "Selecciona…"}</option>
                    {proveedores.map((proveedor) => (
                      <option key={proveedor.id} value={proveedor.id}>
                        {proveedor.ruc} — {proveedor.razonSocial}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="numero-orden" className="etiqueta-campo">
                    Número
                  </label>
                  <input
                    id="numero-orden"
                    value={numeroOrden}
                    onChange={(e) => setNumeroOrden(e.target.value)}
                    required
                    className="campo font-mono"
                  />
                </div>
              </div>

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

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-texto">Líneas</span>
                  <button type="button" onClick={agregarLinea} className="btn btn-contorno">
                    Agregar línea
                  </button>
                </div>

                {lineas.map((linea, indice) => (
                  <div
                    key={indice}
                    className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto_auto]"
                  >
                    <div>
                      <label
                        htmlFor={`linea-sku-${indice}`}
                        className="etiqueta-campo"
                      >
                        SKU
                      </label>
                      <SelectorSku
                        valor={linea.sku}
                        onSeleccionar={(sku) => actualizarLinea(indice, { sku })}
                        placeholder="Busca por código o nombre…"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`linea-cantidad-${indice}`}
                        className="etiqueta-campo"
                      >
                        Cantidad
                      </label>
                      <input
                        id={`linea-cantidad-${indice}`}
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                        inputMode="decimal"
                        className="campo w-28 font-mono"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`linea-costo-${indice}`}
                        className="etiqueta-campo"
                      >
                        Costo unitario
                      </label>
                      <input
                        id={`linea-costo-${indice}`}
                        value={linea.costoUnitario}
                        onChange={(e) =>
                          actualizarLinea(indice, { costoUnitario: e.target.value })
                        }
                        inputMode="decimal"
                        className="campo w-32 font-mono"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => quitarLinea(indice)}
                        disabled={lineas.length === 1}
                        className="btn btn-contorno"
                        aria-label={`Quitar línea ${indice + 1}`}
                      >
                        Quitar
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between border-t border-borde pt-4">
                <span className="text-sm text-texto-sec">
                  Total estimado:{" "}
                  <span className="font-mono font-semibold text-tinta">
                    {formatearSoles(totalBorrador)}
                  </span>
                </span>
                <button
                  type="submit"
                  disabled={guardandoOrden}
                  className="btn btn-primario"
                >
                  {guardandoOrden ? "Creando…" : "Crear orden"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Órdenes existentes</span>
            </div>
            <div className="space-y-4 p-5">
              {cargandoBase ? (
                <p className="text-sm text-texto-ter">Cargando…</p>
              ) : ordenes.length === 0 ? (
                <p className="text-sm text-texto-ter">Sin órdenes registradas.</p>
              ) : (
                ordenes.map((orden) => (
                  <article
                    key={orden.id}
                    className="rounded-md border border-borde p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-sm font-semibold text-tinta">
                          {orden.numero}
                        </p>
                        <p className="text-xs text-texto-sec">{orden.proveedor}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={INSIGNIA_ESTADO[orden.estado]}>{orden.estado}</span>
                        <span className="font-mono text-sm font-semibold text-tinta">
                          {formatearSoles(orden.total)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="tabla-datos">
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Pedida</th>
                            <th>Recibida</th>
                            <th>Pendiente</th>
                            <th>Costo unit.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orden.lineas.map((linea) => (
                            <tr key={linea.id}>
                              <td><span className="font-mono text-xs text-texto-sec">{linea.codigoSku}</span> <span className="text-texto">{linea.nombreSku}</span></td>
                              <td className="num">{linea.cantidad}</td>
                              <td className="num">{linea.cantidadRecibida}</td>
                              <td className="num font-semibold text-tinta">{linea.pendiente}</td>
                              <td className="num">{linea.costoUnitario}</td>
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
      )}

      {pestania === "recepcion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Registrar recepción</span>
          </div>
          <form onSubmit={manejarRecepcion} className="space-y-4 p-5">
            {avisoRecepcion && (
              <div
                role={avisoRecepcion.tono === "error" ? "alert" : "status"}
                className={`aviso ${
                  avisoRecepcion.tono === "error" ? "aviso-peligro" : "aviso-exito"
                }`}
              >
                <span>{avisoRecepcion.texto}</span>
              </div>
            )}
            <div>
              <label htmlFor="orden-recepcion" className="etiqueta-campo">
                Orden de compra
              </label>
              <select
                id="orden-recepcion"
                value={ordenRecepcion}
                onChange={(e) => {
                  setOrdenRecepcion(e.target.value);
                  setRecibidos({});
                  setAvisoRecepcion(null);
                }}
                disabled={cargandoBase}
                className="campo"
              >
                <option value="">
                  {cargandoBase ? "Cargando…" : "Selecciona una orden pendiente…"}
                </option>
                {ordenesRecepcionables.map((orden) => (
                  <option key={orden.id} value={orden.id}>
                    {orden.numero} — {orden.proveedor} ({orden.estado})
                  </option>
                ))}
              </select>
              {!cargandoBase && ordenesRecepcionables.length === 0 && (
                <p className="mt-1.5 text-xs text-texto-ter">
                  No hay órdenes pendientes de recepción.
                </p>
              )}
            </div>

            {ordenSeleccionada && (
              <>
                <div className="overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Pendiente</th>
                        <th>Recibir ahora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordenSeleccionada.lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td><span className="font-mono text-xs text-texto-sec">{linea.codigoSku}</span> <span className="text-texto">{linea.nombreSku}</span></td>
                          <td className="num font-semibold text-tinta">{linea.pendiente}</td>
                          <td>
                            <input
                              value={recibidos[linea.id] ?? ""}
                              onChange={(e) => actualizarRecibido(linea.id, e.target.value)}
                              inputMode="decimal"
                              disabled={Number(linea.pendiente) <= 0}
                              aria-label={`Cantidad a recibir de ${linea.nombreSku}`}
                              className="campo w-28 font-mono"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="tipo-documento" className="etiqueta-campo">
                      Tipo doc. <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="tipo-documento"
                      value={tipoDocumento}
                      onChange={(e) => setTipoDocumento(e.target.value)}
                      className="campo"
                    />
                  </div>
                  <div>
                    <label htmlFor="serie" className="etiqueta-campo">
                      Serie <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="serie"
                      value={serie}
                      onChange={(e) => setSerie(e.target.value)}
                      className="campo font-mono"
                    />
                  </div>
                  <div>
                    <label htmlFor="numero-comprobante" className="etiqueta-campo">
                      Número <span className="text-texto-ter">(opcional)</span>
                    </label>
                    <input
                      id="numero-comprobante"
                      value={numeroComprobante}
                      onChange={(e) => setNumeroComprobante(e.target.value)}
                      className="campo font-mono"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={guardandoRecepcion}
                  className="btn btn-primario"
                >
                  {guardandoRecepcion ? "Registrando…" : "Registrar recepción"}
                </button>
              </>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
