"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { FormularioGuia } from "@/componentes/formulario-guia";
import { SelectorSku } from "@/componentes/selector-sku";
import { SelectorBusqueda, type OpcionSelector } from "@/componentes/selector-busqueda";
import {
  ErrorApi,
  anularTraslado,
  crearTraslado,
  despacharTraslado,
  obtenerAlmacenes,
  obtenerTraslados,
  recibirTraslado,
  type Almacen,
  type EstadoTraslado,
  type Sku,
  type Traslado,
} from "@/lib/api";

type Pestania = "ordenes" | "recepcion";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaBorrador {
  sku: Sku | null;
  cantidad: string;
}

interface RecepcionBorrador {
  [trasladoLineaId: number]: string;
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "ordenes", etiqueta: "Órdenes de traslado" },
  { id: "recepcion", etiqueta: "Recepción" },
];

const INSIGNIA_ESTADO: Record<EstadoTraslado, string> = {
  PENDIENTE: "insignia insignia-neutra",
  EN_TRANSITO: "insignia insignia-oro",
  RECIBIDO: "insignia insignia-exito",
  ANULADO: "insignia insignia-peligro",
};

const ETIQUETA_ESTADO: Record<EstadoTraslado, string> = {
  PENDIENTE: "Pendiente",
  EN_TRANSITO: "En tránsito",
  RECIBIDO: "Recibido",
  ANULADO: "Anulado",
};

function lineaVacia(): LineaBorrador {
  return { sku: null, cantidad: "" };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

export default function PaginaTraslados(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("ordenes");

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [traslados, setTraslados] = useState<Traslado[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  // Crear orden de traslado
  const [numero, setNumero] = useState<string>("");
  const [origenId, setOrigenId] = useState<string>("");
  const [destinoId, setDestinoId] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");
  const [lineas, setLineas] = useState<LineaBorrador[]>([lineaVacia()]);
  const [guardandoOrden, setGuardandoOrden] = useState<boolean>(false);
  const [avisoOrden, setAvisoOrden] = useState<Aviso | null>(null);

  // Acciones sobre traslados existentes
  const [accionEnCurso, setAccionEnCurso] = useState<number | null>(null);
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);

  // Recepción
  const [trasladoRecepcion, setTrasladoRecepcion] = useState<string>("");
  const [recibidos, setRecibidos] = useState<RecepcionBorrador>({});
  const [guardandoRecepcion, setGuardandoRecepcion] = useState<boolean>(false);
  const [avisoRecepcion, setAvisoRecepcion] = useState<Aviso | null>(null);

  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [respAlmacenes, respTraslados] = await Promise.all([
          obtenerAlmacenes(),
          obtenerTraslados(),
        ]);
        setAlmacenes(respAlmacenes);
        setTraslados(respTraslados);
        const primero = respAlmacenes[0];
        if (primero) {
          setOrigenId(primero.id);
          setDestinoId((respAlmacenes[1] ?? primero).id);
        }
      } catch (error) {
        setAvisoOrden({
          texto: mensajeError(error, "No se pudieron cargar los datos de traslados."),
          tono: "error",
        });
      } finally {
        setCargandoBase(false);
      }
    })();
  }, []);

  async function refrescarTraslados(): Promise<void> {
    try {
      setTraslados(await obtenerTraslados());
    } catch {
      // El aviso de la operación principal ya informó al usuario.
    }
  }

  const trasladosEnTransito = useMemo(
    () => traslados.filter((t) => t.estado === "EN_TRANSITO"),
    [traslados],
  );

  const trasladoSeleccionado = useMemo(
    () => traslados.find((t) => String(t.id) === trasladoRecepcion) ?? null,
    [traslados, trasladoRecepcion],
  );

  const opcionesAlmacen = useMemo<OpcionSelector[]>(
    () => almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
    [almacenes],
  );

  const opcionesRecepcion = useMemo<OpcionSelector[]>(
    () =>
      trasladosEnTransito.map((t) => ({
        valor: String(t.id),
        etiqueta: `${t.numero} — ${t.origen} → ${t.destino}`,
      })),
    [trasladosEnTransito],
  );

  // ── Crear orden de traslado ──────────────────────────────────────────────────

  // Error DERIVADO de "almacenes iguales": se muestra apenas origen y destino
  // coinciden, sin esperar al submit.
  const errorDestino: string | undefined =
    origenId && destinoId && origenId === destinoId
      ? "El almacén de destino debe ser diferente del de origen."
      : undefined;

  // Error DERIVADO por línea de la orden. Solo se evalúa cuando la línea ya
  // tiene contenido (cantidad o SKU), para no marcar en rojo líneas vacías.
  function errorLineaOrden(linea: LineaBorrador): string | undefined {
    const texto = linea.cantidad.trim();
    const tieneCantidad = texto !== "";
    const tieneSku = linea.sku !== null;
    if (!tieneCantidad && !tieneSku) return undefined;
    if (!tieneSku) return "Selecciona un producto para esta línea.";
    if (!tieneCantidad) return "Ingresa la cantidad.";
    if (!/^\d+(\.\d+)?$/.test(texto) || Number(texto) <= 0) {
      return "Ingresa una cantidad mayor que cero.";
    }
    return undefined;
  }

  // Error DERIVADO por línea de recepción (cantidad recibida válida).
  function errorRecepcionLinea(lineaId: number, despachada: string): string | undefined {
    const texto = (recibidos[lineaId] ?? despachada).trim();
    if (texto === "") return "Ingresa la cantidad recibida.";
    if (!/^\d+(\.\d+)?$/.test(texto) || Number(texto) < 0) {
      return "Ingresa una cantidad recibida válida.";
    }
    return undefined;
  }

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
    if (!origenId || !destinoId) {
      setAvisoOrden({ texto: "Selecciona el almacén de origen y destino.", tono: "error" });
      return;
    }
    if (origenId === destinoId) {
      setAvisoOrden({
        texto: "El almacén de origen y el de destino deben ser diferentes.",
        tono: "error",
      });
      return;
    }
    const lineasConCantidad = lineas.filter((l) => l.cantidad.trim() !== "");
    if (lineasConCantidad.length === 0) {
      setAvisoOrden({
        texto: "Agrega al menos una línea con producto y cantidad.",
        tono: "error",
      });
      return;
    }
    const lineasValidas = lineasConCantidad.filter(
      (l): l is LineaBorrador & { sku: Sku } => l.sku !== null,
    );
    if (lineasValidas.length !== lineasConCantidad.length) {
      setAvisoOrden({ texto: "Selecciona un producto en cada línea.", tono: "error" });
      return;
    }
    setGuardandoOrden(true);
    try {
      const respuesta = await crearTraslado({
        almacenOrigenId: Number(origenId),
        almacenDestinoId: Number(destinoId),
        numero,
        observaciones: observaciones || undefined,
        lineas: lineasValidas.map((l) => ({ skuId: l.sku.id, cantidad: l.cantidad })),
      });
      setAvisoOrden({
        texto: `Orden de traslado creada (#${respuesta.id}). Estado: pendiente de despacho.`,
        tono: "exito",
      });
      setNumero("");
      setObservaciones("");
      setLineas([lineaVacia()]);
      await refrescarTraslados();
    } catch (error) {
      setAvisoOrden({
        texto: mensajeError(error, "No se pudo crear la orden de traslado."),
        tono: "error",
      });
    } finally {
      setGuardandoOrden(false);
    }
  }

  // ── Acciones sobre traslados (despachar / anular) ────────────────────────────

  async function manejarDespacho(traslado: Traslado): Promise<void> {
    setAvisoLista(null);
    setAccionEnCurso(traslado.id);
    try {
      await despacharTraslado(traslado.id);
      setAvisoLista({
        texto: `Traslado ${traslado.numero} despachado. La mercadería está en tránsito.`,
        tono: "exito",
      });
      await refrescarTraslados();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo despachar el traslado."),
        tono: "error",
      });
    } finally {
      setAccionEnCurso(null);
    }
  }

  async function manejarAnulacion(traslado: Traslado): Promise<void> {
    setAvisoLista(null);
    setAccionEnCurso(traslado.id);
    try {
      await anularTraslado(traslado.id);
      setAvisoLista({ texto: `Traslado ${traslado.numero} anulado.`, tono: "exito" });
      await refrescarTraslados();
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo anular el traslado."),
        tono: "error",
      });
    } finally {
      setAccionEnCurso(null);
    }
  }

  function irARecepcion(traslado: Traslado): void {
    setTrasladoRecepcion(String(traslado.id));
    setRecibidos({});
    setAvisoRecepcion(null);
    setPestania("recepcion");
  }

  // ── Recepción ────────────────────────────────────────────────────────────────

  function actualizarRecibido(trasladoLineaId: number, valor: string): void {
    setRecibidos((previos) => ({ ...previos, [trasladoLineaId]: valor }));
  }

  function seleccionarTrasladoRecepcion(id: string): void {
    setTrasladoRecepcion(id);
    setAvisoRecepcion(null);
    const traslado = traslados.find((t) => String(t.id) === id) ?? null;
    // Por defecto, la cantidad recibida es igual a la despachada.
    const defaults: RecepcionBorrador = {};
    if (traslado) {
      for (const linea of traslado.lineas) {
        defaults[linea.id] = linea.cantidadDespachada;
      }
    }
    setRecibidos(defaults);
  }

  async function manejarRecepcion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoRecepcion(null);
    if (!trasladoSeleccionado) {
      setAvisoRecepcion({ texto: "Selecciona un traslado en tránsito.", tono: "error" });
      return;
    }
    const lineasRecepcion = trasladoSeleccionado.lineas.map((linea) => ({
      trasladoLineaId: linea.id,
      cantidadRecibida: (recibidos[linea.id] ?? linea.cantidadDespachada).trim(),
    }));
    const incompleta = lineasRecepcion.some(
      (l) => l.cantidadRecibida === "" || Number.isNaN(Number(l.cantidadRecibida)),
    );
    if (incompleta) {
      setAvisoRecepcion({
        texto: "Ingresa una cantidad recibida válida en cada línea.",
        tono: "error",
      });
      return;
    }
    setGuardandoRecepcion(true);
    try {
      await recibirTraslado(trasladoSeleccionado.id, lineasRecepcion);
      setAvisoRecepcion({
        texto: `Recepción registrada. El traslado quedó como recibido y el stock se actualizó.`,
        tono: "exito",
      });
      setTrasladoRecepcion("");
      setRecibidos({});
      await refrescarTraslados();
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
        titulo="Traslados"
        descripcion="Mueve stock entre almacenes con control de tránsito."
      />

      <div
        role="note"
        className="aviso mt-4 border-borde bg-panel-alt text-texto-sec"
      >
        <span>
          Un traslado mueve mercadería entre almacenes en tres pasos: (1) se{" "}
          <strong>crea</strong> la orden (queda pendiente), (2) se <strong>despacha</strong> del
          almacén de origen y la mercadería pasa a estar en tránsito, y (3) se{" "}
          <strong>recibe</strong> en el almacén de destino confirmando las cantidades que llegaron
          (pueden ser menos por diferencias del viaje), quedando el traslado como recibido.
        </span>
      </div>

      <div
        className="mt-4 flex gap-1 border-b border-borde"
        role="tablist"
        aria-label="Secciones de traslados"
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

      {pestania === "ordenes" && (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Nueva orden de traslado</span>
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

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="numero" className="etiqueta-campo">
                    Número
                  </label>
                  <input
                    id="numero"
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    required
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="origen" className="etiqueta-campo">
                    Almacén de origen
                  </label>
                  <SelectorBusqueda
                    id="origen"
                    ariaLabel="Almacén de origen"
                    opciones={opcionesAlmacen}
                    valor={origenId}
                    onCambio={setOrigenId}
                    disabled={cargandoBase}
                    requerido
                    placeholder={cargandoBase ? "Cargando…" : "Selecciona…"}
                  />
                </div>
                <div>
                  <label htmlFor="destino" className="etiqueta-campo">
                    Almacén de destino
                  </label>
                  <SelectorBusqueda
                    id="destino"
                    ariaLabel="Almacén de destino"
                    opciones={opcionesAlmacen}
                    valor={destinoId}
                    onCambio={setDestinoId}
                    disabled={cargandoBase}
                    requerido
                    placeholder={cargandoBase ? "Cargando…" : "Selecciona…"}
                  />
                  {errorDestino && (
                    <p className="mt-1.5 text-xs text-peligro">{errorDestino}</p>
                  )}
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

                {lineas.map((linea, indice) => {
                  const errorLinea = errorLineaOrden(linea);
                  return (
                  <div
                    key={indice}
                    className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <div>
                      <label htmlFor={`linea-sku-${indice}`} className="etiqueta-campo">
                        SKU
                      </label>
                      <SelectorSku
                        valor={linea.sku}
                        onSeleccionar={(sku) => actualizarLinea(indice, { sku })}
                        placeholder="Busca por código o nombre…"
                      />
                    </div>
                    <div>
                      <label htmlFor={`linea-cantidad-${indice}`} className="etiqueta-campo">
                        Cantidad
                      </label>
                      <input
                        id={`linea-cantidad-${indice}`}
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(indice, { cantidad: e.target.value })}
                        inputMode="decimal"
                        aria-invalid={errorLinea ? "true" : undefined}
                        className="campo w-28 font-mono"
                      />
                    </div>
                    {errorLinea && (
                      <p className="mt-1 text-xs text-peligro sm:col-span-3">{errorLinea}</p>
                    )}
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
                  );
                })}
              </div>

              <div className="flex justify-end border-t border-borde pt-4">
                <button type="submit" disabled={guardandoOrden} className="btn btn-primario">
                  {guardandoOrden ? "Creando…" : "Crear traslado"}
                </button>
              </div>
            </form>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Traslados existentes</span>
            </div>
            <div className="space-y-4 p-5">
              {avisoLista && (
                <div
                  role={avisoLista.tono === "error" ? "alert" : "status"}
                  className={`aviso ${
                    avisoLista.tono === "error" ? "aviso-peligro" : "aviso-exito"
                  }`}
                >
                  <span>{avisoLista.texto}</span>
                </div>
              )}
              {cargandoBase ? (
                <p className="text-sm text-texto-ter">Cargando…</p>
              ) : traslados.length === 0 ? (
                <p className="text-sm text-texto-ter">Sin traslados registrados.</p>
              ) : (
                traslados.map((traslado) => {
                  const ocupado = accionEnCurso === traslado.id;
                  return (
                    <article key={traslado.id} className="rounded-md border border-borde p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-mono text-sm font-semibold text-tinta">
                            {traslado.numero}
                          </p>
                          <p className="text-xs text-texto-sec">
                            {traslado.origen} → {traslado.destino}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={INSIGNIA_ESTADO[traslado.estado]}>
                            {ETIQUETA_ESTADO[traslado.estado]}
                          </span>
                          {traslado.estado === "PENDIENTE" && (
                            <>
                              <button
                                type="button"
                                onClick={() => manejarDespacho(traslado)}
                                disabled={ocupado}
                                className="btn btn-primario"
                              >
                                {ocupado ? "Despachando…" : "Despachar"}
                              </button>
                              <button
                                type="button"
                                onClick={() => manejarAnulacion(traslado)}
                                disabled={ocupado}
                                className="btn btn-contorno"
                              >
                                Anular
                              </button>
                            </>
                          )}
                          {traslado.estado === "EN_TRANSITO" && (
                            <button
                              type="button"
                              onClick={() => irARecepcion(traslado)}
                              className="btn btn-primario"
                            >
                              Recibir
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="tabla-datos">
                          <thead>
                            <tr>
                              <th>SKU</th>
                              <th>Cantidad</th>
                              <th>Despachada</th>
                              <th>Recibida</th>
                            </tr>
                          </thead>
                          <tbody>
                            {traslado.lineas.map((linea) => (
                              <tr key={linea.id}>
                                <td>
                                  <span className="font-mono text-xs text-texto-sec">
                                    {linea.codigoSku}
                                  </span>{" "}
                                  <span className="text-texto">{linea.nombreSku}</span>
                                </td>
                                <td className="num">{linea.cantidad}</td>
                                <td className="num">{linea.cantidadDespachada}</td>
                                <td className="num">{linea.cantidadRecibida}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {(traslado.estado === "EN_TRANSITO" ||
                        traslado.estado === "RECIBIDO") && (
                        <FormularioGuia
                          vinculo={{ trasladoId: traslado.id }}
                          motivoDefecto="04"
                          puntoPartidaSugerido={traslado.origen}
                          puntoLlegadaSugerido={traslado.destino}
                        />
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </section>
        </div>
      )}

      {pestania === "recepcion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Recibir traslado</span>
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
              <label htmlFor="traslado-recepcion" className="etiqueta-campo">
                Traslado en tránsito
              </label>
              <SelectorBusqueda
                id="traslado-recepcion"
                ariaLabel="Traslado en tránsito"
                opciones={opcionesRecepcion}
                valor={trasladoRecepcion}
                onCambio={seleccionarTrasladoRecepcion}
                disabled={cargandoBase}
                placeholder={
                  cargandoBase ? "Cargando…" : "Selecciona un traslado en tránsito…"
                }
              />
              {!cargandoBase && trasladosEnTransito.length === 0 && (
                <p className="mt-1.5 text-xs text-texto-ter">
                  No hay traslados en tránsito pendientes de recepción.
                </p>
              )}
            </div>

            {trasladoSeleccionado && (
              <>
                <div
                  role="note"
                  className="aviso border-borde bg-panel-alt text-texto-sec"
                >
                  <span>
                    Si recibes menos de lo despachado, la diferencia se considera perdida en el
                    tránsito.
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="tabla-datos">
                    <thead>
                      <tr>
                        <th>SKU</th>
                        <th>Despachada</th>
                        <th>Cantidad recibida</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trasladoSeleccionado.lineas.map((linea) => (
                        <tr key={linea.id}>
                          <td>
                            <span className="font-mono text-xs text-texto-sec">
                              {linea.codigoSku}
                            </span>{" "}
                            <span className="text-texto">{linea.nombreSku}</span>
                          </td>
                          <td className="num font-semibold text-tinta">
                            {linea.cantidadDespachada}
                          </td>
                          <td>
                            <input
                              value={recibidos[linea.id] ?? linea.cantidadDespachada}
                              onChange={(e) => actualizarRecibido(linea.id, e.target.value)}
                              inputMode="decimal"
                              aria-label={`Cantidad recibida de ${linea.nombreSku}`}
                              aria-invalid={
                                errorRecepcionLinea(linea.id, linea.cantidadDespachada)
                                  ? "true"
                                  : undefined
                              }
                              className="campo w-28 font-mono"
                            />
                            {errorRecepcionLinea(linea.id, linea.cantidadDespachada) && (
                              <p className="mt-1.5 text-xs text-peligro">
                                {errorRecepcionLinea(linea.id, linea.cantidadDespachada)}
                              </p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={guardandoRecepcion}
                    className="btn btn-primario"
                  >
                    {guardandoRecepcion ? "Registrando…" : "Confirmar recepción"}
                  </button>
                </div>
              </>
            )}
          </form>
        </section>
      )}
    </div>
  );
}
