"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { TablaResponsive } from "@/componentes/ficha-detalle";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  actualizarFormula,
  crearFormula,
  darDeBajaFormula,
  obtenerFormula,
  obtenerFormulas,
  reactivarFormula,
  type CrearFormulaInput,
  type Formula,
  type FormulaResumen,
  type Sku,
  type SkuRef,
} from "@/lib/api";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

interface LineaForm {
  /** Clave estable de React; no se envía al API. */
  clave: number;
  skuInsumo: SkuRef | null;
  cantidad: string;
}

interface FormFormula {
  nombre: string;
  skuTerminado: SkuRef | null;
  cantidadBase: string;
  observaciones: string;
  lineas: LineaForm[];
}

interface ErroresLinea {
  insumo?: string;
  cantidad?: string;
}

interface ErroresFormulario {
  nombre?: string;
  skuTerminado?: string;
  cantidadBase?: string;
  lineas?: string;
  porLinea: Record<number, ErroresLinea>;
}

interface Confirmacion {
  formula: FormulaResumen;
  accion: "baja" | "reactivar";
}

/** Fórmula en edición: id para el PATCH y código para los mensajes. */
interface FormulaEditada {
  id: string;
  codigo: string;
}

/** Decimal estrictamente mayor a cero (mismo criterio que el API). */
const REGEX_DECIMAL_POSITIVO = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

/** Tope del nombre de la fórmula (mismo que el API). */
const MAXIMO_NOMBRE = 120;

const SIN_ERRORES: ErroresFormulario = { porLinea: {} };

/** Generador de claves estables para las líneas del formulario (solo cliente). */
let contadorLineas = 0;

function nuevaLinea(skuInsumo: SkuRef | null = null, cantidad = ""): LineaForm {
  contadorLineas += 1;
  return { clave: contadorLineas, skuInsumo, cantidad };
}

function formularioVacio(): FormFormula {
  return {
    nombre: "",
    skuTerminado: null,
    cantidadBase: "",
    observaciones: "",
    lineas: [nuevaLinea()],
  };
}

function formularioDesde(formula: Formula): FormFormula {
  return {
    nombre: formula.nombre,
    skuTerminado: formula.skuTerminado,
    cantidadBase: formula.cantidadBase,
    observaciones: formula.observaciones ?? "",
    lineas: formula.lineas.map((l) => nuevaLinea(l.skuInsumo, l.cantidad)),
  };
}

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

/** Reduce un SKU del buscador a la referencia mínima que usa el formulario. */
function aSkuRef(sku: Sku): SkuRef {
  return {
    id: String(sku.id),
    codigoParlante: sku.codigoParlante,
    nombre: sku.nombre ?? sku.producto.nombre,
    unidad: sku.unidad.codigo,
  };
}

function etiquetaSku(sku: SkuRef): string {
  return `${sku.codigoParlante} — ${sku.nombre}`;
}

function hayErrores(errores: ErroresFormulario): boolean {
  return (
    errores.nombre !== undefined ||
    errores.skuTerminado !== undefined ||
    errores.cantidadBase !== undefined ||
    errores.lineas !== undefined ||
    Object.keys(errores.porLinea).length > 0
  );
}

/**
 * Valida el formulario y, si es correcto, devuelve el cuerpo listo para el API.
 * Las reglas replican las del backend para dar retroalimentación inmediata.
 */
function validarFormulario(form: FormFormula): {
  errores: ErroresFormulario;
  datos: CrearFormulaInput | null;
} {
  const errores: ErroresFormulario = { porLinea: {} };
  const nombre = form.nombre.trim();
  const cantidadBase = form.cantidadBase.trim();

  if (!nombre) errores.nombre = "Ingresa el nombre de la fórmula.";
  else if (nombre.length > MAXIMO_NOMBRE) {
    errores.nombre = `El nombre admite hasta ${MAXIMO_NOMBRE} caracteres.`;
  }
  if (!form.skuTerminado) errores.skuTerminado = "Selecciona el producto terminado.";
  if (!REGEX_DECIMAL_POSITIVO.test(cantidadBase)) {
    errores.cantidadBase = "Ingresa una cantidad mayor a cero (por ejemplo, 1 o 2.5).";
  }
  if (form.lineas.length === 0) errores.lineas = "Agrega al menos un insumo.";

  const insumosVistos = new Set<string>();
  const lineas: CrearFormulaInput["lineas"] = [];
  for (const linea of form.lineas) {
    const errLinea: ErroresLinea = {};
    if (!linea.skuInsumo) {
      errLinea.insumo = "Selecciona el insumo.";
    } else if (form.skuTerminado && linea.skuInsumo.id === form.skuTerminado.id) {
      errLinea.insumo = "El insumo no puede ser el mismo producto terminado.";
    } else if (insumosVistos.has(linea.skuInsumo.id)) {
      errLinea.insumo = "Este insumo ya está en otra línea.";
    }
    if (linea.skuInsumo) insumosVistos.add(linea.skuInsumo.id);
    if (!REGEX_DECIMAL_POSITIVO.test(linea.cantidad.trim())) {
      errLinea.cantidad = "Ingresa una cantidad mayor a cero.";
    }
    if (errLinea.insumo || errLinea.cantidad) {
      errores.porLinea[linea.clave] = errLinea;
    } else if (linea.skuInsumo) {
      lineas.push({ skuInsumoId: Number(linea.skuInsumo.id), cantidad: linea.cantidad.trim() });
    }
  }

  if (hayErrores(errores) || !form.skuTerminado) return { errores, datos: null };

  const observaciones = form.observaciones.trim();
  return {
    errores,
    datos: {
      nombre,
      skuTerminadoId: Number(form.skuTerminado.id),
      cantidadBase,
      ...(observaciones ? { observaciones } : {}),
      lineas,
    },
  };
}

function AvisoLinea({ aviso }: { aviso: Aviso }): React.JSX.Element {
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={`aviso ${aviso.tono === "error" ? "aviso-peligro" : "aviso-exito"}`}
    >
      <span>{aviso.texto}</span>
    </div>
  );
}

function MensajeCampo({ id, texto }: { id: string; texto?: string }): React.JSX.Element | null {
  if (!texto) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-peligro">
      {texto}
    </p>
  );
}

interface CampoSkuProps {
  id: string;
  etiqueta: string;
  /** Nombre accesible del botón "Cambiar" (p. ej. "Cambiar insumo de la línea 2"). */
  etiquetaCambiar: string;
  valor: SkuRef | null;
  onCambio: (sku: SkuRef | null) => void;
  error?: string;
  /** Enfoca el control al montarse (p. ej. en una línea recién agregada). */
  enfocarAlMontar?: boolean;
}

/**
 * Campo de SKU del formulario. Sin valor muestra el buscador server-side
 * (`SelectorSku`); con valor muestra la referencia elegida en un campo de solo
 * lectura y un botón "Cambiar". Así un SKU que llega del API como `SkuRef`
 * se representa sin reconstruir un `Sku` completo. Tras elegir o cambiar, el
 * foco pasa al control que se acaba de montar.
 */
function CampoSku({
  id,
  etiqueta,
  etiquetaCambiar,
  valor,
  onCambio,
  error,
  enfocarAlMontar = false,
}: CampoSkuProps): React.JSX.Element {
  // Solo se enfoca al montar si el usuario ya interactuó (no al abrir el panel).
  const [interactuado, setInteractuado] = useState<boolean>(enfocarAlMontar);
  const idError = `${id}-error`;

  if (!valor) {
    return (
      <div>
        {/* `SelectorSku` no expone `id`: la etiqueta envolvente lo asocia a su input. */}
        <label className="block">
          <span className="etiqueta-campo block">{etiqueta}</span>
          <SelectorSku
            valor={null}
            autoFocus={interactuado}
            onSeleccionar={(sku) => {
              if (!sku) return;
              setInteractuado(true);
              onCambio(aSkuRef(sku));
            }}
          />
        </label>
        <MensajeCampo id={idError} texto={error} />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="etiqueta-campo">
        {etiqueta}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          readOnly
          autoFocus={interactuado}
          value={`${etiquetaSku(valor)} (${valor.unidad})`}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? idError : undefined}
          className="campo min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={() => {
            setInteractuado(true);
            onCambio(null);
          }}
          aria-label={etiquetaCambiar}
          className="btn btn-contorno whitespace-nowrap"
        >
          Cambiar
        </button>
      </div>
      <MensajeCampo id={idError} texto={error} />
    </div>
  );
}

export default function PaginaFormulas(): React.JSX.Element {
  const [formulas, setFormulas] = useState<FormulaResumen[]>([]);
  const [incluirBajas, setIncluirBajas] = useState<boolean>(false);
  const [cargandoBase, setCargandoBase] = useState<boolean>(true);

  const [panelAbierto, setPanelAbierto] = useState<boolean>(false);
  // Cambia en cada apertura para montar el formulario con estado limpio.
  const [aperturaPanel, setAperturaPanel] = useState<number>(0);
  const [editando, setEditando] = useState<FormulaEditada | null>(null);
  const [cargandoDetalleId, setCargandoDetalleId] = useState<string | null>(null);
  const [form, setForm] = useState<FormFormula>(() => formularioVacio());
  const [intentoEnvio, setIntentoEnvio] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);

  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [procesando, setProcesando] = useState<boolean>(false);

  // Línea recién agregada por el usuario: su buscador recibe el foco al montarse.
  const [claveAEnfocar, setClaveAEnfocar] = useState<number | null>(null);
  const botonAgregar = useRef<HTMLButtonElement>(null);

  async function refrescar(verBajas: boolean): Promise<void> {
    try {
      setFormulas(await obtenerFormulas(verBajas ? {} : { activo: true }));
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudieron cargar las fórmulas."),
        tono: "error",
      });
    }
  }

  useEffect(() => {
    void (async (): Promise<void> => {
      await refrescar(incluirBajas);
      setCargandoBase(false);
    })();
    // Recarga cada vez que cambia el filtro de fórmulas dadas de baja.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incluirBajas]);

  function abrirPanel(estado: FormFormula, formula: FormulaEditada | null): void {
    setEditando(formula);
    setForm(estado);
    setIntentoEnvio(false);
    setAvisoForm(null);
    setAperturaPanel((n) => n + 1);
    setPanelAbierto(true);
  }

  function abrirNueva(): void {
    abrirPanel(formularioVacio(), null);
  }

  async function abrirEdicion(resumen: FormulaResumen): Promise<void> {
    setAvisoLista(null);
    setCargandoDetalleId(resumen.id);
    try {
      const formula = await obtenerFormula(resumen.id);
      abrirPanel(formularioDesde(formula), { id: formula.id, codigo: formula.codigo });
    } catch (error) {
      setAvisoLista({
        texto: mensajeError(error, "No se pudo cargar la fórmula."),
        tono: "error",
      });
    } finally {
      setCargandoDetalleId(null);
    }
  }

  function cerrarPanel(): void {
    if (guardando) return;
    setPanelAbierto(false);
    setEditando(null);
    setIntentoEnvio(false);
    setAvisoForm(null);
  }

  function actualizarCampo<K extends Exclude<keyof FormFormula, "lineas">>(
    campo: K,
    valor: FormFormula[K],
  ): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  function actualizarLinea(clave: number, cambios: Partial<Omit<LineaForm, "clave">>): void {
    setForm((previo) => ({
      ...previo,
      lineas: previo.lineas.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)),
    }));
  }

  function agregarLinea(): void {
    const linea = nuevaLinea();
    setClaveAEnfocar(linea.clave);
    setForm((previo) => ({ ...previo, lineas: [...previo.lineas, linea] }));
  }

  function quitarLinea(clave: number): void {
    setForm((previo) => ({
      ...previo,
      lineas: previo.lineas.filter((l) => l.clave !== clave),
    }));
    // El botón "Quitar" desaparece con la línea: el foco pasa a "Agregar insumo".
    botonAgregar.current?.focus();
  }

  async function guardarFormula(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    setIntentoEnvio(true);

    const { datos } = validarFormulario(form);
    if (!datos) {
      setAvisoForm({ texto: "Revisa los campos marcados.", tono: "error" });
      return;
    }

    setGuardando(true);
    try {
      if (editando) {
        // En edición se envía el formulario completo; observaciones vacías la limpian.
        await actualizarFormula(editando.id, {
          ...datos,
          observaciones: form.observaciones.trim(),
        });
        setAvisoLista({ texto: `Fórmula ${editando.codigo} actualizada.`, tono: "exito" });
      } else {
        const creada = await crearFormula(datos);
        setAvisoLista({ texto: `Fórmula ${creada.codigo} registrada.`, tono: "exito" });
      }
      setPanelAbierto(false);
      setEditando(null);
      setIntentoEnvio(false);
      await refrescar(incluirBajas);
    } catch (error) {
      setAvisoForm({
        texto: mensajeError(error, "No se pudo guardar la fórmula."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  async function confirmarAccion(): Promise<void> {
    if (!confirmacion) return;
    const { formula, accion } = confirmacion;
    setProcesando(true);
    try {
      if (accion === "baja") {
        await darDeBajaFormula(formula.id);
        if (editando?.id === formula.id) cerrarPanel();
        setAvisoLista({ texto: `Fórmula ${formula.codigo} dada de baja.`, tono: "exito" });
      } else {
        await reactivarFormula(formula.id);
        setAvisoLista({ texto: `Fórmula ${formula.codigo} reactivada.`, tono: "exito" });
      }
      setConfirmacion(null);
      await refrescar(incluirBajas);
    } catch (error) {
      setConfirmacion(null);
      setAvisoLista({
        texto: mensajeError(
          error,
          accion === "baja"
            ? "No se pudo dar de baja la fórmula."
            : "No se pudo reactivar la fórmula.",
        ),
        tono: "error",
      });
    } finally {
      setProcesando(false);
    }
  }

  // Tras el primer intento de envío, los errores se recalculan en vivo.
  const errores = intentoEnvio ? validarFormulario(form).errores : SIN_ERRORES;
  const unidadTerminado = form.skuTerminado?.unidad;

  return (
    <div>
      <EncabezadoPagina
        titulo="Fórmulas"
        descripcion="Administra las fórmulas de producción: los insumos y cantidades necesarios para obtener una cantidad base de un producto terminado."
      />

      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Fórmulas registradas
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({formulas.length})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-texto-sec">
              <input
                type="checkbox"
                checked={incluirBajas}
                onChange={(e) => setIncluirBajas(e.target.checked)}
              />
              Incluir dadas de baja
            </label>
            <button
              type="button"
              onClick={abrirNueva}
              className="btn btn-primario whitespace-nowrap"
            >
              Nueva fórmula
            </button>
          </div>
        </div>
        <TablaResponsive>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre</th>
                <th>Producto terminado</th>
                <th className="text-right">Cantidad base</th>
                <th className="text-right">Insumos</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoBase ? (
                <tr>
                  <td colSpan={7} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : formulas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-texto-ter">
                    Sin fórmulas registradas.
                  </td>
                </tr>
              ) : (
                formulas.map((formula) => (
                  <tr key={formula.id}>
                    <td className="num">{formula.codigo}</td>
                    <td className="text-tinta">{formula.nombre}</td>
                    <td>
                      <span className="font-mono text-xs text-texto-sec">
                        {formula.skuTerminado.codigoParlante}
                      </span>{" "}
                      <span className="text-tinta">{formula.skuTerminado.nombre}</span>
                    </td>
                    <td className="num text-right">
                      {formula.cantidadBase}{" "}
                      <span className="text-texto-ter">{formula.skuTerminado.unidad}</span>
                    </td>
                    <td className="num text-right">{formula.cantidadInsumos}</td>
                    <td>
                      <span
                        className={`insignia ${formula.activo ? "insignia-exito" : "insignia-neutra"}`}
                      >
                        {formula.activo ? "Activa" : "Dada de baja"}
                      </span>
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {formula.activo ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void abrirEdicion(formula)}
                              disabled={cargandoDetalleId !== null}
                              aria-label={`Editar fórmula ${formula.codigo}`}
                              className="btn btn-contorno h-8"
                            >
                              {cargandoDetalleId === formula.id ? "Cargando…" : "Editar"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmacion({ formula, accion: "baja" })}
                              aria-label={`Dar de baja fórmula ${formula.codigo}`}
                              className="btn btn-peligro h-8"
                            >
                              Dar de baja
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmacion({ formula, accion: "reactivar" })}
                            aria-label={`Reactivar fórmula ${formula.codigo}`}
                            className="btn btn-contorno h-8"
                          >
                            Reactivar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TablaResponsive>
      </section>

      <PanelLateral
        abierto={panelAbierto}
        titulo={editando ? `Editar fórmula ${editando.codigo}` : "Nueva fórmula"}
        descripcion={
          editando
            ? "Modifica los datos y los insumos de la fórmula."
            : "Registra una fórmula con su producto terminado y sus insumos."
        }
        onCerrar={cerrarPanel}
        ancho="detalle"
      >
        <form
          key={aperturaPanel}
          onSubmit={(e) => void guardarFormula(e)}
          noValidate
          className="space-y-4"
        >
          {avisoForm && <AvisoLinea aviso={avisoForm} />}

          <div>
            <label htmlFor="formula-nombre" className="etiqueta-campo">
              Nombre
            </label>
            <input
              id="formula-nombre"
              value={form.nombre}
              onChange={(e) => actualizarCampo("nombre", e.target.value)}
              maxLength={MAXIMO_NOMBRE}
              aria-required="true"
              aria-invalid={errores.nombre ? "true" : undefined}
              aria-describedby={errores.nombre ? "formula-nombre-error" : undefined}
              className="campo"
            />
            <MensajeCampo id="formula-nombre-error" texto={errores.nombre} />
          </div>

          <CampoSku
            id="formula-sku-terminado"
            etiqueta="Producto terminado"
            etiquetaCambiar="Cambiar producto terminado"
            valor={form.skuTerminado}
            onCambio={(sku) => actualizarCampo("skuTerminado", sku)}
            error={errores.skuTerminado}
          />

          <div>
            <label htmlFor="formula-cantidad-base" className="etiqueta-campo">
              Cantidad base
              {unidadTerminado && (
                <span className="text-texto-ter"> ({unidadTerminado})</span>
              )}
            </label>
            <input
              id="formula-cantidad-base"
              value={form.cantidadBase}
              onChange={(e) => actualizarCampo("cantidadBase", e.target.value)}
              inputMode="decimal"
              aria-required="true"
              aria-invalid={errores.cantidadBase ? "true" : undefined}
              aria-describedby={
                errores.cantidadBase
                  ? "formula-cantidad-base-ayuda formula-cantidad-base-error"
                  : "formula-cantidad-base-ayuda"
              }
              className="campo font-mono sm:max-w-[12rem]"
            />
            <p id="formula-cantidad-base-ayuda" className="mt-1.5 text-xs text-texto-ter">
              Cantidad de producto terminado que se obtiene con los insumos indicados.
            </p>
            <MensajeCampo id="formula-cantidad-base-error" texto={errores.cantidadBase} />
          </div>

          <div>
            <label htmlFor="formula-observaciones" className="etiqueta-campo">
              Observaciones <span className="text-texto-ter">(opcional)</span>
            </label>
            <textarea
              id="formula-observaciones"
              value={form.observaciones}
              onChange={(e) => actualizarCampo("observaciones", e.target.value)}
              rows={2}
              className="campo"
            />
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-texto">Insumos</legend>
            <p className="text-xs text-texto-ter">
              Cantidades por la cantidad base del producto terminado, en la unidad de
              control de cada insumo.
            </p>
            {errores.lineas && (
              <p role="alert" className="text-xs text-peligro">
                {errores.lineas}
              </p>
            )}

            <ol className="space-y-3">
              {form.lineas.map((linea, indice) => {
                const errLinea = errores.porLinea[linea.clave] ?? {};
                const numero = indice + 1;
                const idCantidad = `formula-linea-${linea.clave}-cantidad`;
                const idErrorCantidad = `${idCantidad}-error`;
                return (
                  <li
                    key={linea.clave}
                    aria-label={`Insumo ${numero}`}
                    className="grid gap-3 rounded-md border border-borde bg-panel-alt p-3 sm:grid-cols-[1fr_auto_auto]"
                  >
                    <CampoSku
                      id={`formula-linea-${linea.clave}-insumo`}
                      etiqueta={`Insumo ${numero}`}
                      etiquetaCambiar={`Cambiar insumo ${numero}`}
                      valor={linea.skuInsumo}
                      onCambio={(sku) => actualizarLinea(linea.clave, { skuInsumo: sku })}
                      error={errLinea.insumo}
                      enfocarAlMontar={linea.clave === claveAEnfocar}
                    />
                    <div>
                      <label htmlFor={idCantidad} className="etiqueta-campo">
                        Cantidad
                        {linea.skuInsumo && (
                          <span className="text-texto-ter"> ({linea.skuInsumo.unidad})</span>
                        )}
                      </label>
                      <input
                        id={idCantidad}
                        value={linea.cantidad}
                        onChange={(e) =>
                          actualizarLinea(linea.clave, { cantidad: e.target.value })
                        }
                        inputMode="decimal"
                        aria-required="true"
                        aria-invalid={errLinea.cantidad ? "true" : undefined}
                        aria-describedby={errLinea.cantidad ? idErrorCantidad : undefined}
                        className="campo w-32 font-mono"
                      />
                      <MensajeCampo id={idErrorCantidad} texto={errLinea.cantidad} />
                    </div>
                    <div className="flex items-start sm:pt-6">
                      <button
                        type="button"
                        onClick={() => quitarLinea(linea.clave)}
                        disabled={form.lineas.length === 1}
                        aria-label={`Quitar insumo ${numero}`}
                        className="btn btn-contorno"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            <button
              ref={botonAgregar}
              type="button"
              onClick={agregarLinea}
              className="btn btn-contorno"
            >
              Agregar insumo
            </button>
          </fieldset>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={cerrarPanel} className="btn btn-contorno">
              Cancelar
            </button>
          </div>
        </form>
      </PanelLateral>

      <ModalConfirmacion
        abierto={confirmacion !== null}
        titulo={confirmacion?.accion === "reactivar" ? "Reactivar fórmula" : "Dar de baja fórmula"}
        mensaje={
          confirmacion?.accion === "reactivar"
            ? `¿Reactivar la fórmula ${confirmacion.formula.codigo} (${confirmacion.formula.nombre})? Volverá a estar disponible para nuevas órdenes de producción.`
            : `¿Dar de baja la fórmula ${confirmacion?.formula.codigo ?? ""} (${confirmacion?.formula.nombre ?? ""})? No podrá usarse en nuevas órdenes de producción y podrás reactivarla luego.`
        }
        textoConfirmar={confirmacion?.accion === "reactivar" ? "Reactivar" : "Dar de baja"}
        tono={confirmacion?.accion === "reactivar" ? "primario" : "peligro"}
        procesando={procesando}
        onConfirmar={() => void confirmarAccion()}
        onCancelar={() => !procesando && setConfirmacion(null)}
      />
    </div>
  );
}
