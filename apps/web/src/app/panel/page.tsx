"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import {
  obtenerAlertasStock,
  obtenerSkus,
  obtenerValorizacion,
  type AlertaStock,
} from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";
import { leerUsuario } from "@/lib/sesion";

interface Indicadores {
  valorizado: string;
  skus: number;
  conStock: number;
  alertas: number;
}

const ACCESOS: ReadonlyArray<{ href: string; titulo: string; nota: string }> = [
  { href: "/panel/productos", titulo: "Productos", nota: "Catálogo de SKUs y altas" },
  { href: "/panel/movimientos", titulo: "Movimientos", nota: "Entradas y salidas" },
  { href: "/panel/conteos", titulo: "Conteos", nota: "Cuadre físico vs sistema" },
  { href: "/panel/reportes", titulo: "Reportes", nota: "Valorización y PLE SUNAT" },
];

export default function PaginaPanel(): React.JSX.Element {
  const [nombre, setNombre] = useState<string>("");
  const [ind, setInd] = useState<Indicadores | null>(null);
  const [alertas, setAlertas] = useState<AlertaStock[]>([]);
  const [cargando, setCargando] = useState<boolean>(true);

  useEffect(() => {
    const usuario = leerUsuario();
    if (usuario) setNombre(usuario.nombre.split(" ")[0] ?? usuario.nombre);

    void (async () => {
      try {
        const [val, paginaSkus, alertasStock] = await Promise.all([
          obtenerValorizacion(1, 1),
          obtenerSkus(1, 1, ""),
          obtenerAlertasStock(),
        ]);
        setInd({
          valorizado: val.totalGeneral,
          skus: paginaSkus.total,
          conStock: val.total,
          alertas: alertasStock.length,
        });
        setAlertas(alertasStock.slice(0, 6));
      } catch {
        setInd(null);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div>
      <EncabezadoPagina
        titulo={`Hola${nombre ? `, ${nombre}` : ""}`}
        descripcion="Resumen general del estado del inventario."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi etiqueta="Inventario valorizado" valor={cargando ? null : ind ? formatearSoles(ind.valorizado) : "—"} pie="Valor total en almacén" destacado />
        <Kpi etiqueta="SKUs registrados" valor={cargando ? null : ind ? formatearNumero(ind.skus) : "—"} pie="Productos en catálogo" />
        <Kpi etiqueta="Posiciones con stock" valor={cargando ? null : ind ? formatearNumero(ind.conStock) : "—"} pie="Existencias activas" />
        <Kpi
          etiqueta="Alertas de stock"
          valor={cargando ? null : ind ? formatearNumero(ind.alertas) : "—"}
          pie="Bajo el mínimo"
          tono={ind && ind.alertas > 0 ? "peligro" : "exito"}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Accesos */}
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Accesos rápidos</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {ACCESOS.map((a, i) => (
              <Link
                key={a.href}
                href={a.href}
                className={`group flex items-center justify-between gap-3 p-4 transition-colors hover:bg-panel-alt ${
                  i % 2 === 0 ? "sm:border-r sm:border-borde" : ""
                } ${i < 2 ? "border-b border-borde" : ""}`}
              >
                <div>
                  <p className="text-sm font-semibold text-tinta">{a.titulo}</p>
                  <p className="text-xs text-texto-sec">{a.nota}</p>
                </div>
                <span className="text-texto-ter transition-colors group-hover:text-oro-osc" aria-hidden>
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Alertas */}
        <section className="panel">
          <div className="panel-cabecera">
            <span className="panel-titulo">Stock bajo mínimo</span>
            {!cargando && (
              <span className={alertas.length > 0 ? "insignia insignia-peligro" : "insignia insignia-exito"}>
                {alertas.length}
              </span>
            )}
          </div>
          <div className="p-2">
            {cargando ? (
              <p className="px-3 py-8 text-center text-sm text-texto-ter">Cargando…</p>
            ) : alertas.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-texto-ter">
                Sin productos bajo el mínimo.
              </p>
            ) : (
              <ul>
                {alertas.map((a) => (
                  <li key={a.skuId} className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-panel-alt">
                    <span className="truncate text-sm text-texto">{a.producto}</span>
                    <span className="mono shrink-0 text-xs text-peligro">
                      {a.disponible}/{a.stockMinimo}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Kpi({
  etiqueta,
  valor,
  pie,
  tono,
  destacado,
}: {
  etiqueta: string;
  valor: string | null;
  pie: string;
  tono?: "peligro" | "exito";
  destacado?: boolean;
}): React.JSX.Element {
  const colorValor =
    tono === "peligro" ? "text-peligro" : tono === "exito" ? "text-exito" : "text-tinta";
  return (
    <div className="panel p-5">
      <p className="text-xs font-medium text-texto-sec">{etiqueta}</p>
      {valor === null ? (
        <div className="mt-2 h-7 w-24 animate-pulse rounded bg-panel-alt" />
      ) : (
        <p className={`mono mt-1.5 text-2xl font-semibold leading-none ${destacado ? "text-tinta" : colorValor}`}>
          {valor}
        </p>
      )}
      <p className="mt-2 text-xs text-texto-ter">{pie}</p>
    </div>
  );
}
