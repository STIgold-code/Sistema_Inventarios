"use client";

import { useEffect, useMemo, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { SelectorSku } from "@/componentes/selector-sku";
import {
  ErrorApi,
  obtenerAlmacenes,
  obtenerStock,
  registrarAjuste,
  registrarMerma,
  type Almacen,
  type Sku,
  type StockSku,
} from "@/lib/api";

type Motivo = "ajuste" | "merma";

const MOTIVOS: ReadonlyArray<{ id: Motivo; etiqueta: string; nota: string }> = [
  { id: "ajuste", etiqueta: "Ajuste", nota: "Corrige la cantidad por error de conteo (+/−)" },
  { id: "merma", etiqueta: "Merma / desmedro", nota: "Da de baja stock roto, vencido o perdido" },
];

interface Aviso {
  texto: string;
  tono: "exito" | "error";
}

export default function PaginaMovimientos(): React.JSX.Element {
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [motivo, setMotivo] = useState<Motivo>("ajuste");

  const [sku, setSku] = useState<Sku | null>(null);
  const [almacenId, setAlmacenId] = useState<string>("");
  const [incremento, setIncremento] = useState<boolean>(true);
  const [cantidad, setCantidad] = useState<string>("");
  const [observaciones, setObservaciones] = useState<string>("");

  const [procesando, setProcesando] = useState<boolean>(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [stock, setStock] = useState<StockSku[]>([]);

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
      setObservaciones("");
      setStock(await obtenerStock(sku!.id));
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
                <select id="almacen" className="campo" value={almacenId} onChange={(e) => setAlmacenId(e.target.value)}>
                  {almacenes.map((a) => (
                    <option key={a.id} value={a.id}>{a.codigo} — {a.nombre}</option>
                  ))}
                </select>
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
    </div>
  );
}
