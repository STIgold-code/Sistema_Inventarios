"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { PanelLateral } from "@/componentes/panel-lateral";
import { BotonVer } from "@/componentes/boton-ver";
import { SelectorSku } from "@/componentes/selector-sku";
import { SelectorBusqueda, type OpcionSelector } from "@/componentes/selector-busqueda";
import {
  Ficha,
  ListaDatos,
  FilaDato,
  BloqueMetricas,
  Metrica,
  TablaResponsive,
  mostrar,
} from "@/componentes/ficha-detalle";
import {
  ErrorApi,
  obtenerAlmacenes,
  obtenerDetalleMovimiento,
  obtenerMovimientos,
  obtenerStock,
  registrarAjuste,
  registrarMerma,
  registrarProduccion,
  type Almacen,
  type DetalleMovimiento,
  type Movimiento,
  type Sku,
  type StockSku,
} from "@/lib/api";
import {
  formatearDolares,
  formatearFecha,
  formatearNumero,
  formatearSoles,
} from "@/lib/formato";

type Motivo = "ajuste" | "merma" | "produccion";

const MOTIVOS: ReadonlyArray<{ id: Motivo; etiqueta: string; nota: string }> = [
  { id: "ajuste", etiqueta: "Ajuste", nota: "Corrige la cantidad por error de conteo (+/−)" },
  { id: "merma", etiqueta: "Merma / desmedro", nota: "Da de baja stock roto, vencido o perdido" },
  { id: "produccion", etiqueta: "Producción", nota: "Ingresa producto terminado al stock con su costo" },
];

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

const POR_PAGINA = 20;

/** Tipos de movimiento del ledger (enum TipoMovimiento del backend). */
const TIPOS_MOVIMIENTO: ReadonlyArray<{ valor: string; etiqueta: string }> = [
  { valor: "ENTRADA_COMPRA", etiqueta: "Entrada por compra" },
  { valor: "ENTRADA_AJUSTE", etiqueta: "Entrada por ajuste" },
  { valor: "ENTRADA_TRANSFERENCIA", etiqueta: "Entrada por traslado" },
  { valor: "ENTRADA_DEVOLUCION", etiqueta: "Entrada por devolución" },
  { valor: "ENTRADA_INICIAL", etiqueta: "Saldo inicial" },
  { valor: "SALIDA_VENTA", etiqueta: "Salida por venta" },
  { valor: "SALIDA_AJUSTE", etiqueta: "Salida por ajuste" },
  { valor: "SALIDA_TRANSFERENCIA", etiqueta: "Salida por traslado" },
  { valor: "SALIDA_MERMA", etiqueta: "Merma / desmedro" },
  { valor: "SALIDA_CONSUMO", etiqueta: "Salida por consumo" },
  { valor: "DETERIORO", etiqueta: "Deterioro" },
  { valor: "RECUPERACION", etiqueta: "Recuperación" },
  { valor: "BAJA_DETERIORO", etiqueta: "Baja de deteriorado" },
];

const ETIQUETA_TIPO = new Map(TIPOS_MOVIMIENTO.map((t) => [t.valor, t.etiqueta]));

export default function PaginaMovimientos(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [motivo, setMotivo] = useState<Motivo>("ajuste");

  const [sku, setSku] = useState<Sku | null>(null);
  const [almacenId, setAlmacenId] = useState<string>("");
  const [incremento, setIncremento] = useState<boolean>(true);
  const [cantidad, setCantidad] = useState<string>("");
  const [costoUnitario, setCostoUnitario] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");

  const [procesando, setProcesando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [stock, setStock] = useState<StockSku[]>([]);

  // ── Historial de movimientos (estado independiente del formulario) ──────────
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [totalMov, setTotalMov] = useState<number>(0);
  const [paginaMov, setPaginaMov] = useState<number>(1);
  const [cargandoMov, setCargandoMov] = useState<boolean>(true);
  const [errorMov, setErrorMov] = useState<string | null>(null);
  // Filtros del historial.
  const [filtroSku, setFiltroSku] = useState<Sku | null>(null);
  const [filtroAlmacen, setFiltroAlmacen] = useState<string>("");
  const [filtroTipo, setFiltroTipo] = useState<string>("");
  const [filtroDesde, setFiltroDesde] = useState<string>("");
  const [filtroHasta, setFiltroHasta] = useState<string>("");

  // Panel de detalle (independiente).
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleMovimiento | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<boolean>(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const cargarMovimientos = useCallback(
    async (paginaPedida: number): Promise<void> => {
      setCargandoMov(true);
      setErrorMov(null);
      try {
        const respuesta = await obtenerMovimientos({
          pagina: paginaPedida,
          porPagina: POR_PAGINA,
          skuId: filtroSku ? filtroSku.id : undefined,
          almacenId: filtroAlmacen ? Number(filtroAlmacen) : undefined,
          tipo: filtroTipo || undefined,
          desde: filtroDesde || undefined,
          hasta: filtroHasta || undefined,
        });
        setMovimientos(respuesta.datos);
        setTotalMov(respuesta.total);
        setPaginaMov(paginaPedida);
      } catch (error) {
        setErrorMov(
          error instanceof ErrorApi ? error.message : "No se pudo cargar el historial.",
        );
      } finally {
        setCargandoMov(false);
      }
    },
    [filtroSku, filtroAlmacen, filtroTipo, filtroDesde, filtroHasta],
  );

  // Recarga el historial al cambiar un filtro; siempre vuelve a la página 1.
  const primeraCargaMov = useRef(true);
  useEffect(() => {
    if (primeraCargaMov.current) {
      primeraCargaMov.current = false;
    }
    void cargarMovimientos(1);
  }, [cargarMovimientos]);

  const abrirDetalle = useCallback(async (id: string): Promise<void> => {
    setDetalleId(id);
    setDetalle(null);
    setErrorDetalle(null);
    setCargandoDetalle(true);
    try {
      setDetalle(await obtenerDetalleMovimiento(id));
    } catch (error) {
      setErrorDetalle(
        error instanceof ErrorApi ? error.message : "No se pudo cargar el detalle.",
      );
    } finally {
      setCargandoDetalle(false);
    }
  }, []);

  function cerrarDetalle(): void {
    setDetalleId(null);
    setDetalle(null);
    setErrorDetalle(null);
  }

  useEffect(() => {
    void (async () => {
      try {
        const lista = await obtenerAlmacenes();
        setAlmacenes(lista);
        if (lista[0]) setAlmacenId(lista[0].id);
      } catch {
        /* sin almacenes */
      }
    })();
  }, []);

  function cambiarMotivo(m: Motivo): void {
    setMotivo(m);
    setAviso(null);
  }

  function validar(): string | null {
    if (!sku) return "Selecciona un producto.";
    if (!almacenId) return "Selecciona un almacén.";
    if (!/^\d+(\.\d+)?$/.test(cantidad) || Number(cantidad) <= 0) {
      return "Ingresa una cantidad válida.";
    }
    if (motivo === "produccion" && (!/^\d+(\.\d+)?$/.test(costoUnitario) || Number(costoUnitario) <= 0)) {
      return "Ingresa un costo unitario válido.";
    }
    return null;
  }

  async function enviar(): Promise<void> {
    const err = validar();
    if (err) {
      setAviso({ texto: err, tono: "error" });
      return;
    }
    setProcesando(true);
    setAviso(null);
    try {
      if (motivo === "ajuste") {
        await registrarAjuste({
          skuId: sku!.id,
          almacenId: Number(almacenId),
          incremento,
          cantidad,
          observaciones: observaciones || undefined,
        });
      } else if (motivo === "produccion") {
        await registrarProduccion({
          skuId: sku!.id,
          almacenId: Number(almacenId),
          cantidad,
          costoUnitario,
          observaciones: observaciones || undefined,
        });
      } else {
        await registrarMerma({
          skuId: sku!.id,
          almacenId: Number(almacenId),
          cantidad,
          observaciones: observaciones || undefined,
        });
      }
      setAviso({ texto: "Movimiento registrado correctamente.", tono: "exito" });
      setCantidad("");
      setCostoUnitario("");
      setObservaciones("");
      setStock(await obtenerStock(sku!.id));
      void cargarMovimientos(1);
    } catch (error) {
      setAviso({
        texto: error instanceof ErrorApi ? error.message : "No se pudo registrar el movimiento.",
        tono: "error",
      });
    } finally {
      setProcesando(false);
    }
  }

  const nombreAlmacen = useMemo(
    () => new Map(almacenes.map((a) => [a.id, `${a.codigo} — ${a.nombre}`])),
    [almacenes],
  );

  const opcionesAlmacen = useMemo<OpcionSelector[]>(
    () => almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
    [almacenes],
  );

  // El filtro de almacén del historial agrega una opción "Todos" (valor vacío).
  const opcionesFiltroAlmacen = useMemo<OpcionSelector[]>(
    () => [{ valor: "", etiqueta: "Todos" }, ...opcionesAlmacen],
    [opcionesAlmacen],
  );

  const totalPaginasMov = Math.max(1, Math.ceil(totalMov / POR_PAGINA));

  return (
    <div>
      <EncabezadoPagina
        titulo="Movimientos"
        descripcion="Ajustes y mermas internas. Las compras van en Compras, las ventas en Ventas y los movimientos entre almacenes en Traslados."
      />

      {/* Motivo */}
      <div className="flex flex-wrap gap-2">
        {MOTIVOS.map((m) => {
          const activo = motivo === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => cambiarMotivo(m.id)}
              className={`rounded-md border px-4 py-2.5 text-left transition-colors ${
                activo
                  ? "border-oro bg-oro-tenue"
                  : "border-borde-fuerte bg-panel hover:bg-panel-alt"
              }`}
            >
              <span className="block text-sm font-semibold text-tinta">{m.etiqueta}</span>
              <span className="block text-xs text-texto-sec">{m.nota}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              {MOTIVOS.find((m) => m.id === motivo)?.etiqueta}
            </span>
          </div>
          <div className="space-y-4 p-5">
            {aviso && (
              <div
                role={aviso.tono === "error" ? "alert" : "status"}
                className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
              >
                <span>{aviso.texto}</span>
              </div>
            )}

            <div>
              <label className="etiqueta-campo">Producto</label>
              <SelectorSku valor={sku} onSeleccionar={setSku} />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="almacen" className="etiqueta-campo">Almacén</label>
                <SelectorBusqueda
                  id="almacen"
                  ariaLabel="Almacén"
                  opciones={opcionesAlmacen}
                  valor={almacenId}
                  onCambio={setAlmacenId}
                  placeholder="Selecciona…"
                />
              </div>
              {motivo === "ajuste" && (
                <div>
                  <label htmlFor="signo" className="etiqueta-campo">Sentido</label>
                  <select
                    id="signo"
                    className="campo"
                    value={incremento ? "mas" : "menos"}
                    onChange={(e) => setIncremento(e.target.value === "mas")}
                  >
                    <option value="mas">Incrementar (+)</option>
                    <option value="menos">Disminuir (−)</option>
                  </select>
                </div>
              )}
              {motivo === "produccion" && (
                <div>
                  <label htmlFor="costo-unitario" className="etiqueta-campo">
                    Costo unitario
                  </label>
                  <input
                    id="costo-unitario"
                    value={costoUnitario}
                    onChange={(e) => setCostoUnitario(e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className="campo font-mono"
                  />
                </div>
              )}
            </div>

            <div className="sm:w-1/2">
              <label htmlFor="cantidad" className="etiqueta-campo">Cantidad</label>
              <input
                id="cantidad"
                className="campo font-mono"
                inputMode="decimal"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <label htmlFor="obs" className="etiqueta-campo">Motivo / observaciones</label>
              <input
                id="obs"
                className="campo"
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Ej. rotura en almacén, error de conteo…"
              />
            </div>

            <p className="text-xs text-texto-ter">
              El costo lo determina el sistema (costo promedio vigente). No se ingresa manualmente.
            </p>

            <button type="button" onClick={enviar} disabled={procesando} className="btn btn-primario">
              {procesando ? "Registrando…" : "Registrar movimiento"}
            </button>
          </div>
        </section>

        {/* Stock actual del producto */}
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Stock actual</span>
            {sku && <span className="font-mono text-xs text-texto-sec">{sku.codigoParlante}</span>}
          </div>
          <div className="p-2">
            {!sku ? (
              <p className="px-3 py-8 text-center text-sm text-texto-ter">
                Selecciona un producto para ver su stock.
              </p>
            ) : stock.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-texto-ter">
                Registra un movimiento para ver el stock actualizado.
              </p>
            ) : (
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Almacén</th>
                    <th className="num">Disponible</th>
                    <th className="num">Comprometido</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.almacenId}>
                      <td>{nombreAlmacen.get(String(s.almacenId)) ?? `Almacén ${s.almacenId}`}</td>
                      <td className="num font-semibold text-tinta">{s.cantidadDisponible}</td>
                      <td className="num text-texto-sec">{s.cantidadComprometida}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      {/* Historial de movimientos (ledger completo, paginado server-side) */}
      <section className="panel mt-8">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Historial de movimientos
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({formatearNumero(totalMov)})
            </span>
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 border-b border-borde p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="etiqueta-campo">Artículo</label>
            <SelectorSku valor={filtroSku} onSeleccionar={setFiltroSku} />
          </div>
          <div>
            <label htmlFor="filtroAlmacen" className="etiqueta-campo">Almacén</label>
            <SelectorBusqueda
              id="filtroAlmacen"
              ariaLabel="Filtrar por almacén"
              opciones={opcionesFiltroAlmacen}
              valor={filtroAlmacen}
              onCambio={setFiltroAlmacen}
              placeholder="Todos"
            />
          </div>
          <div>
            <label htmlFor="filtroTipo" className="etiqueta-campo">Tipo</label>
            <select
              id="filtroTipo"
              className="campo"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="">Todos</option>
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="filtroDesde" className="etiqueta-campo">Desde</label>
              <input
                id="filtroDesde"
                type="date"
                className="campo"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="filtroHasta" className="etiqueta-campo">Hasta</label>
              <input
                id="filtroHasta"
                type="date"
                className="campo"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {errorMov ? (
            <div role="alert" className="aviso aviso-peligro m-5">
              <span>{errorMov}</span>
            </div>
          ) : cargandoMov ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">Cargando…</p>
          ) : movimientos.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">
              No hay movimientos para los filtros seleccionados.
            </p>
          ) : (
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Artículo</th>
                  <th>Almacén</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo</th>
                  <th>Documento</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td className="text-texto-sec">{formatearFecha(m.fecha)}</td>
                    <td className="text-texto-sec">{ETIQUETA_TIPO.get(m.tipo) ?? m.tipo}</td>
                    <td className="text-tinta">
                      <span className="font-mono text-xs text-texto-sec">{m.skuCodigo}</span>
                      <span className="ml-2">{m.skuNombre}</span>
                    </td>
                    <td className="text-texto-sec">{m.almacen}</td>
                    <td
                      className={`num font-mono font-semibold ${
                        m.signo === "SALIDA" ? "text-peligro" : "text-exito"
                      }`}
                    >
                      {m.signo === "SALIDA" ? "−" : "+"}
                      {formatearNumero(m.cantidad)}
                    </td>
                    <td className="num font-mono text-texto">{formatearSoles(m.costoTotal)}</td>
                    <td className="text-texto-sec">{m.documento || "—"}</td>
                    <td className="num">
                      <BotonVer
                        onVer={() => void abrirDetalle(m.id)}
                        etiqueta={`Ver detalle del movimiento de ${m.skuNombre}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!errorMov && !cargandoMov && movimientos.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-5 py-3 text-sm text-texto-sec">
            <span>
              Mostrando {formatearNumero((paginaMov - 1) * POR_PAGINA + 1)}–
              {formatearNumero(Math.min(paginaMov * POR_PAGINA, totalMov))} de{" "}
              {formatearNumero(totalMov)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-contorno"
                disabled={paginaMov <= 1}
                onClick={() => void cargarMovimientos(paginaMov - 1)}
              >
                « Anterior
              </button>
              <span className="px-1 whitespace-nowrap">
                Página {formatearNumero(paginaMov)} de {formatearNumero(totalPaginasMov)}
              </span>
              <button
                type="button"
                className="btn btn-contorno"
                disabled={paginaMov >= totalPaginasMov}
                onClick={() => void cargarMovimientos(paginaMov + 1)}
              >
                Siguiente »
              </button>
            </div>
          </div>
        )}
      </section>

      <PanelLateral
        abierto={detalleId !== null}
        titulo="Detalle del movimiento"
        descripcion={detalle ? `${detalle.sku.codigo} — ${detalle.sku.nombre}` : undefined}
        onCerrar={cerrarDetalle}
        ancho="detalle"
      >
        {cargandoDetalle ? (
          <p className="px-1 py-10 text-center text-sm text-texto-ter">Cargando…</p>
        ) : errorDetalle ? (
          <div role="alert" className="aviso aviso-peligro">
            <span>{errorDetalle}</span>
          </div>
        ) : detalle ? (
          <DetalleMovimientoContenido detalle={detalle} />
        ) : null}
      </PanelLateral>
    </div>
  );
}

function DetalleMovimientoContenido({
  detalle,
}: {
  detalle: DetalleMovimiento;
}): React.JSX.Element {
  const comprobante =
    detalle.sunat.serieComprobante && detalle.sunat.numeroComprobante
      ? `${detalle.sunat.serieComprobante}-${detalle.sunat.numeroComprobante}`
      : null;
  const esSalida = detalle.signo === "SALIDA";

  return (
    <div className="space-y-5">
      {/* Datos clave del movimiento. */}
      <BloqueMetricas>
        <Metrica
          etiqueta={esSalida ? "Salida" : "Entrada"}
          valor={`${esSalida ? "−" : "+"}${formatearNumero(detalle.cantidad)}`}
          pie={ETIQUETA_TIPO.get(detalle.tipo) ?? detalle.tipo}
          acento
        />
        <Metrica etiqueta="Costo total" valor={formatearSoles(detalle.costos.total)} />
        <Metrica etiqueta="Saldo resultante" valor={formatearNumero(detalle.saldos.cantidad)} />
      </BloqueMetricas>

      <Ficha
        titulo="Cabecera"
        accion={
          esSalida ? (
            <span className="insignia insignia-neutra">Salida (−)</span>
          ) : (
            <span className="insignia insignia-exito">Entrada (+)</span>
          )
        }
      >
        <ListaDatos>
          <FilaDato etiqueta="Fecha">{formatearFecha(detalle.fecha)}</FilaDato>
          <FilaDato etiqueta="Tipo">{ETIQUETA_TIPO.get(detalle.tipo) ?? detalle.tipo}</FilaDato>
          <FilaDato etiqueta="Artículo">
            <span className="font-mono text-xs text-texto-sec">{detalle.sku.codigo}</span>
            <span className="ml-2">{detalle.sku.nombre}</span>
          </FilaDato>
          <FilaDato etiqueta="Almacén">{detalle.almacen}</FilaDato>
          <FilaDato etiqueta="Usuario">{detalle.usuario}</FilaDato>
          <FilaDato etiqueta="Documento origen">{mostrar(detalle.documento.referencia)}</FilaDato>
        </ListaDatos>
      </Ficha>

      <Ficha titulo="SUNAT">
        <ListaDatos>
          <FilaDato etiqueta="Periodo">{mostrar(detalle.sunat.periodo)}</FilaDato>
          <FilaDato etiqueta="CUO" mono>{mostrar(detalle.sunat.cuo)}</FilaDato>
          <FilaDato etiqueta="N° correlativo" mono>{mostrar(detalle.sunat.numeroCorrelativo)}</FilaDato>
          <FilaDato etiqueta="Tipo operación (Tabla 12)" mono>{mostrar(detalle.sunat.tipoOperacionSunat)}</FilaDato>
          <FilaDato etiqueta="Tipo documento (Tabla 10)" mono>{mostrar(detalle.sunat.tipoDocumentoSunat)}</FilaDato>
          <FilaDato etiqueta="Comprobante" mono>{mostrar(comprobante)}</FilaDato>
        </ListaDatos>
      </Ficha>

      <Ficha titulo="Costos">
        <ListaDatos>
          <FilaDato etiqueta="Costo unitario (S/)" mono>{formatearSoles(detalle.costos.unitario)}</FilaDato>
          <FilaDato etiqueta="Costo total (S/)" mono>{formatearSoles(detalle.costos.total)}</FilaDato>
          <FilaDato etiqueta="Costo unitario (USD)" mono>
            {detalle.costos.unitarioUsd ? formatearDolares(detalle.costos.unitarioUsd) : "—"}
          </FilaDato>
          <FilaDato etiqueta="Costo total (USD)" mono>
            {detalle.costos.totalUsd ? formatearDolares(detalle.costos.totalUsd) : "—"}
          </FilaDato>
        </ListaDatos>
      </Ficha>

      <Ficha titulo="Saldos resultantes">
        <ListaDatos>
          <FilaDato etiqueta="Cantidad" mono>{formatearNumero(detalle.saldos.cantidad)}</FilaDato>
          <FilaDato etiqueta="Costo unitario" mono>{formatearSoles(detalle.saldos.costoUnitario)}</FilaDato>
          <FilaDato etiqueta="Costo total" mono>{formatearSoles(detalle.saldos.costoTotal)}</FilaDato>
        </ListaDatos>
      </Ficha>

      {detalle.capas.length > 0 && (
        <Ficha titulo="Capas FIFO consumidas">
          <TablaResponsive>
            <table className="tabla-datos compacta">
              <thead>
                <tr>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo unitario</th>
                </tr>
              </thead>
              <tbody>
                {detalle.capas.map((c, i) => (
                  <tr key={i}>
                    <td className="num font-mono text-texto">{formatearNumero(c.cantidad)}</td>
                    <td className="num font-mono text-texto">{formatearSoles(c.costoUnitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaResponsive>
        </Ficha>
      )}

      {detalle.series.length > 0 && (
        <Ficha titulo="Números de serie">
          <ul className="flex flex-wrap gap-2">
            {detalle.series.map((s) => (
              <li key={s} className="insignia insignia-neutra font-mono">{s}</li>
            ))}
          </ul>
        </Ficha>
      )}
    </div>
  );
}
