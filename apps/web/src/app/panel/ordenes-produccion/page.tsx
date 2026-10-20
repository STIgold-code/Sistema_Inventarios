"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  BloqueMetricas,
  Ficha,
  FilaDato,
  ListaDatos,
  Metrica,
  TablaResponsive,
  mostrar,
} from "@/componentes/ficha-detalle";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import { PanelLateral } from "@/componentes/panel-lateral";
import { SelectorBusqueda } from "@/componentes/selector-busqueda";
import {
  ErrorApi,
  anularOrdenProduccion,
  cerrarOrdenProduccion,
  crearOrdenProduccion,
  generarValeOrdenProduccion,
  obtenerAlmacenes,
  obtenerCentrosCosto,
  obtenerFormulasDisponibles,
  obtenerOrdenProduccion,
  obtenerOrdenesProduccion,
  obtenerOrdenesTrabajo,
  type Almacen,
  type CentroCosto,
  type CerrarOrdenProduccionInput,
  type CrearOrdenProduccionInput,
  type EstadoOrdenProduccion,
  type EstadoValeSalida,
  type FormulaResumen,
  type OrdenProduccionDetalle,
  type OrdenProduccionResumen,
  type OrdenTrabajo,
  type SkuRef,
} from "@/lib/api";
import { formatearCantidad, formatearFecha, formatearSoles } from "@/lib/formato";
import { leerUsuario } from "@/lib/sesion";

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

type TipoAccion = "generarVale" | "cerrar" | "anular";

interface FormOrden {
  formulaId: string;
  cantidadPlanificada: string;
  almacenInsumosId: string;
  almacenDestinoId: string;
  centroCostoId: string;
  ordenTrabajoId: string;
  observaciones: string;
}

interface ErroresOrden {
  formulaId?: string;
  cantidadPlanificada?: string;
  almacenInsumosId?: string;
  almacenDestinoId?: string;
  centroCostoId?: string;
}

interface FormCierre {
  cantidadProducida: string;
  almacenDestinoId: string;
  observaciones: string;
}

/** Permiso que exige el API para cerrar una orden. */
const PERMISO_CERRAR = "produccion.cerrar";
/** Permiso adicional que exige el API para generar un vale desde la orden. */
const PERMISO_CREAR_VALE = "vale.crear";

/** Decimal estrictamente mayor a cero (mismo criterio que el API). */
const REGEX_DECIMAL_POSITIVO = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

const ESTADOS_ORDEN: readonly EstadoOrdenProduccion[] = [
  "PLANIFICADA",
  "EN_PROCESO",
  "CERRADA",
  "ANULADA",
];

const ETIQUETA_ESTADO: Record<EstadoOrdenProduccion, string> = {
  PLANIFICADA: "Planificada",
  EN_PROCESO: "En proceso",
  CERRADA: "Cerrada",
  ANULADA: "Anulada",
};

const INSIGNIA_ESTADO: Record<EstadoOrdenProduccion, string> = {
  PLANIFICADA: "insignia insignia-neutra",
  EN_PROCESO: "insignia insignia-info",
  CERRADA: "insignia insignia-exito",
  ANULADA: "insignia insignia-peligro",
};

const ETIQUETA_ESTADO_VALE: Record<EstadoValeSalida, string> = {
  BORRADOR: "Borrador",
  AUTORIZADO: "Autorizado",
  DESPACHADO: "Despachado",
  ANULADO: "Anulado",
};

const INSIGNIA_ESTADO_VALE: Record<EstadoValeSalida, string> = {
  BORRADOR: "insignia insignia-neutra",
  AUTORIZADO: "insignia insignia-info",
  DESPACHADO: "insignia insignia-exito",
  ANULADO: "insignia insignia-peligro",
};

const TITULO_ACCION: Record<TipoAccion, string> = {
  generarVale: "Generar vale de salida",
  cerrar: "Cerrar orden de producción",
  anular: "Anular orden de producción",
};

const TEXTO_CONFIRMAR: Record<TipoAccion, string> = {
  generarVale: "Generar vale",
  cerrar: "Cerrar orden",
  anular: "Anular",
};

const FORM_VACIO: FormOrden = {
  formulaId: "",
  cantidadPlanificada: "",
  almacenInsumosId: "",
  almacenDestinoId: "",
  centroCostoId: "",
  ordenTrabajoId: "",
  observaciones: "",
};

function mensajeError(error: unknown, porDefecto: string): string {
  return error instanceof ErrorApi ? error.message : porDefecto;
}

function etiquetaSku(sku: SkuRef): string {
  return `${sku.codigoParlante} — ${sku.nombre}`;
}

function cantidadConUnidad(cantidad: string, unidad: string): string {
  return `${formatearCantidad(cantidad)} ${unidad}`;
}

/**
 * Valida el formulario de alta y, si es correcto, devuelve el cuerpo listo
 * para el API. Las reglas replican las del backend para dar retroalimentación
 * inmediata.
 */
function validarOrden(form: FormOrden): {
  errores: ErroresOrden;
  datos: CrearOrdenProduccionInput | null;
} {
  const errores: ErroresOrden = {};
  const cantidad = form.cantidadPlanificada.trim();
  if (!form.formulaId) errores.formulaId = "Selecciona la fórmula.";
  if (!REGEX_DECIMAL_POSITIVO.test(cantidad)) {
    errores.cantidadPlanificada = "Ingresa una cantidad mayor a cero (por ejemplo, 10 o 2.5).";
  }
  if (!form.almacenInsumosId) errores.almacenInsumosId = "Selecciona el almacén de insumos.";
  if (!form.almacenDestinoId) errores.almacenDestinoId = "Selecciona el almacén destino.";
  if (!form.centroCostoId) errores.centroCostoId = "Selecciona el centro de costo.";

  if (Object.keys(errores).length > 0) return { errores, datos: null };

  const observaciones = form.observaciones.trim();
  return {
    errores,
    datos: {
      formulaId: Number(form.formulaId),
      cantidadPlanificada: cantidad,
      almacenInsumosId: Number(form.almacenInsumosId),
      almacenDestinoId: Number(form.almacenDestinoId),
      centroCostoId: Number(form.centroCostoId),
      ...(form.ordenTrabajoId ? { ordenTrabajoId: Number(form.ordenTrabajoId) } : {}),
      ...(observaciones ? { observaciones } : {}),
    },
  };
}

/**
 * La acción ya se aplicó en el API; si la recarga posterior del detalle falló,
 * el aviso de éxito lo advierte para que no se lean datos desactualizados.
 */
function conAvisoDeRecarga(
  texto: string,
  actualizada: OrdenProduccionDetalle | null,
): string {
  return actualizada === null
    ? `${texto} No se pudo actualizar el detalle de la orden; vuelve a cargarlo.`
    : texto;
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

function CeldaSku({ sku }: { sku: SkuRef }): React.JSX.Element {
  return (
    <>
      <span className="font-mono text-xs text-texto-sec">{sku.codigoParlante}</span>{" "}
      <span className="text-tinta">{sku.nombre}</span>
    </>
  );
}

/** Detalle de la orden: métricas, cabecera, consumo leído del ledger y vales. */
function DetalleOrden({
  orden,
  acciones,
}: {
  orden: OrdenProduccionDetalle;
  acciones: React.ReactNode;
}): React.JSX.Element {
  const unidad = orden.skuTerminado.unidad;
  const { lineas, fueraDeFormula, costoTotalConsumido } = orden.consumo;

  return (
    <div className="space-y-5">
      <BloqueMetricas>
        <Metrica
          etiqueta="Planificado"
          valor={cantidadConUnidad(orden.cantidadPlanificada, unidad)}
        />
        <Metrica
          etiqueta="Producido"
          valor={
            orden.cantidadProducida !== null
              ? cantidadConUnidad(orden.cantidadProducida, unidad)
              : "—"
          }
          acento={orden.cantidadProducida !== null}
        />
        <Metrica
          etiqueta="Costo de insumos"
          valor={
            orden.costoTotalInsumos !== null ? formatearSoles(orden.costoTotalInsumos) : "—"
          }
          pie={
            orden.costoTotalInsumos === null
              ? `Consumido a la fecha: ${formatearSoles(costoTotalConsumido)}`
              : undefined
          }
        />
        <Metrica
          etiqueta="Costo unitario"
          valor={
            orden.costoUnitarioTerminado !== null
              ? formatearSoles(orden.costoUnitarioTerminado)
              : "—"
          }
          pie={
            orden.costoUnitarioTerminado !== null
              ? `${orden.costoUnitarioTerminado} por ${unidad}`
              : undefined
          }
        />
      </BloqueMetricas>

      {acciones}

      <Ficha titulo="Datos de la orden">
        <ListaDatos>
          <FilaDato etiqueta="Estado">
            <span className={INSIGNIA_ESTADO[orden.estado]}>{ETIQUETA_ESTADO[orden.estado]}</span>
          </FilaDato>
          <FilaDato etiqueta="Fórmula">
            {orden.formula.codigo} – {orden.formula.nombre}
          </FilaDato>
          <FilaDato etiqueta="Producto terminado">
            {etiquetaSku(orden.skuTerminado)} ({unidad})
          </FilaDato>
          <FilaDato etiqueta="Almacén de insumos">{orden.almacenInsumos.nombre}</FilaDato>
          <FilaDato etiqueta="Almacén destino">{orden.almacenDestino.nombre}</FilaDato>
          <FilaDato etiqueta="Centro de costo">{orden.centroCosto.nombre}</FilaDato>
          <FilaDato etiqueta="Orden de trabajo" mono>
            {orden.ordenTrabajo ? orden.ordenTrabajo.numero : "—"}
          </FilaDato>
          <FilaDato etiqueta="Fecha de emisión" mono>
            {formatearFecha(orden.fechaEmision)}
          </FilaDato>
          <FilaDato etiqueta="Fecha de cierre" mono>
            {orden.fechaCierre ? formatearFecha(orden.fechaCierre) : "—"}
          </FilaDato>
          <FilaDato etiqueta="Observaciones">{mostrar(orden.observaciones)}</FilaDato>
        </ListaDatos>
      </Ficha>

      <Ficha titulo="Consumo de insumos">
        <TablaResponsive>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Insumo</th>
                <th className="text-right">Planificado</th>
                <th className="text-right">En curso</th>
                <th className="text-right">Consumido</th>
                <th className="text-right">Pendiente</th>
                <th className="text-right">Costo</th>
              </tr>
            </thead>
            <tbody>
              {lineas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-texto-ter">
                    Sin insumos.
                  </td>
                </tr>
              ) : (
                lineas.map((linea) => (
                  <tr key={linea.skuInsumo.id}>
                    <td>
                      <CeldaSku sku={linea.skuInsumo} />
                    </td>
                    <td className="num text-right">
                      {cantidadConUnidad(linea.cantidadPlanificada, linea.skuInsumo.unidad)}
                    </td>
                    <td className="num text-right">{formatearCantidad(linea.cantidadEnCurso)}</td>
                    <td className="num text-right">{formatearCantidad(linea.cantidadConsumida)}</td>
                    <td className="num text-right">{formatearCantidad(linea.cantidadPendiente)}</td>
                    <td className="num text-right">{formatearSoles(linea.costoConsumido)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </TablaResponsive>
        <p className="mt-3 text-sm text-texto-sec">
          Costo total consumido
          {fueraDeFormula.length > 0 ? " (incluye el consumo fuera de fórmula)" : ""}:{" "}
          <span className="font-mono font-semibold text-tinta">
            {formatearSoles(costoTotalConsumido)}
          </span>
        </p>
      </Ficha>

      {fueraDeFormula.length > 0 && (
        <Ficha titulo="Consumo fuera de fórmula">
          <TablaResponsive>
            <table className="tabla-datos">
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="text-right">Consumido</th>
                  <th className="text-right">Costo</th>
                </tr>
              </thead>
              <tbody>
                {fueraDeFormula.map((linea) => (
                  <tr key={linea.skuInsumo.id}>
                    <td>
                      <CeldaSku sku={linea.skuInsumo} />
                    </td>
                    <td className="num text-right">
                      {cantidadConUnidad(linea.cantidadConsumida, linea.skuInsumo.unidad)}
                    </td>
                    <td className="num text-right">{formatearSoles(linea.costoConsumido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaResponsive>
        </Ficha>
      )}

      <Ficha titulo="Vales vinculados">
        {orden.vales.length === 0 ? (
          <p className="text-sm text-texto-ter">Sin vales vinculados.</p>
        ) : (
          <ul className="space-y-2">
            {orden.vales.map((vale) => (
              <li key={vale.id} className="flex items-center justify-between gap-3">
                <span className="font-mono text-sm font-semibold text-tinta">{vale.numero}</span>
                <span className={INSIGNIA_ESTADO_VALE[vale.estado]}>
                  {ETIQUETA_ESTADO_VALE[vale.estado]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Ficha>
    </div>
  );
}

export default function PaginaOrdenesProduccion(): React.JSX.Element {
  const [ordenes, setOrdenes] = useState<OrdenProduccionResumen[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrdenProduccion | "">("");
  const [cargandoLista, setCargandoLista] = useState<boolean>(true);
  const [avisoLista, setAvisoLista] = useState<Aviso | null>(null);
  // Número de la última carga de la lista pedida.
  const solicitudListaRef = useRef<number>(0);

  // Catálogos del formulario de alta.
  const [formulas, setFormulas] = useState<FormulaResumen[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [centrosCosto, setCentrosCosto] = useState<CentroCosto[]>([]);
  const [ordenesTrabajo, setOrdenesTrabajo] = useState<OrdenTrabajo[]>([]);
  const [cargandoCatalogos, setCargandoCatalogos] = useState<boolean>(true);
  // Aviso propio de los catálogos: una carga exitosa de la lista no lo borra.
  const [avisoCatalogos, setAvisoCatalogos] = useState<Aviso | null>(null);

  // Permisos que ocultan acciones (el API los vuelve a validar).
  const [puedeCerrar, setPuedeCerrar] = useState<boolean>(false);
  const [puedeGenerarVale, setPuedeGenerarVale] = useState<boolean>(false);

  // Alta.
  const [altaAbierta, setAltaAbierta] = useState<boolean>(false);
  // Cambia en cada apertura para montar el formulario con estado limpio.
  const [aperturaAlta, setAperturaAlta] = useState<number>(0);
  const [form, setForm] = useState<FormOrden>(FORM_VACIO);
  const [intentoEnvio, setIntentoEnvio] = useState<boolean>(false);
  const [guardando, setGuardando] = useState<boolean>(false);
  const [avisoForm, setAvisoForm] = useState<Aviso | null>(null);

  // Detalle.
  const [detalleAbierto, setDetalleAbierto] = useState<boolean>(false);
  const [detalle, setDetalle] = useState<OrdenProduccionDetalle | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<boolean>(false);
  const [avisoDetalle, setAvisoDetalle] = useState<Aviso | null>(null);
  // Orden mostrada: descarta respuestas de una orden que ya no está abierta.
  const detalleIdRef = useRef<string | null>(null);

  // Acciones sobre la orden abierta.
  const [accion, setAccion] = useState<TipoAccion | null>(null);
  const [procesando, setProcesando] = useState<boolean>(false);
  const [formCierre, setFormCierre] = useState<FormCierre>({
    cantidadProducida: "",
    almacenDestinoId: "",
    observaciones: "",
  });
  const [intentoCierre, setIntentoCierre] = useState<boolean>(false);
  const campoCantidadCierre = useRef<HTMLInputElement>(null);

  async function refrescarLista(estado: EstadoOrdenProduccion | ""): Promise<void> {
    // Solo la carga más reciente escribe: descarta respuestas fuera de orden.
    const solicitud = ++solicitudListaRef.current;
    try {
      const datos = await obtenerOrdenesProduccion(estado ? { estado } : {});
      if (solicitud !== solicitudListaRef.current) return;
      setOrdenes(datos);
      setAvisoLista(null);
    } catch (error) {
      if (solicitud !== solicitudListaRef.current) return;
      setAvisoLista({
        texto: mensajeError(error, "No se pudieron cargar las órdenes de producción."),
        tono: "error",
      });
    }
  }

  useEffect(() => {
    let ignorar = false;
    setCargandoLista(true);
    void refrescarLista(filtroEstado).then(() => {
      if (!ignorar) setCargandoLista(false);
    });
    return () => {
      ignorar = true;
    };
    // Recarga cada vez que cambia el filtro de estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  useEffect(() => {
    const usuario = leerUsuario();
    setPuedeCerrar(usuario?.permisos.includes(PERMISO_CERRAR) ?? false);
    setPuedeGenerarVale(usuario?.permisos.includes(PERMISO_CREAR_VALE) ?? false);

    void (async (): Promise<void> => {
      // Cada catálogo se carga por separado: la falta de uno (p. ej. sin acceso
      // a órdenes de trabajo) no debe impedir registrar la orden.
      const [frm, alm, cc, ot] = await Promise.allSettled([
        obtenerFormulasDisponibles(),
        obtenerAlmacenes(),
        obtenerCentrosCosto(),
        obtenerOrdenesTrabajo(),
      ]);
      if (frm.status === "fulfilled") setFormulas(frm.value);
      if (alm.status === "fulfilled") setAlmacenes(alm.value);
      if (cc.status === "fulfilled") setCentrosCosto(cc.value.filter((c) => c.activo));
      if (ot.status === "fulfilled") {
        setOrdenesTrabajo(ot.value.filter((o) => o.estado === "ABIERTA"));
      }
      if (frm.status === "rejected" || alm.status === "rejected" || cc.status === "rejected") {
        setAvisoCatalogos({
          texto: "No se pudieron cargar los datos para registrar órdenes de producción.",
          tono: "error",
        });
      }
      setCargandoCatalogos(false);
    })();
  }, []);

  // Al abrir el cierre, el foco va a la cantidad producida (el modal enfoca
  // primero su botón de confirmar; este efecto del padre corre después).
  useEffect(() => {
    if (accion === "cerrar") campoCantidadCierre.current?.focus();
  }, [accion]);

  // ── Alta ──────────────────────────────────────────────────────────────────

  function abrirAlta(): void {
    setForm(FORM_VACIO);
    setIntentoEnvio(false);
    setAvisoForm(null);
    setAperturaAlta((n) => n + 1);
    setAltaAbierta(true);
  }

  function cerrarAlta(): void {
    if (guardando) return;
    setAltaAbierta(false);
    setIntentoEnvio(false);
    setAvisoForm(null);
  }

  function actualizarCampo<K extends keyof FormOrden>(campo: K, valor: FormOrden[K]): void {
    setForm((previo) => ({ ...previo, [campo]: valor }));
  }

  async function guardarOrden(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setAvisoForm(null);
    setIntentoEnvio(true);

    const { datos } = validarOrden(form);
    if (!datos) {
      setAvisoForm({ texto: "Revisa los campos marcados.", tono: "error" });
      return;
    }

    setGuardando(true);
    try {
      const creada = await crearOrdenProduccion(datos);
      setAltaAbierta(false);
      setIntentoEnvio(false);
      await refrescarLista(filtroEstado);
      abrirDetalle(creada.id, {
        texto: `Orden de producción ${creada.numero} registrada.`,
        tono: "exito",
      });
    } catch (error) {
      setAvisoForm({
        texto: mensajeError(error, "No se pudo registrar la orden de producción."),
        tono: "error",
      });
    } finally {
      setGuardando(false);
    }
  }

  // ── Detalle ───────────────────────────────────────────────────────────────

  async function cargarDetalle(id: string): Promise<OrdenProduccionDetalle | null> {
    setCargandoDetalle(true);
    try {
      const orden = await obtenerOrdenProduccion(id);
      if (detalleIdRef.current !== id) return null;
      setDetalle(orden);
      return orden;
    } catch (error) {
      if (detalleIdRef.current === id) {
        setAvisoDetalle({
          texto: mensajeError(error, "No se pudo cargar la orden de producción."),
          tono: "error",
        });
      }
      return null;
    } finally {
      if (detalleIdRef.current === id) setCargandoDetalle(false);
    }
  }

  function abrirDetalle(id: string, aviso: Aviso | null = null): void {
    detalleIdRef.current = id;
    setDetalle(null);
    setAvisoDetalle(aviso);
    setDetalleAbierto(true);
    void cargarDetalle(id);
  }

  function cerrarDetalle(): void {
    // Con un modal de acción abierto, Escape lo cierra a él y no al panel.
    if (accion !== null || procesando) return;
    detalleIdRef.current = null;
    setDetalleAbierto(false);
    setDetalle(null);
    setAvisoDetalle(null);
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  function iniciarAccion(tipo: TipoAccion): void {
    if (!detalle) return;
    if (tipo === "cerrar") {
      setFormCierre({
        cantidadProducida: "",
        almacenDestinoId: detalle.almacenDestino.id,
        observaciones: "",
      });
      setIntentoCierre(false);
    }
    setAvisoDetalle(null);
    setAccion(tipo);
  }

  function cancelarAccion(): void {
    if (procesando) return;
    setAccion(null);
  }

  const errorCantidadCierre = REGEX_DECIMAL_POSITIVO.test(formCierre.cantidadProducida.trim())
    ? undefined
    : "Ingresa una cantidad mayor a cero.";
  const errorAlmacenCierre = formCierre.almacenDestinoId
    ? undefined
    : "Selecciona el almacén destino.";

  async function ejecutarGenerarVale(orden: OrdenProduccionDetalle): Promise<Aviso> {
    const { valeId } = await generarValeOrdenProduccion(orden.id);
    const actualizada = await cargarDetalle(orden.id);
    const numero = actualizada?.vales.find((v) => v.id === valeId)?.numero;
    return {
      texto: conAvisoDeRecarga(
        `Se generó el vale de salida ${numero ?? `#${valeId}`} en borrador con los insumos pendientes.`,
        actualizada,
      ),
      tono: "exito",
    };
  }

  async function ejecutarCierre(orden: OrdenProduccionDetalle): Promise<Aviso> {
    const observaciones = formCierre.observaciones.trim();
    const datos: CerrarOrdenProduccionInput = {
      cantidadProducida: formCierre.cantidadProducida.trim(),
      ...(formCierre.almacenDestinoId !== orden.almacenDestino.id
        ? { almacenDestinoId: Number(formCierre.almacenDestinoId) }
        : {}),
      ...(observaciones ? { observaciones } : {}),
    };
    const resultado = await cerrarOrdenProduccion(orden.id, datos);
    const actualizada = await cargarDetalle(orden.id);
    // Mismo criterio que la métrica: soles redondeados y el valor exacto con la unidad.
    return {
      texto: conAvisoDeRecarga(
        `Orden ${orden.numero} cerrada. Costo de insumos: ${formatearSoles(
          resultado.costoTotalInsumos,
        )}. Costo unitario del terminado: ${formatearSoles(
          resultado.costoUnitarioTerminado,
        )} (${resultado.costoUnitarioTerminado} por ${orden.skuTerminado.unidad}).`,
        actualizada,
      ),
      tono: "exito",
    };
  }

  async function ejecutarAnulacion(orden: OrdenProduccionDetalle): Promise<Aviso> {
    await anularOrdenProduccion(orden.id);
    const actualizada = await cargarDetalle(orden.id);
    return { texto: conAvisoDeRecarga(`Orden ${orden.numero} anulada.`, actualizada), tono: "exito" };
  }

  async function confirmarAccion(): Promise<void> {
    if (!detalle || !accion) return;
    if (accion === "cerrar") {
      setIntentoCierre(true);
      if (errorCantidadCierre || errorAlmacenCierre) {
        campoCantidadCierre.current?.focus();
        return;
      }
    }
    const orden = detalle;
    const tipo = accion;
    setProcesando(true);
    try {
      const aviso =
        tipo === "generarVale"
          ? await ejecutarGenerarVale(orden)
          : tipo === "cerrar"
            ? await ejecutarCierre(orden)
            : await ejecutarAnulacion(orden);
      setAvisoDetalle(aviso);
      await refrescarLista(filtroEstado);
    } catch (error) {
      setAvisoDetalle({
        texto: mensajeError(
          error,
          tipo === "generarVale"
            ? "No se pudo generar el vale de salida."
            : tipo === "cerrar"
              ? "No se pudo cerrar la orden de producción."
              : "No se pudo anular la orden de producción.",
        ),
        tono: "error",
      });
    } finally {
      setAccion(null);
      setProcesando(false);
    }
  }

  function mensajeAccion(orden: OrdenProduccionDetalle, tipo: TipoAccion): string {
    switch (tipo) {
      case "generarVale":
        return `¿Generar un vale de salida para la orden ${orden.numero}? Se creará en borrador desde el almacén ${orden.almacenInsumos.nombre} con las cantidades pendientes de cada insumo.`;
      case "anular":
        return `¿Anular la orden ${orden.numero}? Esta acción no se puede revertir.`;
      case "cerrar": {
        const cantidad = formCierre.cantidadProducida.trim();
        const almacen =
          almacenes.find((a) => a.id === formCierre.almacenDestinoId)?.nombre ??
          orden.almacenDestino.nombre;
        const unidades = REGEX_DECIMAL_POSITIVO.test(cantidad)
          ? cantidadConUnidad(cantidad, orden.skuTerminado.unidad)
          : "las unidades producidas";
        return `Se ingresarán ${unidades} de ${etiquetaSku(orden.skuTerminado)} al almacén ${almacen} con el costo acumulado de insumos (${formatearSoles(orden.consumo.costoTotalConsumido)}). Esta acción no se puede revertir.`;
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Tras el primer intento de envío, los errores se recalculan en vivo.
  const errores: ErroresOrden = intentoEnvio ? validarOrden(form).errores : {};
  const formulaElegida = formulas.find((f) => f.id === form.formulaId) ?? null;
  const opcionesAlmacen = almacenes.map((a) => ({
    valor: a.id,
    etiqueta: `${a.codigo} — ${a.nombre}`,
  }));

  const hayPendientes =
    detalle?.consumo.lineas.some((l) => Number(l.cantidadPendiente) > 0) ?? false;
  const admiteVale =
    detalle !== null && (detalle.estado === "PLANIFICADA" || detalle.estado === "EN_PROCESO");
  // Mismas reglas que el API: el cierre exige que ningún vale siga en curso
  // (borrador o autorizado) y la anulación, que no haya vales sin anular.
  const hayValesEnCurso =
    detalle?.vales.some((v) => v.estado === "BORRADOR" || v.estado === "AUTORIZADO") ?? false;
  const hayValesVinculados = detalle?.vales.some((v) => v.estado !== "ANULADO") ?? false;
  const cierreBloqueado = detalle?.estado === "EN_PROCESO" && puedeCerrar && hayValesEnCurso;
  const anulacionBloqueada = detalle?.estado === "PLANIFICADA" && hayValesVinculados;

  const accionesDetalle = detalle && (
    <div className="flex flex-wrap items-center gap-2">
      {admiteVale && puedeGenerarVale && (
        <button
          type="button"
          onClick={() => iniciarAccion("generarVale")}
          disabled={!hayPendientes || cargandoDetalle}
          aria-describedby={!hayPendientes ? "op-sin-pendientes" : undefined}
          className="btn btn-primario"
        >
          Generar vale
        </button>
      )}
      {detalle.estado === "EN_PROCESO" && puedeCerrar && (
        <button
          type="button"
          onClick={() => iniciarAccion("cerrar")}
          disabled={hayValesEnCurso || cargandoDetalle}
          aria-describedby={hayValesEnCurso ? "op-cierre-bloqueado" : undefined}
          className="btn btn-primario"
        >
          Cerrar orden
        </button>
      )}
      {detalle.estado === "PLANIFICADA" && (
        <button
          type="button"
          onClick={() => iniciarAccion("anular")}
          disabled={hayValesVinculados || cargandoDetalle}
          aria-describedby={hayValesVinculados ? "op-anular-bloqueado" : undefined}
          className="btn btn-peligro"
        >
          Anular
        </button>
      )}
      <button
        type="button"
        onClick={() => void cargarDetalle(detalle.id)}
        disabled={cargandoDetalle}
        className="btn btn-contorno"
      >
        {cargandoDetalle ? "Cargando…" : "Volver a cargar"}
      </button>
      {admiteVale && puedeGenerarVale && !hayPendientes && (
        <p id="op-sin-pendientes" className="w-full text-xs text-texto-ter">
          No hay insumos pendientes de entregar.
        </p>
      )}
      {cierreBloqueado && (
        <p id="op-cierre-bloqueado" className="w-full text-xs text-texto-ter">
          Hay vales pendientes de despachar o anular.
        </p>
      )}
      {anulacionBloqueada && (
        <p id="op-anular-bloqueado" className="w-full text-xs text-texto-ter">
          La orden tiene vales vinculados: anúlalos antes de anular la orden.
        </p>
      )}
    </div>
  );

  return (
    <div>
      <EncabezadoPagina
        titulo="Órdenes de producción"
        descripcion="Planifica la producción a partir de una fórmula, entrega los insumos con vales de salida y cierra la orden para ingresar el producto terminado con su costo."
      />

      {avisoCatalogos && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoCatalogos} />
        </div>
      )}
      {avisoLista && (
        <div className="mt-4">
          <AvisoLinea aviso={avisoLista} />
        </div>
      )}

      <section className="panel mt-6">
        <div className="panel-cabecera flex-wrap gap-3">
          <span className="panel-titulo">
            Órdenes registradas
            <span className="ml-2 font-mono text-sm font-normal text-texto-ter">
              ({ordenes.length})
            </span>
          </span>
          <div className="flex items-center gap-2">
            <label htmlFor="op-filtro-estado" className="text-sm text-texto-sec">
              Estado
            </label>
            <select
              id="op-filtro-estado"
              value={filtroEstado}
              onChange={(e) => {
                const valor = e.target.value;
                setFiltroEstado(
                  ESTADOS_ORDEN.find((estado) => estado === valor) ?? "",
                );
              }}
              className="campo h-9 w-auto"
            >
              <option value="">Todos</option>
              {ESTADOS_ORDEN.map((estado) => (
                <option key={estado} value={estado}>
                  {ETIQUETA_ESTADO[estado]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={abrirAlta}
              className="btn btn-primario whitespace-nowrap"
            >
              Nueva orden
            </button>
          </div>
        </div>
        <TablaResponsive>
          <table className="tabla-datos">
            <thead>
              <tr>
                <th>Número</th>
                <th>Fórmula</th>
                <th>SKU terminado</th>
                <th className="text-right">Planificado</th>
                <th className="text-right">Producido</th>
                <th>Estado</th>
                <th>Fecha</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cargandoLista ? (
                <tr>
                  <td colSpan={8} className="text-texto-ter">
                    Cargando…
                  </td>
                </tr>
              ) : ordenes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-texto-ter">
                    Sin órdenes de producción registradas.
                  </td>
                </tr>
              ) : (
                ordenes.map((orden) => (
                  <tr
                    key={orden.id}
                    onClick={() => abrirDetalle(orden.id)}
                    className="cursor-pointer"
                  >
                    <td className="font-mono font-semibold text-tinta">{orden.numero}</td>
                    <td>
                      <span className="font-mono text-xs text-texto-sec">
                        {orden.formula.codigo}
                      </span>{" "}
                      <span className="text-tinta">{orden.formula.nombre}</span>
                    </td>
                    <td>
                      <CeldaSku sku={orden.skuTerminado} />
                    </td>
                    <td className="num text-right">
                      {cantidadConUnidad(orden.cantidadPlanificada, orden.skuTerminado.unidad)}
                    </td>
                    <td className="num text-right">
                      {orden.cantidadProducida !== null
                        ? cantidadConUnidad(orden.cantidadProducida, orden.skuTerminado.unidad)
                        : "—"}
                    </td>
                    <td>
                      <span className={INSIGNIA_ESTADO[orden.estado]}>
                        {ETIQUETA_ESTADO[orden.estado]}
                      </span>
                    </td>
                    <td className="text-texto-sec">{formatearFecha(orden.fechaEmision)}</td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            // La fila también abre el detalle: evita la doble apertura.
                            e.stopPropagation();
                            abrirDetalle(orden.id);
                          }}
                          aria-label={`Ver orden de producción ${orden.numero}`}
                          className="btn btn-contorno h-8"
                        >
                          Ver
                        </button>
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
        abierto={altaAbierta}
        titulo="Nueva orden de producción"
        descripcion="Planifica la producción a partir de una fórmula activa."
        onCerrar={cerrarAlta}
      >
        <form
          key={aperturaAlta}
          onSubmit={(e) => void guardarOrden(e)}
          noValidate
          className="space-y-4"
        >
          {avisoForm && <AvisoLinea aviso={avisoForm} />}

          <div>
            <label htmlFor="op-formula" className="etiqueta-campo">
              Fórmula
            </label>
            <select
              id="op-formula"
              value={form.formulaId}
              onChange={(e) => actualizarCampo("formulaId", e.target.value)}
              disabled={cargandoCatalogos}
              aria-required="true"
              aria-invalid={errores.formulaId ? "true" : undefined}
              aria-describedby={
                [formulaElegida ? "op-formula-info" : "", errores.formulaId ? "op-formula-error" : ""]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              className="campo"
            >
              <option value="">{cargandoCatalogos ? "Cargando…" : "Selecciona…"}</option>
              {formulas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.codigo} – {f.nombre}
                </option>
              ))}
            </select>
            {formulaElegida && (
              <p id="op-formula-info" className="mt-1.5 text-xs text-texto-sec">
                Producto terminado: {etiquetaSku(formulaElegida.skuTerminado)} · Cantidad base:{" "}
                <span className="font-mono">
                  {cantidadConUnidad(
                    formulaElegida.cantidadBase,
                    formulaElegida.skuTerminado.unidad,
                  )}
                </span>
              </p>
            )}
            {!cargandoCatalogos && formulas.length === 0 && (
              <p className="mt-1.5 text-xs text-texto-ter">
                No hay fórmulas activas. Registra una en Fórmulas.
              </p>
            )}
            <MensajeCampo id="op-formula-error" texto={errores.formulaId} />
          </div>

          <div>
            <label htmlFor="op-cantidad" className="etiqueta-campo">
              Cantidad a producir
              {formulaElegida && (
                <span className="text-texto-ter"> ({formulaElegida.skuTerminado.unidad})</span>
              )}
            </label>
            <input
              id="op-cantidad"
              value={form.cantidadPlanificada}
              onChange={(e) => actualizarCampo("cantidadPlanificada", e.target.value)}
              inputMode="decimal"
              aria-required="true"
              aria-invalid={errores.cantidadPlanificada ? "true" : undefined}
              aria-describedby={errores.cantidadPlanificada ? "op-cantidad-error" : undefined}
              className="campo font-mono sm:max-w-[12rem]"
            />
            <MensajeCampo id="op-cantidad-error" texto={errores.cantidadPlanificada} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="op-almacen-insumos" className="etiqueta-campo">
                Almacén de insumos
              </label>
              <SelectorBusqueda
                id="op-almacen-insumos"
                valor={form.almacenInsumosId}
                onCambio={(v) => actualizarCampo("almacenInsumosId", v)}
                describedBy={errores.almacenInsumosId ? "op-almacen-insumos-error" : undefined}
                invalido={Boolean(errores.almacenInsumosId)}
                disabled={cargandoCatalogos}
                requerido
                placeholder={cargandoCatalogos ? "Cargando…" : "Selecciona…"}
                opciones={opcionesAlmacen}
              />
              <MensajeCampo id="op-almacen-insumos-error" texto={errores.almacenInsumosId} />
            </div>
            <div>
              <label htmlFor="op-almacen-destino" className="etiqueta-campo">
                Almacén destino
              </label>
              <SelectorBusqueda
                id="op-almacen-destino"
                valor={form.almacenDestinoId}
                onCambio={(v) => actualizarCampo("almacenDestinoId", v)}
                describedBy={errores.almacenDestinoId ? "op-almacen-destino-error" : undefined}
                invalido={Boolean(errores.almacenDestinoId)}
                disabled={cargandoCatalogos}
                requerido
                placeholder={cargandoCatalogos ? "Cargando…" : "Selecciona…"}
                opciones={opcionesAlmacen}
              />
              <MensajeCampo id="op-almacen-destino-error" texto={errores.almacenDestinoId} />
            </div>
          </div>

          <div>
            <label htmlFor="op-centro-costo" className="etiqueta-campo">
              Centro de costo
            </label>
            <SelectorBusqueda
              id="op-centro-costo"
              valor={form.centroCostoId}
              onCambio={(v) => actualizarCampo("centroCostoId", v)}
              describedBy={errores.centroCostoId ? "op-centro-costo-error" : undefined}
              invalido={Boolean(errores.centroCostoId)}
              disabled={cargandoCatalogos}
              requerido
              placeholder={cargandoCatalogos ? "Cargando…" : "Selecciona…"}
              opciones={centrosCosto.map((c) => ({
                valor: String(c.id),
                etiqueta: `${c.codigo} — ${c.nombre}`,
              }))}
            />
            <MensajeCampo id="op-centro-costo-error" texto={errores.centroCostoId} />
          </div>

          <div>
            <label htmlFor="op-orden-trabajo" className="etiqueta-campo">
              Orden de trabajo <span className="text-texto-ter">(opcional)</span>
            </label>
            <SelectorBusqueda
              id="op-orden-trabajo"
              valor={form.ordenTrabajoId}
              onCambio={(v) => actualizarCampo("ordenTrabajoId", v)}
              disabled={cargandoCatalogos}
              placeholder={cargandoCatalogos ? "Cargando…" : "Sin orden de trabajo"}
              opciones={ordenesTrabajo.map((o) => ({
                valor: String(o.id),
                etiqueta: `${o.numero} — ${o.descripcion}`,
              }))}
            />
          </div>

          <div>
            <label htmlFor="op-observaciones" className="etiqueta-campo">
              Observaciones <span className="text-texto-ter">(opcional)</span>
            </label>
            <textarea
              id="op-observaciones"
              value={form.observaciones}
              onChange={(e) => actualizarCampo("observaciones", e.target.value)}
              rows={2}
              className="campo"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={guardando} className="btn btn-primario">
              {guardando ? "Guardando…" : "Registrar orden"}
            </button>
            <button type="button" onClick={cerrarAlta} className="btn btn-contorno">
              Cancelar
            </button>
          </div>
        </form>
      </PanelLateral>

      <PanelLateral
        abierto={detalleAbierto}
        titulo={detalle ? `Orden de producción ${detalle.numero}` : "Orden de producción"}
        descripcion={detalle ? `${detalle.formula.codigo} – ${detalle.formula.nombre}` : undefined}
        onCerrar={cerrarDetalle}
        ancho="detalle"
      >
        <div className="space-y-4">
          {avisoDetalle && <AvisoLinea aviso={avisoDetalle} />}
          {detalle ? (
            <DetalleOrden orden={detalle} acciones={accionesDetalle} />
          ) : cargandoDetalle ? (
            <p className="text-sm text-texto-ter">Cargando…</p>
          ) : (
            avisoDetalle?.tono === "error" && (
              <button
                type="button"
                onClick={() => {
                  const id = detalleIdRef.current;
                  if (id === null) return;
                  setAvisoDetalle(null);
                  void cargarDetalle(id);
                }}
                className="btn btn-contorno"
              >
                Volver a cargar
              </button>
            )
          )}
        </div>
      </PanelLateral>

      <ModalConfirmacion
        abierto={accion !== null && detalle !== null}
        titulo={accion ? TITULO_ACCION[accion] : ""}
        mensaje={accion && detalle ? mensajeAccion(detalle, accion) : ""}
        textoConfirmar={accion ? TEXTO_CONFIRMAR[accion] : "Confirmar"}
        tono={accion === "anular" ? "peligro" : "primario"}
        procesando={procesando}
        onConfirmar={() => void confirmarAccion()}
        onCancelar={cancelarAccion}
      >
        {accion === "cerrar" && detalle && (
          <div className="space-y-4">
            <div>
              <label htmlFor="op-cierre-cantidad" className="etiqueta-campo">
                Cantidad producida{" "}
                <span className="text-texto-ter">({detalle.skuTerminado.unidad})</span>
              </label>
              <input
                ref={campoCantidadCierre}
                id="op-cierre-cantidad"
                value={formCierre.cantidadProducida}
                onChange={(e) =>
                  setFormCierre((previo) => ({ ...previo, cantidadProducida: e.target.value }))
                }
                inputMode="decimal"
                disabled={procesando}
                aria-required="true"
                aria-invalid={intentoCierre && errorCantidadCierre ? "true" : undefined}
                aria-describedby={
                  intentoCierre && errorCantidadCierre ? "op-cierre-cantidad-error" : undefined
                }
                className="campo font-mono sm:max-w-[12rem]"
              />
              <MensajeCampo
                id="op-cierre-cantidad-error"
                texto={intentoCierre ? errorCantidadCierre : undefined}
              />
            </div>
            <div>
              <label htmlFor="op-cierre-almacen" className="etiqueta-campo">
                Almacén destino
              </label>
              <select
                id="op-cierre-almacen"
                value={formCierre.almacenDestinoId}
                onChange={(e) =>
                  setFormCierre((previo) => ({ ...previo, almacenDestinoId: e.target.value }))
                }
                disabled={procesando}
                aria-required="true"
                aria-invalid={intentoCierre && errorAlmacenCierre ? "true" : undefined}
                aria-describedby={
                  intentoCierre && errorAlmacenCierre ? "op-cierre-almacen-error" : undefined
                }
                className="campo"
              >
                {!almacenes.some((a) => a.id === detalle.almacenDestino.id) && (
                  <option value={detalle.almacenDestino.id}>{detalle.almacenDestino.nombre}</option>
                )}
                {almacenes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </select>
              <MensajeCampo
                id="op-cierre-almacen-error"
                texto={intentoCierre ? errorAlmacenCierre : undefined}
              />
            </div>
            <div>
              <label htmlFor="op-cierre-observaciones" className="etiqueta-campo">
                Observaciones <span className="text-texto-ter">(opcional)</span>
              </label>
              <textarea
                id="op-cierre-observaciones"
                value={formCierre.observaciones}
                onChange={(e) =>
                  setFormCierre((previo) => ({ ...previo, observaciones: e.target.value }))
                }
                disabled={procesando}
                rows={2}
                className="campo"
              />
            </div>
          </div>
        )}
      </ModalConfirmacion>
    </div>
  );
}
