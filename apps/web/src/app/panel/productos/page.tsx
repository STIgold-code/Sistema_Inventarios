"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { PanelLateral } from "@/componentes/panel-lateral";
import { BotonVer } from "@/componentes/boton-ver";
import {
  SelectorBusqueda,
  type OpcionSelector,
} from "@/componentes/selector-busqueda";
import {
  ErrorApi,
  crearProducto,
  obtenerDetalleSku,
  obtenerFamilias,
  obtenerSkus,
  obtenerUnidades,
  type DetalleSku,
  type Familia,
  type Sku,
  type Unidad,
} from "@/lib/api";
import {
  formatearDolares,
  formatearFecha,
  formatearNumero,
  formatearSoles,
} from "@/lib/formato";

const POR_PAGINA = 20;

interface EstadoFormulario {
  familiaId: string;
  nombre: string;
  codigoParlante: string;
  unidadId: string;
  nombreSku: string;
  stockMinimo: string;
  stockMaximo: string;
  puntoReposicion: string;
  semanasReposicion: string;
  unidadReferenciaId: string;
  factorConversion: string;
  precioPublico: string;
  precioDistribuidor: string;
  monedaVenta: string;
  // "" = sin clasificar, "true" = renovable, "false" = no renovable.
  esRenovable: string;
}

const FORMULARIO_INICIAL: EstadoFormulario = {
  familiaId: "",
  nombre: "",
  codigoParlante: "",
  unidadId: "",
  nombreSku: "",
  stockMinimo: "",
  stockMaximo: "",
  puntoReposicion: "",
  semanasReposicion: "",
  unidadReferenciaId: "",
  factorConversion: "",
  precioPublico: "",
  precioDistribuidor: "",
  monedaVenta: "PEN",
  esRenovable: "",
};

export default function PaginaProductos(): React.JSX.Element {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [pagina, setPagina] = useState<number>(1);
  const [busqueda, setBusqueda] = useState<string>("");
  // "" = todos, "true" = solo renovables, "false" = solo no renovables.
  const [filtroRenovable, setFiltroRenovable] = useState<string>("");
  const [cargandoLista, setCargandoLista] = useState<boolean>(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [familias, setFamilias] = useState<Familia[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);

  const [panelAbierto, setPanelAbierto] = useState<boolean>(false);
  const [form, setForm] = useState<EstadoFormulario>(FORMULARIO_INICIAL);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  // Campos que el usuario ya tocó (onBlur) o tras un intento de envío.
  const [tocado, setTocado] = useState<Record<string, boolean>>({});
  const [intentoEnvio, setIntentoEnvio] = useState<boolean>(false);

  // Panel de detalle (independiente del formulario de alta).
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [detalle, setDetalle] = useState<DetalleSku | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<boolean>(false);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);

  const abrirDetalle = useCallback(async (id: number): Promise<void> => {
    setDetalleId(id);
    setDetalle(null);
    setErrorDetalle(null);
    setCargandoDetalle(true);
    try {
      const datos = await obtenerDetalleSku(id);
      setDetalle(datos);
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

  const cargarSkus = useCallback(
    async (termino: string, renovable: string, paginaPedida: number): Promise<void> => {
      setCargandoLista(true);
      setErrorLista(null);
      try {
        const respuesta = await obtenerSkus(
          paginaPedida,
          POR_PAGINA,
          termino,
          renovable === "" ? undefined : renovable === "true",
        );
        setSkus(respuesta.datos);
        setTotal(respuesta.total);
        setPagina(paginaPedida);
      } catch (error) {
        setErrorLista(
          error instanceof ErrorApi ? error.message : "No se pudo cargar el catálogo.",
        );
      } finally {
        setCargandoLista(false);
      }
    },
    [],
  );

  // Catálogos de apoyo (familias/unidades) para el formulario de alta.
  useEffect(() => {
    void (async (): Promise<void> => {
      try {
        const [fam, uni] = await Promise.all([obtenerFamilias(), obtenerUnidades()]);
        setFamilias(fam);
        setUnidades(uni);
      } catch {
        setErrorForm("No se pudieron cargar familias o unidades.");
      }
    })();
  }, []);

  // Búsqueda en vivo: la primera carga es inmediata; los cambios posteriores en
  // el término o el filtro se aplican con un retardo (debounce) para no disparar
  // una consulta por cada tecla. Siempre vuelve a la página 1.
  const primeraCarga = useRef(true);
  useEffect(() => {
    if (primeraCarga.current) {
      primeraCarga.current = false;
      void cargarSkus("", "", 1);
      return;
    }
    const id = window.setTimeout(() => {
      void cargarSkus(busqueda.trim(), filtroRenovable, 1);
    }, 300);
    return () => window.clearTimeout(id);
  }, [busqueda, filtroRenovable, cargarSkus]);

  const opcionesFamilia = useMemo<OpcionSelector[]>(
    () => familias.map((f) => ({ valor: String(f.id), etiqueta: `${f.codigo} — ${f.nombre}` })),
    [familias],
  );

  const opcionesUnidad = useMemo<OpcionSelector[]>(
    () => unidades.map((u) => ({ valor: String(u.id), etiqueta: `${u.codigo} — ${u.nombre}` })),
    [unidades],
  );

  const opcionesUnidadReferencia = useMemo<OpcionSelector[]>(
    () =>
      unidades
        .filter((u) => String(u.id) !== form.unidadId)
        .map((u) => ({ valor: String(u.id), etiqueta: `${u.codigo} — ${u.nombre}` })),
    [unidades, form.unidadId],
  );

  // Familia seleccionada (para prefijo y validación del código parlante).
  const familiaSeleccionada = useMemo<Familia | undefined>(
    () => familias.find((f) => String(f.id) === form.familiaId),
    [familias, form.familiaId],
  );

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  // Errores DERIVADOS del valor actual del form. Una sola fuente de verdad:
  // se usa tanto para mostrar inline como para bloquear el submit.
  const errores = useMemo<Partial<Record<keyof EstadoFormulario, string>>>(() => {
    const e: Partial<Record<keyof EstadoFormulario, string>> = {};

    if (!form.familiaId) {
      e.familiaId = "Selecciona una familia.";
    }

    if (form.codigoParlante.length !== 14) {
      e.codigoParlante = "El código parlante debe tener 14 dígitos.";
    } else if (familiaSeleccionada && !form.codigoParlante.startsWith(familiaSeleccionada.codigo)) {
      e.codigoParlante = `Los 3 primeros dígitos deben coincidir con la familia (${familiaSeleccionada.codigo}).`;
    }

    if (!form.unidadId) {
      e.unidadId = "Selecciona una unidad.";
    }

    // Multi-unidad: unidad de referencia y factor van juntos o ninguno.
    const tieneRef = Boolean(form.unidadReferenciaId);
    const tieneFactor = Boolean(form.factorConversion.trim());
    if (tieneRef !== tieneFactor) {
      const mensaje =
        "La unidad de referencia y el factor deben indicarse juntos o dejarse ambos vacíos.";
      if (!tieneRef) e.unidadReferenciaId = mensaje;
      if (!tieneFactor) e.factorConversion = mensaje;
    } else if (tieneRef) {
      if (form.unidadReferenciaId === form.unidadId) {
        e.unidadReferenciaId = "Debe ser distinta de la unidad principal.";
      }
      if (!(Number(form.factorConversion) > 0)) {
        e.factorConversion = "El factor debe ser mayor que cero.";
      }
    }

    return e;
  }, [form, familiaSeleccionada]);

  // Un error se muestra inline solo si el campo fue tocado o hubo intento de envío.
  function errorVisible(campo: keyof EstadoFormulario): string | undefined {
    if (!tocado[campo] && !intentoEnvio) return undefined;
    return errores[campo];
  }

  function marcarTocado(campo: keyof EstadoFormulario): void {
    setTocado((previo) => ({ ...previo, [campo]: true }));
  }

  function actualizar(campo: keyof EstadoFormulario, valor: string): void {
    setForm((previo) => {
      const siguiente = { ...previo, [campo]: valor };

      // Al elegir una familia, prefilla/ajusta el prefijo (3 dígitos) del
      // código parlante conservando los dígitos restantes ya escritos.
      if (campo === "familiaId") {
        const familia = familias.find((f) => String(f.id) === valor);
        if (familia) {
          const resto = previo.codigoParlante.slice(3);
          siguiente.codigoParlante = (familia.codigo + resto).slice(0, 14);
        }
      }

      return siguiente;
    });
  }

  function abrirNuevo(): void {
    setForm(FORMULARIO_INICIAL);
    setTocado({});
    setIntentoEnvio(false);
    setErrorForm(null);
    setExito(null);
    setPanelAbierto(true);
  }

  function cerrarPanel(): void {
    if (enviando) return;
    setPanelAbierto(false);
    setForm(FORMULARIO_INICIAL);
    setTocado({});
    setIntentoEnvio(false);
    setErrorForm(null);
  }

  async function manejarCreacion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErrorForm(null);
    setIntentoEnvio(true);

    // El submit respeta los MISMOS errores derivados (no se duplica la lógica).
    if (Object.keys(errores).length > 0) {
      return;
    }

    const familia = familias.find((f) => String(f.id) === form.familiaId);
    if (!familia) {
      setErrorForm("Selecciona una familia.");
      return;
    }

    const tieneRef = Boolean(form.unidadReferenciaId);

    setEnviando(true);
    try {
      const respuesta = await crearProducto({
        familiaId: familia.id,
        nombre: form.nombre.trim(),
        codigoParlante: form.codigoParlante.trim(),
        unidadId: Number(form.unidadId),
        nombreSku: form.nombreSku.trim() || undefined,
        stockMinimo: form.stockMinimo.trim() || undefined,
        stockMaximo: form.stockMaximo.trim() || undefined,
        puntoReposicion: form.puntoReposicion.trim() || undefined,
        semanasReposicion: form.semanasReposicion.trim()
          ? Number(form.semanasReposicion.trim())
          : undefined,
        unidadReferenciaId: tieneRef ? Number(form.unidadReferenciaId) : undefined,
        factorConversion: tieneRef ? form.factorConversion.trim() : undefined,
        precioPublico: form.precioPublico.trim() || undefined,
        precioDistribuidor: form.precioDistribuidor.trim() || undefined,
        monedaVenta:
          form.precioPublico.trim() || form.precioDistribuidor.trim()
            ? form.monedaVenta
            : undefined,
        esRenovable: form.esRenovable === "" ? undefined : form.esRenovable === "true",
      });
      setExito(`Producto creado correctamente (SKU #${respuesta.skuId}).`);
      setForm(FORMULARIO_INICIAL);
      setTocado({});
      setIntentoEnvio(false);
      setPanelAbierto(false);
      await cargarSkus(busqueda.trim(), filtroRenovable, pagina);
    } catch (error) {
      setErrorForm(
        error instanceof ErrorApi ? error.message : "No se pudo crear el producto.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <EncabezadoPagina
        titulo="Productos"
        descripcion="Catálogo de SKUs y registro de nuevos productos."
      />

      {exito && (
        <div role="status" className="aviso aviso-exito mt-4">
          <span>{exito}</span>
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Catálogo
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({formatearNumero(total)} SKUs)
            </span>
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="filtroRenovable" className="sr-only">
              Filtrar por renovabilidad
            </label>
            <select
              id="filtroRenovable"
              value={filtroRenovable}
              onChange={(e) => setFiltroRenovable(e.target.value)}
              className="campo w-36"
            >
              <option value="">Todas</option>
              <option value="true">Renovables</option>
              <option value="false">No renovables</option>
            </select>
            <div role="search" className="relative">
              <label htmlFor="busqueda" className="sr-only">
                Buscar SKU
              </label>
              <input
                id="busqueda"
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="campo w-60"
                autoComplete="off"
              />
              {cargandoLista && busqueda.trim() !== "" && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-texto-ter">
                  Buscando…
                </span>
              )}
            </div>
            <button type="button" onClick={abrirNuevo} className="btn btn-primario whitespace-nowrap">
              Nuevo producto
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {errorLista ? (
            <div role="alert" className="aviso aviso-peligro m-5">
              <span>{errorLista}</span>
            </div>
          ) : cargandoLista ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">Cargando…</p>
          ) : skus.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-texto-ter">
              No se encontraron SKUs.
            </p>
          ) : (
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Código parlante</th>
                  <th>Nombre</th>
                  <th>Producto</th>
                  <th>Familia</th>
                  <th>Unidad</th>
                  <th>Unidad ref.</th>
                  <th>Renovable</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {skus.map((sku) => (
                  <tr key={sku.id}>
                    <td className="font-mono text-texto">{sku.codigoParlante}</td>
                    <td className="text-tinta">{sku.nombre ?? sku.producto.nombre}</td>
                    <td className="text-texto-sec">{sku.producto.nombre}</td>
                    <td className="text-texto-sec">{sku.familia.nombre}</td>
                    <td className="text-texto-sec">{sku.unidad.codigo}</td>
                    <td className="text-texto-sec">
                      {sku.unidadReferencia && sku.factorConversion
                        ? `${sku.unidadReferencia.codigo} (×${sku.factorConversion})`
                        : "—"}
                    </td>
                    <td>
                      {sku.esRenovable === null ? (
                        <span className="text-texto-ter">—</span>
                      ) : sku.esRenovable ? (
                        <span className="insignia insignia-exito">Sí</span>
                      ) : (
                        <span className="insignia insignia-neutra">No</span>
                      )}
                    </td>
                    <td className="text-right">
                      <BotonVer
                        onVer={() => void abrirDetalle(sku.id)}
                        etiqueta={`Ver detalle de ${sku.nombre ?? sku.producto.nombre}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!errorLista && !cargandoLista && skus.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-5 py-3 text-sm text-texto-sec">
            <span>
              Mostrando {formatearNumero((pagina - 1) * POR_PAGINA + 1)}–
              {formatearNumero(Math.min(pagina * POR_PAGINA, total))} de{" "}
              {formatearNumero(total)} SKUs
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-contorno"
                disabled={pagina <= 1}
                onClick={() => void cargarSkus(busqueda.trim(), filtroRenovable, pagina - 1)}
              >
                « Anterior
              </button>
              <span className="px-1 whitespace-nowrap">
                Página {formatearNumero(pagina)} de {formatearNumero(totalPaginas)}
              </span>
              <button
                type="button"
                className="btn btn-contorno"
                disabled={pagina >= totalPaginas}
                onClick={() => void cargarSkus(busqueda.trim(), filtroRenovable, pagina + 1)}
              >
                Siguiente »
              </button>
            </div>
          </div>
        )}
      </section>

      <PanelLateral
        abierto={panelAbierto}
        titulo="Nuevo producto"
        descripcion="Registra un SKU nuevo en el catálogo."
        onCerrar={cerrarPanel}
      >
        <form onSubmit={manejarCreacion} className="space-y-4">
          {errorForm && (
            <div role="alert" className="aviso aviso-peligro">
              <span>{errorForm}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="familia" className="etiqueta-campo">
                Familia
              </label>
              <SelectorBusqueda
                id="familia"
                opciones={opcionesFamilia}
                valor={form.familiaId}
                onCambio={(valor) => {
                  actualizar("familiaId", valor);
                  marcarTocado("familiaId");
                }}
                placeholder="Selecciona…"
                requerido
                ariaLabel="Familia"
              />
              {errorVisible("familiaId") && (
                <p className="mt-1.5 text-xs text-peligro">{errorVisible("familiaId")}</p>
              )}
            </div>
            <div>
              <label htmlFor="unidad" className="etiqueta-campo">
                Unidad
              </label>
              <SelectorBusqueda
                id="unidad"
                opciones={opcionesUnidad}
                valor={form.unidadId}
                onCambio={(valor) => {
                  actualizar("unidadId", valor);
                  marcarTocado("unidadId");
                }}
                placeholder="Selecciona…"
                requerido
                ariaLabel="Unidad"
              />
              {errorVisible("unidadId") && (
                <p className="mt-1.5 text-xs text-peligro">{errorVisible("unidadId")}</p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="nombre" className="etiqueta-campo">
              Nombre del producto
            </label>
            <input
              id="nombre"
              value={form.nombre}
              onChange={(e) => actualizar("nombre", e.target.value)}
              required
              className="campo"
            />
          </div>

          <div>
            <label htmlFor="codigoParlante" className="etiqueta-campo">
              Código parlante (14 dígitos)
            </label>
            <input
              id="codigoParlante"
              value={form.codigoParlante}
              onChange={(e) =>
                actualizar("codigoParlante", e.target.value.replace(/\D/g, "").slice(0, 14))
              }
              onBlur={() => marcarTocado("codigoParlante")}
              inputMode="numeric"
              required
              aria-invalid={errorVisible("codigoParlante") ? "true" : undefined}
              aria-describedby="codigoParlante-ayuda"
              className="campo font-mono"
            />
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <p id="codigoParlante-ayuda" className="text-xs text-texto-ter">
                Los 3 primeros dígitos deben coincidir con el código de la familia.
              </p>
              <span
                className={`shrink-0 font-mono text-xs ${
                  form.codigoParlante.length === 14 ? "text-exito" : "text-texto-ter"
                }`}
              >
                {form.codigoParlante.length} / 14 dígitos
              </span>
            </div>
            {errorVisible("codigoParlante") ? (
              <p className="mt-1.5 text-xs text-peligro">{errorVisible("codigoParlante")}</p>
            ) : (
              form.codigoParlante.length === 14 &&
              !errores.codigoParlante && (
                <p className="mt-1.5 text-xs text-exito">Código parlante válido.</p>
              )
            )}
          </div>

          <div>
            <label htmlFor="nombreSku" className="etiqueta-campo">
              Nombre del SKU (opcional)
            </label>
            <input
              id="nombreSku"
              value={form.nombreSku}
              onChange={(e) => actualizar("nombreSku", e.target.value)}
              className="campo"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="stockMinimo" className="etiqueta-campo">
                Stock mínimo (opcional)
              </label>
              <input
                id="stockMinimo"
                value={form.stockMinimo}
                onChange={(e) => actualizar("stockMinimo", e.target.value)}
                inputMode="decimal"
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor="stockMaximo" className="etiqueta-campo">
                Stock máximo (opcional)
              </label>
              <input
                id="stockMaximo"
                value={form.stockMaximo}
                onChange={(e) => actualizar("stockMaximo", e.target.value)}
                inputMode="decimal"
                aria-describedby="stockMaximo-ayuda"
                className="campo font-mono"
              />
              <p id="stockMaximo-ayuda" className="mt-1.5 text-xs text-texto-ter">
                Nivel objetivo al reponer. Define la cantidad sugerida a pedir.
              </p>
            </div>
            <div>
              <label htmlFor="puntoReposicion" className="etiqueta-campo">
                Punto de reposición (opcional)
              </label>
              <input
                id="puntoReposicion"
                value={form.puntoReposicion}
                onChange={(e) => actualizar("puntoReposicion", e.target.value)}
                inputMode="decimal"
                aria-describedby="puntoReposicion-ayuda"
                className="campo font-mono"
              />
              <p id="puntoReposicion-ayuda" className="mt-1.5 text-xs text-texto-ter">
                Cuando el disponible cae a este nivel, el producto entra al reporte de
                reposición. Si se omite, se usa el stock mínimo.
              </p>
            </div>
            <div>
              <label htmlFor="semanasReposicion" className="etiqueta-campo">
                Semanas de reposición (opcional)
              </label>
              <input
                id="semanasReposicion"
                value={form.semanasReposicion}
                onChange={(e) =>
                  actualizar("semanasReposicion", e.target.value.replace(/\D/g, "").slice(0, 3))
                }
                inputMode="numeric"
                className="campo font-mono"
              />
            </div>
          </div>

          <div>
            <label htmlFor="esRenovable" className="etiqueta-campo">
              Renovabilidad
            </label>
            <select
              id="esRenovable"
              value={form.esRenovable}
              onChange={(e) => actualizar("esRenovable", e.target.value)}
              aria-describedby="esRenovable-ayuda"
              className="campo"
            >
              <option value="">Sin clasificar</option>
              <option value="true">Renovable</option>
              <option value="false">No renovable</option>
            </select>
            <p id="esRenovable-ayuda" className="mt-1.5 text-xs text-texto-ter">
              Una existencia renovable se repone, se consume y se vuelve a comprar.
            </p>
          </div>

          <fieldset className="grid gap-4 rounded-md border border-borde bg-panel-alt p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium text-texto">
              Precios de venta <span className="text-texto-ter">(opcional)</span>
            </legend>
            <div>
              <label htmlFor="precioPublico" className="etiqueta-campo">
                Precio público
              </label>
              <input
                id="precioPublico"
                value={form.precioPublico}
                onChange={(e) =>
                  actualizar("precioPublico", e.target.value.replace(/[^\d.]/g, ""))
                }
                inputMode="decimal"
                placeholder="Ej. 25.90"
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor="precioDistribuidor" className="etiqueta-campo">
                Precio distribuidor
              </label>
              <input
                id="precioDistribuidor"
                value={form.precioDistribuidor}
                onChange={(e) =>
                  actualizar("precioDistribuidor", e.target.value.replace(/[^\d.]/g, ""))
                }
                inputMode="decimal"
                placeholder="Ej. 21.50"
                className="campo font-mono"
              />
            </div>
            <div>
              <label htmlFor="monedaVenta" className="etiqueta-campo">
                Moneda
              </label>
              <select
                id="monedaVenta"
                value={form.monedaVenta}
                onChange={(e) => actualizar("monedaVenta", e.target.value)}
                className="campo"
              >
                <option value="PEN">PEN — Soles</option>
                <option value="USD">USD — Dólares</option>
              </select>
            </div>
            <p className="text-xs text-texto-ter sm:col-span-3">
              Estos precios alimentan la sugerencia automática al armar una orden de venta,
              según el nivel de precio del cliente.
            </p>
          </fieldset>

          <fieldset className="grid gap-4 rounded-md border border-borde bg-panel-alt p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium text-texto">
              Multi-unidad <span className="text-texto-ter">(opcional)</span>
            </legend>
            <div>
              <label htmlFor="unidadReferencia" className="etiqueta-campo">
                Unidad de referencia
              </label>
              <SelectorBusqueda
                id="unidadReferencia"
                opciones={opcionesUnidadReferencia}
                valor={form.unidadReferenciaId}
                onCambio={(valor) => {
                  actualizar("unidadReferenciaId", valor);
                  marcarTocado("unidadReferenciaId");
                  marcarTocado("factorConversion");
                }}
                placeholder="Sin unidad de referencia"
                ariaLabel="Unidad de referencia"
              />
              {errorVisible("unidadReferenciaId") && (
                <p className="mt-1.5 text-xs text-peligro">
                  {errorVisible("unidadReferenciaId")}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="factorConversion" className="etiqueta-campo">
                Factor de conversión
              </label>
              <input
                id="factorConversion"
                value={form.factorConversion}
                onChange={(e) =>
                  actualizar("factorConversion", e.target.value.replace(/[^\d.]/g, ""))
                }
                onBlur={() => marcarTocado("factorConversion")}
                inputMode="decimal"
                placeholder="Ej. 12"
                aria-invalid={errorVisible("factorConversion") ? "true" : undefined}
                aria-describedby="factorConversion-ayuda"
                className="campo font-mono"
              />
              {errorVisible("factorConversion") && (
                <p className="mt-1.5 text-xs text-peligro">
                  {errorVisible("factorConversion")}
                </p>
              )}
              <p id="factorConversion-ayuda" className="mt-1.5 text-xs text-texto-ter">
                Cuántas unidades de la unidad principal equivalen a UNA unidad de
                referencia. Ej.: 1 caja = 12 unidades → factor 12.
              </p>
            </div>
          </fieldset>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={enviando} className="btn btn-primario">
              {enviando ? "Creando…" : "Crear producto"}
            </button>
            <button type="button" onClick={cerrarPanel} className="btn btn-contorno">
              Cancelar
            </button>
          </div>
        </form>
      </PanelLateral>

      <PanelLateral
        abierto={detalleId !== null}
        titulo={detalle ? detalle.nombre ?? detalle.producto.nombre : "Detalle del SKU"}
        descripcion={detalle ? detalle.codigoParlante : undefined}
        onCerrar={cerrarDetalle}
      >
        {cargandoDetalle ? (
          <p className="px-1 py-10 text-center text-sm text-texto-ter">Cargando…</p>
        ) : errorDetalle ? (
          <div role="alert" className="aviso aviso-peligro">
            <span>{errorDetalle}</span>
          </div>
        ) : detalle ? (
          <DetalleContenido detalle={detalle} />
        ) : null}
      </PanelLateral>
    </div>
  );
}

/** Muestra el valor o un guion si es null/vacio. */
function valor(texto: string | null | undefined): string {
  return texto && texto.trim() !== "" ? texto : "—";
}

function FilaDato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-sm text-texto-sec">{etiqueta}</dt>
      <dd className="text-right text-sm text-tinta">{children}</dd>
    </div>
  );
}

function Seccion({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-ter">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function DetalleContenido({ detalle }: { detalle: DetalleSku }): React.JSX.Element {
  const moneda = detalle.precios.moneda ?? "PEN";
  return (
    <div className="space-y-6">
      <Seccion titulo="Identificación">
        <dl className="divide-y divide-borde">
          <FilaDato etiqueta="Código parlante">
            <span className="font-mono">{detalle.codigoParlante}</span>
          </FilaDato>
          <FilaDato etiqueta="Código de barras">
            <span className="font-mono">{valor(detalle.codigoBarras)}</span>
          </FilaDato>
          <FilaDato etiqueta="Código UNSPSC">
            <span className="font-mono">{valor(detalle.codigoUnspsc)}</span>
          </FilaDato>
          <FilaDato etiqueta="Producto">{detalle.producto.nombre}</FilaDato>
          <FilaDato etiqueta="Familia">
            {detalle.familia.codigo} — {detalle.familia.nombre}
          </FilaDato>
          <FilaDato etiqueta="Unidad">
            {detalle.unidad.codigo} — {detalle.unidad.nombre}
          </FilaDato>
          <FilaDato etiqueta="Unidad de referencia">
            {detalle.unidadReferencia && detalle.factorConversion
              ? `${detalle.unidadReferencia.codigo} (×${detalle.factorConversion})`
              : "—"}
          </FilaDato>
          <FilaDato etiqueta="Tipo de existencia">
            {detalle.tipoExistencia}
          </FilaDato>
          <FilaDato etiqueta="Método de valuación">
            {detalle.metodoValuacion}
          </FilaDato>
          <FilaDato etiqueta="Estado">
            {detalle.activo ? (
              <span className="insignia insignia-exito">Activo</span>
            ) : (
              <span className="insignia insignia-neutra">Inactivo</span>
            )}
          </FilaDato>
          <FilaDato etiqueta="Creado">{formatearFecha(detalle.creadoEn)}</FilaDato>
        </dl>
      </Seccion>

      <Seccion titulo="Stock por almacén">
        {detalle.stock.porAlmacen.length === 0 ? (
          <p className="text-sm text-texto-ter">Sin existencias registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Almacén</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">Comprometido</th>
                  <th className="text-right">Deteriorado</th>
                  <th className="text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {detalle.stock.porAlmacen.map((fila) => (
                  <tr key={fila.almacenId}>
                    <td className="text-tinta">{fila.almacen}</td>
                    <td className="text-right font-mono text-texto">
                      {formatearNumero(fila.disponible)}
                    </td>
                    <td className="text-right font-mono text-texto-sec">
                      {formatearNumero(fila.comprometida)}
                    </td>
                    <td className="text-right font-mono text-texto-sec">
                      {formatearNumero(fila.deteriorada)}
                    </td>
                    <td className="text-right font-mono text-texto">
                      {formatearSoles(fila.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="text-tinta">Total</td>
                  <td className="text-right font-mono text-tinta">
                    {formatearNumero(detalle.stock.totales.disponible)}
                  </td>
                  <td className="text-right font-mono text-tinta">
                    {formatearNumero(detalle.stock.totales.comprometida)}
                  </td>
                  <td className="text-right font-mono text-tinta">
                    {formatearNumero(detalle.stock.totales.deteriorada)}
                  </td>
                  <td className="text-right font-mono text-tinta">
                    {formatearSoles(detalle.stock.totales.valorTotal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Precios de venta">
        <dl className="divide-y divide-borde">
          <FilaDato etiqueta="Moneda">{valor(detalle.precios.moneda)}</FilaDato>
          <FilaDato etiqueta="Público">
            {detalle.precios.publico
              ? formatearPrecio(detalle.precios.publico, moneda)
              : "—"}
          </FilaDato>
          <FilaDato etiqueta="Distribuidor">
            {detalle.precios.distribuidor
              ? formatearPrecio(detalle.precios.distribuidor, moneda)
              : "—"}
          </FilaDato>
          <FilaDato etiqueta="Venta nivel 3">
            {detalle.precios.venta3
              ? formatearPrecio(detalle.precios.venta3, moneda)
              : "—"}
          </FilaDato>
          <FilaDato etiqueta="Venta nivel 4">
            {detalle.precios.venta4
              ? formatearPrecio(detalle.precios.venta4, moneda)
              : "—"}
          </FilaDato>
        </dl>
      </Seccion>

      <Seccion titulo="Reposición y clasificación">
        <dl className="divide-y divide-borde">
          <FilaDato etiqueta="Stock mínimo">
            <span className="font-mono">
              {detalle.reposicion.stockMinimo
                ? formatearNumero(detalle.reposicion.stockMinimo)
                : "—"}
            </span>
          </FilaDato>
          <FilaDato etiqueta="Stock máximo">
            <span className="font-mono">
              {detalle.reposicion.stockMaximo
                ? formatearNumero(detalle.reposicion.stockMaximo)
                : "—"}
            </span>
          </FilaDato>
          <FilaDato etiqueta="Punto de reposición">
            <span className="font-mono">
              {detalle.reposicion.puntoReposicion
                ? formatearNumero(detalle.reposicion.puntoReposicion)
                : "—"}
            </span>
          </FilaDato>
          <FilaDato etiqueta="Semanas de reposición">
            <span className="font-mono">
              {detalle.reposicion.semanasReposicion ?? "—"}
            </span>
          </FilaDato>
          <FilaDato etiqueta="Clasificación ABC">
            {detalle.clasificacionAbc ? (
              <span className="insignia insignia-neutra">
                {detalle.clasificacionAbc}
              </span>
            ) : (
              "—"
            )}
          </FilaDato>
          <FilaDato etiqueta="Renovable">
            {detalle.esRenovable === null ? (
              "—"
            ) : detalle.esRenovable ? (
              <span className="insignia insignia-exito">Sí</span>
            ) : (
              <span className="insignia insignia-neutra">No</span>
            )}
          </FilaDato>
          <FilaDato etiqueta="Controla serie">
            {detalle.controlaSerie ? "Sí" : "No"}
          </FilaDato>
          <FilaDato etiqueta="Controla lote">
            {detalle.controlaLote ? "Sí" : "No"}
          </FilaDato>
          <FilaDato etiqueta="Controla vencimiento">
            {detalle.controlaVencimiento ? "Sí" : "No"}
          </FilaDato>
        </dl>
      </Seccion>

      <Seccion titulo="Movimientos recientes">
        {detalle.movimientos.length === 0 ? (
          <p className="text-sm text-texto-ter">Sin movimientos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th className="text-right">Cantidad</th>
                  <th>Almacén</th>
                  <th>Documento</th>
                </tr>
              </thead>
              <tbody>
                {detalle.movimientos.map((mov, indice) => (
                  <tr key={indice}>
                    <td className="text-texto-sec">{formatearFecha(mov.fecha)}</td>
                    <td className="text-texto-sec">{mov.tipo}</td>
                    <td className="text-right font-mono text-texto">
                      {mov.signo === "SALIDA" ? "−" : "+"}
                      {formatearNumero(mov.cantidad)}
                    </td>
                    <td className="text-texto-sec">{mov.almacen}</td>
                    <td className="text-texto-sec">{valor(mov.documento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>
    </div>
  );
}

/** Formatea un precio según su moneda (PEN o USD). */
function formatearPrecio(monto: string, moneda: string): string {
  return moneda === "USD" ? formatearDolares(monto) : formatearSoles(monto);
}
