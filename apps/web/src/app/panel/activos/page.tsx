"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  ErrorApi,
  crearActivo,
  crearCategoriaActivo,
  depreciar,
  obtenerActivos,
  obtenerCategoriasActivo,
  type Activo,
  type CategoriaActivo,
} from "@/lib/api";
import { formatearSoles } from "@/lib/formato";

const SUCURSAL_PRINCIPAL = 1;

type Pestania = "categorias" | "activos" | "depreciacion";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

const PESTANIAS: readonly { id: Pestania; etiqueta: string }[] = [
  { id: "categorias", etiqueta: "Categorías" },
  { id: "activos", etiqueta: "Activos" },
  { id: "depreciacion", etiqueta: "Depreciación" },
];

/** Periodo de depreciación en formato AAAA-MM. */
const PATRON_PERIODO = /^\d{4}-\d{2}$/;

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function AvisoLinea({ aviso }: { aviso: Aviso }): React.JSX.Element {
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`mt-4 aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
    >
      <span>{aviso.texto}</span>
    </div>
  );
}

export default function PaginaActivos(): React.JSX.Element {
  const [pestania, setPestania] = useState<Pestania>("categorias");

  const [categorias, setCategorias] = useState<CategoriaActivo[]>([]);
  const [activos, setActivos] = useState<Activo[]>([]);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);
  const [avisoBase, setAvisoBase] = useState<Aviso | null>(null);

  // Categoría en borrador
  const [catNombre, setCatNombre] = useState<string>("");
  const [catVidaUtil, setCatVidaUtil] = useState<string>("");
  const [catTasa, setCatTasa] = useState<string>("");
  const [guardandoCategoria, setGuardandoCategoria] = useState<boolean>(false);
  const [avisoCategoria, setAvisoCategoria] = useState<Aviso | null>(null);

  // Activo en borrador
  const [actCategoriaId, setActCategoriaId] = useState<string>("");
  const [actCodigo, setActCodigo] = useState<string>("");
  const [actNombre, setActNombre] = useState<string>("");
  const [actMarca, setActMarca] = useState<string>("");
  const [actModelo, setActModelo] = useState<string>("");
  const [actSerie, setActSerie] = useState<string>("");
  const [actDepartamento, setActDepartamento] = useState<string>("");
  const [actFechaCompra, setActFechaCompra] = useState<string>("");
  const [actValorAdquisicion, setActValorAdquisicion] = useState<string>("");
  const [actValorResidual, setActValorResidual] = useState<string>("");
  const [actVidaUtil, setActVidaUtil] = useState<string>("");
  const [guardandoActivo, setGuardandoActivo] = useState<boolean>(false);
  const [avisoActivo, setAvisoActivo] = useState<Aviso | null>(null);

  // Depreciación
  const [periodo, setPeriodo] = useState<string>("");
  const [depreciando, setDepreciando] = useState<boolean>(false);
  const [avisoDepreciacion, setAvisoDepreciacion] = useState<Aviso | null>(null);

  useEffect(() => {
    void cargarBase();
  }, []);

  async function cargarBase(): Promise<void> {
    setCargandoBase(true);
    try {
      const [respCategorias, respActivos] = await Promise.all([
        obtenerCategoriasActivo(),
        obtenerActivos(),
      ]);
      setCategorias(respCategorias);
      setActivos(respActivos);
    } catch (error) {
      setAvisoBase({
        texto: mensajeError(error, "No se pudieron cargar los datos de activos."),
        tono: "error",
      });
    } finally {
      setCargandoBase(false);
    }
  }

  async function manejarCategoria(
    evento: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    evento.preventDefault();
    setAvisoCategoria(null);
    if (!catNombre || !catVidaUtil || !catTasa) {
      setAvisoCategoria({
        texto: "Completa nombre, vida útil y tasa anual.",
        tono: "error",
      });
      return;
    }
    setGuardandoCategoria(true);
    try {
      await crearCategoriaActivo({
        nombre: catNombre,
        vidaUtilMeses: Number(catVidaUtil),
        tasaAnual: catTasa,
      });
      setAvisoCategoria({ texto: "Categoría creada.", tono: "exito" });
      setCatNombre("");
      setCatVidaUtil("");
      setCatTasa("");
      setCategorias(await obtenerCategoriasActivo());
    } catch (error) {
      setAvisoCategoria({
        texto: mensajeError(error, "No se pudo crear la categoría."),
        tono: "error",
      });
    } finally {
      setGuardandoCategoria(false);
    }
  }

  async function manejarActivo(
    evento: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    evento.preventDefault();
    setAvisoActivo(null);
    if (
      !actCategoriaId ||
      !actCodigo ||
      !actNombre ||
      !actFechaCompra ||
      !actValorAdquisicion ||
      !actVidaUtil
    ) {
      setAvisoActivo({
        texto:
          "Completa categoría, código, nombre, fecha de compra, valor de adquisición y vida útil.",
        tono: "error",
      });
      return;
    }
    setGuardandoActivo(true);
    try {
      await crearActivo({
        sucursalId: SUCURSAL_PRINCIPAL,
        categoriaId: Number(actCategoriaId),
        codigo: actCodigo,
        nombre: actNombre,
        marca: actMarca || undefined,
        modelo: actModelo || undefined,
        numeroSerie: actSerie || undefined,
        departamento: actDepartamento || undefined,
        fechaCompra: new Date(actFechaCompra).toISOString(),
        valorAdquisicion: actValorAdquisicion,
        valorResidual: actValorResidual || undefined,
        vidaUtilMeses: Number(actVidaUtil),
      });
      setAvisoActivo({ texto: "Activo registrado.", tono: "exito" });
      setActCategoriaId("");
      setActCodigo("");
      setActNombre("");
      setActMarca("");
      setActModelo("");
      setActSerie("");
      setActDepartamento("");
      setActFechaCompra("");
      setActValorAdquisicion("");
      setActValorResidual("");
      setActVidaUtil("");
      setActivos(await obtenerActivos());
    } catch (error) {
      setAvisoActivo({
        texto: mensajeError(error, "No se pudo registrar el activo."),
        tono: "error",
      });
    } finally {
      setGuardandoActivo(false);
    }
  }

  async function manejarDepreciar(): Promise<void> {
    setAvisoDepreciacion(null);
    if (!PATRON_PERIODO.test(periodo)) {
      setAvisoDepreciacion({
        texto: "Ingresa un periodo válido en formato AAAA-MM (ej. 2026-06).",
        tono: "error",
      });
      return;
    }
    setDepreciando(true);
    try {
      const respuesta = await depreciar({ periodo });
      setAvisoDepreciacion({
        texto: `Depreciación ejecutada. Se procesaron ${respuesta.procesados} activo(s).`,
        tono: "exito",
      });
      setActivos(await obtenerActivos());
    } catch (error) {
      setAvisoDepreciacion({
        texto: mensajeError(error, "No se pudo ejecutar la depreciación."),
        tono: "error",
      });
    } finally {
      setDepreciando(false);
    }
  }

  const periodoInvalido = periodo !== "" && !PATRON_PERIODO.test(periodo);

  return (
    <div>
      <EncabezadoPagina
        titulo="Activos"
        descripcion="Activos fijos, sus categorías y la depreciación mensual lineal."
      />

      <div className="flex gap-1 border-b border-borde" role="tablist" aria-label="Secciones de activos">
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

      {avisoBase && (
        <div role="alert" className="mt-6 aviso aviso-peligro">
          <span>{avisoBase.texto}</span>
        </div>
      )}

      {pestania === "categorias" && (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Nueva categoría</span>
            </div>
            <div className="p-5">
              {avisoCategoria && <AvisoLinea aviso={avisoCategoria} />}
              <form
                onSubmit={manejarCategoria}
                className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
              >
                <div>
                  <label htmlFor="cat-nombre" className="etiqueta-campo">
                    Nombre
                  </label>
                  <input
                    id="cat-nombre"
                    value={catNombre}
                    onChange={(e) => setCatNombre(e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="cat-vida" className="etiqueta-campo">
                    Vida útil (meses)
                  </label>
                  <input
                    id="cat-vida"
                    value={catVidaUtil}
                    onChange={(e) => setCatVidaUtil(e.target.value)}
                    inputMode="numeric"
                    className="campo w-36 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="cat-tasa" className="etiqueta-campo">
                    Tasa anual (%)
                  </label>
                  <input
                    id="cat-tasa"
                    value={catTasa}
                    onChange={(e) => setCatTasa(e.target.value)}
                    inputMode="decimal"
                    className="campo w-36 font-mono"
                  />
                </div>
                <button
                  type="submit"
                  disabled={guardandoCategoria}
                  className="btn btn-primario"
                >
                  {guardandoCategoria ? "Guardando…" : "Crear categoría"}
                </button>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Categorías registradas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th className="num">Vida útil (meses)</th>
                    <th className="num">Tasa anual (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoBase ? (
                    <tr>
                      <td colSpan={3} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : categorias.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-texto-ter">
                        Sin categorías registradas.
                      </td>
                    </tr>
                  ) : (
                    categorias.map((cat) => (
                      <tr key={cat.id}>
                        <td>{cat.nombre}</td>
                        <td className="num">{cat.vidaUtilMeses}</td>
                        <td className="num">{cat.tasaAnual}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {pestania === "activos" && (
        <div className="mt-6 space-y-6">
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Nuevo activo</span>
            </div>
            <div className="p-5">
              {avisoActivo && <AvisoLinea aviso={avisoActivo} />}
              <form
                onSubmit={manejarActivo}
                className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                <div>
                  <label htmlFor="act-categoria" className="etiqueta-campo">
                    Categoría
                  </label>
                  <select
                    id="act-categoria"
                    value={actCategoriaId}
                    onChange={(e) => setActCategoriaId(e.target.value)}
                    disabled={cargandoBase}
                    className="campo"
                  >
                    <option value="">
                      {cargandoBase ? "Cargando…" : "Selecciona…"}
                    </option>
                    {categorias.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="act-codigo" className="etiqueta-campo">
                    Código
                  </label>
                  <input
                    id="act-codigo"
                    value={actCodigo}
                    onChange={(e) => setActCodigo(e.target.value)}
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="act-nombre" className="etiqueta-campo">
                    Nombre
                  </label>
                  <input
                    id="act-nombre"
                    value={actNombre}
                    onChange={(e) => setActNombre(e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="act-marca" className="etiqueta-campo">
                    Marca <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="act-marca"
                    value={actMarca}
                    onChange={(e) => setActMarca(e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="act-modelo" className="etiqueta-campo">
                    Modelo <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="act-modelo"
                    value={actModelo}
                    onChange={(e) => setActModelo(e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="act-serie" className="etiqueta-campo">
                    N.° de serie <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="act-serie"
                    value={actSerie}
                    onChange={(e) => setActSerie(e.target.value)}
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="act-departamento" className="etiqueta-campo">
                    Departamento <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="act-departamento"
                    value={actDepartamento}
                    onChange={(e) => setActDepartamento(e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="act-fecha" className="etiqueta-campo">
                    Fecha de compra
                  </label>
                  <input
                    id="act-fecha"
                    type="date"
                    value={actFechaCompra}
                    onChange={(e) => setActFechaCompra(e.target.value)}
                    className="campo"
                  />
                </div>
                <div>
                  <label htmlFor="act-valor" className="etiqueta-campo">
                    Valor de adquisición
                  </label>
                  <input
                    id="act-valor"
                    value={actValorAdquisicion}
                    onChange={(e) => setActValorAdquisicion(e.target.value)}
                    inputMode="decimal"
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="act-residual" className="etiqueta-campo">
                    Valor residual <span className="text-texto-ter">(opcional)</span>
                  </label>
                  <input
                    id="act-residual"
                    value={actValorResidual}
                    onChange={(e) => setActValorResidual(e.target.value)}
                    inputMode="decimal"
                    className="campo font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="act-vida" className="etiqueta-campo">
                    Vida útil (meses)
                  </label>
                  <input
                    id="act-vida"
                    value={actVidaUtil}
                    onChange={(e) => setActVidaUtil(e.target.value)}
                    inputMode="numeric"
                    className="campo font-mono"
                  />
                </div>
                <div className="flex items-end sm:col-span-2 lg:col-span-3">
                  <button
                    type="submit"
                    disabled={guardandoActivo}
                    className="btn btn-primario"
                  >
                    {guardandoActivo ? "Guardando…" : "Registrar activo"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Activos registrados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th>Marca</th>
                    <th>Estado</th>
                    <th className="num">Adquisición</th>
                    <th className="num">Deprec. acum.</th>
                    <th className="num">Valor actual</th>
                  </tr>
                </thead>
                <tbody>
                  {cargandoBase ? (
                    <tr>
                      <td colSpan={8} className="text-texto-ter">
                        Cargando…
                      </td>
                    </tr>
                  ) : activos.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-texto-ter">
                        Sin activos registrados.
                      </td>
                    </tr>
                  ) : (
                    activos.map((activo) => (
                      <tr key={activo.id}>
                        <td className="font-mono">{activo.codigo}</td>
                        <td className="text-tinta">{activo.nombre}</td>
                        <td>{activo.categoria}</td>
                        <td>{activo.marca ?? "—"}</td>
                        <td>
                          <span className="insignia insignia-neutra">{activo.estado}</span>
                        </td>
                        <td className="num">{formatearSoles(activo.valorAdquisicion)}</td>
                        <td className="num">
                          {formatearSoles(activo.depreciacionAcumulada)}
                        </td>
                        <td className="num font-semibold text-tinta">
                          {formatearSoles(activo.valorActual)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {pestania === "depreciacion" && (
        <section className="panel mt-6">
          <div className="panel-cabecera">
            <span className="panel-titulo">Depreciación del periodo</span>
          </div>
          <div className="p-5">
            <div className="aviso border-borde bg-panel-alt text-texto-sec" role="note">
              <div>
                <p className="font-semibold text-tinta">¿Qué hace la depreciación?</p>
                <p className="mt-1">
                  Genera la cuota mensual de depreciación lineal para cada activo del periodo y
                  actualiza su valor en libros. Solo se procesan los activos que aún no han sido
                  depreciados en ese periodo.
                </p>
              </div>
            </div>
            {avisoDepreciacion && <AvisoLinea aviso={avisoDepreciacion} />}
            <div className="mt-4 grid gap-3 sm:grid-cols-[auto_auto] sm:items-end">
              <div>
                <label htmlFor="periodo" className="etiqueta-campo">
                  Periodo (AAAA-MM)
                </label>
                <input
                  id="periodo"
                  value={periodo}
                  onChange={(e) => setPeriodo(e.target.value)}
                  placeholder="2026-06"
                  aria-invalid={periodoInvalido}
                  className="campo w-40 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={manejarDepreciar}
                disabled={depreciando}
                className="btn btn-primario"
              >
                {depreciando ? "Ejecutando…" : "Ejecutar depreciación del periodo"}
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
