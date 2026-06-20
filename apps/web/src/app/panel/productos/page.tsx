"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
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
};

export default function PaginaProductos(): React.JSX.Element {
  const [skus, setSkus] = useState<Sku[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [busqueda, setBusqueda] = useState<string>("");
  const [cargandoLista, setCargandoLista] = useState<boolean>(true);
  const [errorLista, setErrorLista] = useState<string | null>(null);

  const [familias, setFamilias] = useState<Familia[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);

  const [form, setForm] = useState<EstadoFormulario>(FORMULARIO_INICIAL);
  const [enviando, setEnviando] = useState<boolean>(false);
  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  const cargarSkus = useCallback(async (termino: string): Promise<void> => {
    setCargandoLista(true);
    setErrorLista(null);
    try {
      const respuesta = await obtenerSkus(1, POR_PAGINA, termino);
      setSkus(respuesta.datos);
      setTotal(respuesta.total);
    } catch (error) {
      setErrorLista(
        error instanceof ErrorApi
          ? error.message
          : "No se pudo cargar el catálogo.",
      );
    } finally {
      setCargandoLista(false);
    }
  }, []);

  useEffect(() => {
    void cargarSkus("");
    void (async (): Promise<void> => {
      try {
        const [fam, uni] = await Promise.all([
          obtenerFamilias(),
          obtenerUnidades(),
        ]);
        setFamilias(fam);
        setUnidades(uni);
      } catch {
        setErrorForm("No se pudieron cargar familias o unidades.");
      }
    })();
  }, [cargarSkus]);

  function manejarBusqueda(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void cargarSkus(busqueda.trim());
  }

  function actualizar(campo: keyof EstadoFormulario, valor: string): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  async function manejarCreacion(
    evento: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    evento.preventDefault();
    setErrorForm(null);
    setExito(null);

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
      });
      setExito(`Producto creado correctamente (SKU #${respuesta.skuId}).`);
      setForm(FORMULARIO_INICIAL);
      await cargarSkus(busqueda.trim());
    } catch (error) {
      setErrorForm(
        error instanceof ErrorApi
          ? error.message
          : "No se pudo crear el producto.",
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

      <div className="space-y-6">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Nuevo producto</span>
          </div>
          <div className="p-5">
            {errorForm && (
              <div role="alert" className="aviso aviso-peligro mb-4">
                <span>{errorForm}</span>
              </div>
            )}
            {exito && (
              <div role="status" className="aviso aviso-exito mb-4">
                <span>{exito}</span>
              </div>
            )}

            <form
              onSubmit={manejarCreacion}
              className="grid gap-4 sm:grid-cols-2"
            >
              <div>
                <label htmlFor="familia" className="etiqueta-campo">
                  Familia
                </label>
                <select
                  id="familia"
                  value={form.familiaId}
                  onChange={(e) => actualizar("familiaId", e.target.value)}
                  required
                  className="campo"
                >
                  <option value="">Selecciona…</option>
                  {familias.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.codigo} — {f.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="unidad" className="etiqueta-campo">
                  Unidad
                </label>
                <select
                  id="unidad"
                  value={form.unidadId}
                  onChange={(e) => actualizar("unidadId", e.target.value)}
                  required
                  className="campo"
                >
                  <option value="">Selecciona…</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo} — {u.nombre}
                    </option>
                  ))}
                </select>
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
                    actualizar(
                      "codigoParlante",
                      e.target.value.replace(/\D/g, "").slice(0, 14),
                    )
                  }
                  inputMode="numeric"
                  required
                  aria-describedby="codigoParlante-ayuda"
                  className="campo font-mono"
                />
                <p
                  id="codigoParlante-ayuda"
                  className="mt-1.5 text-xs text-texto-ter"
                >
                  Los 3 primeros dígitos deben coincidir con el código de la
                  familia.
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
                <p
                  id="stockMaximo-ayuda"
                  className="mt-1.5 text-xs text-texto-ter"
                >
                  Nivel objetivo al reponer. Define la cantidad sugerida a
                  pedir.
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
                <p
                  id="puntoReposicion-ayuda"
                  className="mt-1.5 text-xs text-texto-ter"
                >
                  Cuando el disponible cae a este nivel, el producto entra al
                  reporte de reposición. Si se omite, se usa el stock mínimo.
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
                    actualizar(
                      "semanasReposicion",
                      e.target.value.replace(/\D/g, "").slice(0, 3),
                    )
                  }
                  inputMode="numeric"
                  className="campo font-mono"
                />
              </div>

              <div className="sm:col-span-2">
                <fieldset className="grid gap-4 rounded-md border border-borde bg-panel-alt p-4 sm:grid-cols-2">
                  <legend className="px-1 text-sm font-medium text-texto">
                    Multi-unidad <span className="text-texto-ter">(opcional)</span>
                  </legend>
                  <div>
                    <label htmlFor="unidadReferencia" className="etiqueta-campo">
                      Unidad de referencia
                    </label>
                    <select
                      id="unidadReferencia"
                      value={form.unidadReferenciaId}
                      onChange={(e) =>
                        actualizar("unidadReferenciaId", e.target.value)
                      }
                      className="campo"
                    >
                      <option value="">Sin unidad de referencia</option>
                      {unidades
                        .filter((u) => String(u.id) !== form.unidadId)
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.codigo} — {u.nombre}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="factorConversion" className="etiqueta-campo">
                      Factor de conversión
                    </label>
                    <input
                      id="factorConversion"
                      value={form.factorConversion}
                      onChange={(e) =>
                        actualizar(
                          "factorConversion",
                          e.target.value.replace(/[^\d.]/g, ""),
                        )
                      }
                      inputMode="decimal"
                      placeholder="Ej. 12"
                      aria-describedby="factorConversion-ayuda"
                      className="campo font-mono"
                    />
                    <p
                      id="factorConversion-ayuda"
                      className="mt-1.5 text-xs text-texto-ter"
                    >
                      Cuántas unidades de la unidad principal equivalen a UNA
                      unidad de referencia. Ej.: 1 caja = 12 unidades → factor 12.
                    </p>
                  </div>
                </fieldset>
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={enviando}
                  className="btn btn-primario"
                >
                  {enviando ? "Creando…" : "Crear producto"}
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">
              Catálogo
              <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
                ({formatearNumero(total)} SKUs)
              </span>
            </span>
            <form onSubmit={manejarBusqueda} className="flex gap-2" role="search">
              <label htmlFor="busqueda" className="sr-only">
                Buscar SKU
              </label>
              <input
                id="busqueda"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="campo w-64"
              />
              <button type="submit" className="btn btn-contorno">
                Buscar
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            {errorLista ? (
              <div role="alert" className="aviso aviso-peligro m-5">
                <span>{errorLista}</span>
              </div>
            ) : cargandoLista ? (
              <p className="px-3 py-10 text-center text-sm text-texto-ter">
                Cargando…
              </p>
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
                  </tr>
                </thead>
                <tbody>
                  {skus.map((sku) => (
                    <tr key={sku.id}>
                      <td className="font-mono text-texto">
                        {sku.codigoParlante}
                      </td>
                      <td className="text-tinta">{sku.nombre ?? sku.producto.nombre}</td>
                      <td className="text-texto-sec">{sku.producto.nombre}</td>
                      <td className="text-texto-sec">{sku.familia.nombre}</td>
                      <td className="text-texto-sec">{sku.unidad.codigo}</td>
                      <td className="text-texto-sec">
                        {sku.unidadReferencia && sku.factorConversion
                          ? `${sku.unidadReferencia.codigo} (×${sku.factorConversion})`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
