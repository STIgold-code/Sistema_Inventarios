"use client";

import { useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import { SelectorBusqueda, type OpcionSelector } from "@/componentes/selector-busqueda";
import { ModalConfirmacion } from "@/componentes/modal-confirmacion";
import {
  ErrorApi,
  darDeBajaDeteriorado,
  marcarDeteriorado,
  obtenerAlmacenes,
  obtenerStock,
  recuperarDeteriorado,
  type Almacen,
  type CondicionInput,
  type CondicionRespuesta,
  type Sku,
  type StockSku,
} from "@/lib/api";

type Accion = "deteriorar" | "recuperar" | "baja";

interface DefinicionAccion {
  id: Accion;
  etiqueta: string;
  nota: string;
  ejecutar: (datos: CondicionInput) => Promise<CondicionRespuesta>;
  tonoConfirmar: "primario" | "peligro";
  textoConfirmar: string;
  exito: string;
}

const DETERIORAR: DefinicionAccion = {
  id: "deteriorar",
  etiqueta: "Marcar deteriorado",
  nota: "Pasa existencia de buen uso a deteriorado (no es salida física)",
  ejecutar: marcarDeteriorado,
  tonoConfirmar: "primario",
  textoConfirmar: "Marcar deteriorado",
  exito: "Existencia marcada como deteriorada.",
};

const ACCIONES: ReadonlyArray<DefinicionAccion> = [
  DETERIORAR,
  {
    id: "recuperar",
    etiqueta: "Recuperar (a buen uso)",
    nota: "Devuelve existencia deteriorada al stock disponible",
    ejecutar: recuperarDeteriorado,
    tonoConfirmar: "primario",
    textoConfirmar: "Recuperar",
    exito: "Existencia recuperada a buen uso.",
  },
  {
    id: "baja",
    etiqueta: "Dar de baja deteriorado",
    nota: "Salida física definitiva desde el deteriorado (consume costo)",
    ejecutar: darDeBajaDeteriorado,
    tonoConfirmar: "peligro",
    textoConfirmar: "Dar de baja",
    exito: "Existencia deteriorada dada de baja.",
  },
];

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

export default function PaginaCondicion(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [accionId, setAccionId] = useState<Accion>("deteriorar");

  const [sku, setSku] = useState<Sku | null>(null);
  const [almacenId, setAlmacenId] = useState<string>("");
  const [cantidad, setCantidad] = useState<string>("");
  const [motivo, setMotivo] = useState<string>("");

  const [procesando, setProcesando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [stock, setStock] = useState<StockSku[]>([]);
  const [modalAbierto, setModalAbierto] = useState<boolean>(false);

  const accion = useMemo(
    () => ACCIONES.find((a) => a.id === accionId) ?? DETERIORAR,
    [accionId],
  );

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

  function cambiarAccion(id: Accion): void {
    setAccionId(id);
    setAviso(null);
  }

  function validar(): string | null {
    if (!sku) return "Selecciona un producto.";
    if (!almacenId) return "Selecciona un almacén.";
    if (!/^\d+(\.\d+)?$/.test(cantidad) || Number(cantidad) <= 0) {
      return "Ingresa una cantidad válida.";
    }
    if (!motivo.trim()) return "Indica el motivo.";
    return null;
  }

  function abrirConfirmacion(): void {
    const err = validar();
    if (err) {
      setAviso({ texto: err, tono: "error" });
      return;
    }
    setAviso(null);
    setModalAbierto(true);
  }

  async function confirmar(): Promise<void> {
    if (!sku) return;
    setProcesando(true);
    try {
      await accion.ejecutar({
        skuId: sku.id,
        almacenId: Number(almacenId),
        cantidad,
        motivo: motivo.trim(),
      });
      setAviso({ texto: accion.exito, tono: "exito" });
      setCantidad("");
      setMotivo("");
      setStock(await obtenerStock(sku.id));
    } catch (error) {
      setAviso({
        texto:
          error instanceof ErrorApi
            ? error.message
            : "No se pudo registrar la operación.",
        tono: "error",
      });
    } finally {
      setProcesando(false);
      setModalAbierto(false);
    }
  }

  const nombreAlmacen = useMemo(
    () => new Map(almacenes.map((a) => [a.id, `${a.codigo} — ${a.nombre}`])),
    [almacenes],
  );

  const etiquetaAlmacen = nombreAlmacen.get(almacenId) ?? "el almacén";

  const opcionesAlmacen = useMemo<OpcionSelector[]>(
    () => almacenes.map((a) => ({ valor: a.id, etiqueta: `${a.codigo} — ${a.nombre}` })),
    [almacenes],
  );

  return (
    <div>
      <EncabezadoPagina
        titulo="Condición de existencias"
        descripcion="Reclasifica existencias entre buen uso y deteriorado, o da de baja lo deteriorado. El deteriorado no se vende ni se consume."
      />

      {/* Acción */}
      <div className="flex flex-wrap gap-2">
        {ACCIONES.map((a) => {
          const activo = accionId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => cambiarAccion(a.id)}
              className={`rounded-md border px-4 py-2.5 text-left transition-colors ${
                activo
                  ? "border-oro bg-oro-tenue"
                  : "border-borde-fuerte bg-panel hover:bg-panel-alt"
              }`}
            >
              <span className="block text-sm font-semibold text-tinta">{a.etiqueta}</span>
              <span className="block text-xs text-texto-sec">{a.nota}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.3fr_1fr]">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">{accion.etiqueta}</span>
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
              <div>
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
            </div>

            <div>
              <label htmlFor="motivo" className="etiqueta-campo">Motivo</label>
              <input
                id="motivo"
                className="campo"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. golpe en transporte, óxido, recuperación tras reparación…"
              />
            </div>

            <p className="text-xs text-texto-ter">
              {accion.id === "baja"
                ? "La baja consume el costo promedio vigente y reduce el stock físico total."
                : "Es una reclasificación interna: no altera el costo ni el stock físico total."}
            </p>

            <button
              type="button"
              onClick={abrirConfirmacion}
              disabled={procesando}
              className={accion.tonoConfirmar === "peligro" ? "btn btn-peligro" : "btn btn-primario"}
            >
              {accion.etiqueta}
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
                Registra una operación para ver el stock actualizado.
              </p>
            ) : (
              <table className="tabla-datos">
                <thead>
                  <tr>
                    <th>Almacén</th>
                    <th className="num">Disponible</th>
                    <th className="num">Deteriorado</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.map((s) => (
                    <tr key={s.almacenId}>
                      <td>{nombreAlmacen.get(String(s.almacenId)) ?? `Almacén ${s.almacenId}`}</td>
                      <td className="num font-semibold text-tinta">{s.cantidadDisponible}</td>
                      <td className="num text-peligro">{s.cantidadDeteriorada}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <ModalConfirmacion
        abierto={modalAbierto}
        titulo={accion.etiqueta}
        mensaje={`Vas a aplicar "${accion.etiqueta}" sobre ${cantidad || "0"} unidad(es) de ${
          sku ? `${sku.codigoParlante} — ${sku.nombre ?? sku.producto.nombre}` : "el producto"
        } en ${etiquetaAlmacen}. ¿Confirmas la operación?`}
        textoConfirmar={accion.textoConfirmar}
        tono={accion.tonoConfirmar}
        procesando={procesando}
        onConfirmar={() => void confirmar()}
        onCancelar={() => setModalAbierto(false)}
      />
    </div>
  );
}
