"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { PanelLateral } from "@/componentes/panel-lateral";
import {
  SelectorBusqueda,
  type OpcionSelector,
} from "@/componentes/selector-busqueda";
import {
  ErrorApi,
  crearProducto,
  obtenerFamilias,
  obtenerSkus,
  obtenerUnidades,
  type Familia,
  type Sku,
  type Unidad,
} from "@/lib/api";
import { formatearNumero } from "@/lib/formato";

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

  const cargarSkus = useCallback(
    async (termino: string, renovable: string): Promise<void> => {
      setCargandoLista(true);
      setErrorLista(null);
      try {
        const respuesta = await obtenerSkus(
          1,
          POR_PAGINA,
          termino,
          renovable === "" ? undefined : renovable === "true",
        );
        setSkus(respuesta.datos);
        setTotal(respuesta.total);
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

  useEffect(() => {
    void cargarSkus("", "");
    void (async (): Promise<void> => {
      try {
        const [fam, uni] = await Promise.all([obtenerFamilias(), obtenerUnidades()]);
        setFamilias(fam);
        setUnidades(uni);
      } catch {
        setErrorForm("No se pudieron cargar familias o unidades.");
      }
    })();
  }, [cargarSkus]);

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

  function manejarBusqueda(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void cargarSkus(busqueda.trim(), filtroRenovable);
  }

  function actualizar(campo: keyof EstadoFormulario, valor: string): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  function abrirNuevo(): void {
    setForm(FORMULARIO_INICIAL);
    setErrorForm(null);
    setExito(null);
    setPanelAbierto(true);
  }

  function cerrarPanel(): void {
    if (enviando) return;
    setPanelAbierto(false);
    setForm(FORMULARIO_INICIAL);
    setErrorForm(null);
  }

  async function manejarCreacion(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setErrorForm(null);

    const familia = familias.find((f) => String(f.id) === form.familiaId);
    if (!familia) {
      setErrorForm("Selecciona una familia.");
      return;
    }
    if (form.codigoParlante.length !== 14) {
      setErrorForm("El código parlante debe tener 14 dígitos.");
      return;
    }
    // Validacion de UX: los 3 primeros digitos deben coincidir con la familia.
    if (!form.codigoParlante.startsWith(familia.codigo)) {
      setErrorForm(
        `Los primeros dígitos del código parlante deben coincidir con la familia (${familia.codigo}).`,
      );
      return;
    }
    if (!form.unidadId) {
      setErrorForm("Selecciona una unidad.");
      return;
    }

    // Multi-unidad: la unidad de referencia y el factor van juntos o ninguno.
    const tieneRef = Boolean(form.unidadReferenciaId);
    const tieneFactor = Boolean(form.factorConversion.trim());
    if (tieneRef !== tieneFactor) {
      setErrorForm(
        "La unidad de referencia y el factor de conversión deben indicarse juntos o dejarse ambos vacíos.",
      );
      return;
    }
    if (tieneRef) {
      if (form.unidadReferenciaId === form.unidadId) {
        setErrorForm("La unidad de referencia debe ser distinta de la unidad principal.");
        return;
      }
      if (!(Number(form.factorConversion) > 0)) {
        setErrorForm("El factor de conversión debe ser mayor que cero.");
        return;
      }
    }

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
      setPanelAbierto(false);
      await cargarSkus(busqueda.trim(), filtroRenovable);
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
              onChange={(e) => {
                setFiltroRenovable(e.target.value);
                void cargarSkus(busqueda.trim(), e.target.value);
              }}
              className="campo w-36"
            >
              <option value="">Todas</option>
              <option value="true">Renovables</option>
              <option value="false">No renovables</option>
            </select>
            <form onSubmit={manejarBusqueda} className="flex gap-2" role="search">
              <label htmlFor="busqueda" className="sr-only">
                Buscar SKU
              </label>
              <input
                id="busqueda"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="campo w-60"
              />
              <button type="submit" className="btn btn-contorno">
                Buscar
              </button>
            </form>
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
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                onCambio={(valor) => actualizar("familiaId", valor)}
                placeholder="Selecciona…"
                requerido
                ariaLabel="Familia"
              />
            </div>
            <div>
              <label htmlFor="unidad" className="etiqueta-campo">
                Unidad
              </label>
              <SelectorBusqueda
                id="unidad"
                opciones={opcionesUnidad}
                valor={form.unidadId}
                onCambio={(valor) => actualizar("unidadId", valor)}
                placeholder="Selecciona…"
                requerido
                ariaLabel="Unidad"
              />
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
              inputMode="numeric"
              required
              aria-describedby="codigoParlante-ayuda"
              className="campo font-mono"
            />
            <p id="codigoParlante-ayuda" className="mt-1.5 text-xs text-texto-ter">
              Los 3 primeros dígitos deben coincidir con el código de la familia.
            </p>
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
                onCambio={(valor) => actualizar("unidadReferenciaId", valor)}
                placeholder="Sin unidad de referencia"
                ariaLabel="Unidad de referencia"
              />
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
                inputMode="decimal"
                placeholder="Ej. 12"
                aria-describedby="factorConversion-ayuda"
                className="campo font-mono"
              />
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
    </div>
  );
}
