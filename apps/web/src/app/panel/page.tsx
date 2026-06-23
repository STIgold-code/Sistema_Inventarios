"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EncabezadoPagina } from "@/componentes/encabezado-pagina";
import { obtenerDashboard, type Dashboard } from "@/lib/api";
import { formatearNumero, formatearSoles } from "@/lib/formato";
import { leerUsuario } from "@/lib/sesion";

const MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

/** Convierte un periodo AAAAMM (ej. "202606") en texto legible ("Junio 2026"). */
function formatearPeriodo(periodo: string): string {
  if (periodo.length !== 6) return periodo;
  const anio = periodo.slice(0, 4);
  const mes = Number(periodo.slice(4, 6));
  const nombre = MESES[mes - 1];
  return nombre ? `${nombre} ${anio}` : periodo;
}

/** Antiguedad relativa de una fecha ISO ("hace 5 min", "hace 2 h", "ayer"). */
function tiempoRelativo(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const segundos = Math.floor((Date.now() - fecha.getTime()) / 1000);
  if (segundos < 60) return "hace un momento";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
  }).format(fecha);
}

export default function PaginaPanel(): React.JSX.Element {
  const [nombre, setNombre] = useState<string>("");
  const [datos, setDatos] = useState<Dashboard | null>(null);
  const [cargando, setCargando] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const usuario = leerUsuario();
    if (usuario) setNombre(usuario.nombre.split(" ")[0] ?? usuario.nombre);

    void (async () => {
      try {
        setDatos(await obtenerDashboard());
      } catch {
        setError(true);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  return (
    <div>
      <EncabezadoPagina
        titulo={`Hola${nombre ? `, ${nombre}` : ""}`}
        descripcion="Resumen gerencial del estado del inventario y lo que requiere tu atención hoy."
      />

      {error && (
        <div className="aviso aviso-peligro mb-6">
          No se pudo cargar el panel. Vuelve a intentarlo en unos segundos.
        </div>
      )}

      {/* ── Fila de KPIs principales ─────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          etiqueta="Valor del inventario"
          valor={cargando ? null : datos ? formatearSoles(datos.inventario.valorTotal) : "—"}
          pie="Valorización total en almacén"
          destacado
        />
        <Kpi
          etiqueta="Valor inmovilizado"
          valor={cargando ? null : datos ? formatearSoles(datos.inventario.valorDeteriorado) : "—"}
          pie="Existencia deteriorada"
          tono={datos && Number(datos.inventario.valorDeteriorado) > 0 ? "aviso" : undefined}
        />
        <Kpi
          etiqueta="SKUs bajo mínimo"
          valor={cargando ? null : datos ? formatearNumero(datos.reposicion.bajoMinimo) : "—"}
          pie="Requieren reposición"
          tono={datos && datos.reposicion.bajoMinimo > 0 ? "peligro" : "exito"}
          href="/panel/reposicion"
        />
        <Kpi
          etiqueta="Quiebres / sin stock"
          valor={cargando ? null : datos ? formatearNumero(datos.inventario.skusSinStock) : "—"}
          pie="SKUs activos sin existencia"
          tono={datos && datos.inventario.skusSinStock > 0 ? "peligro" : "exito"}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Columna izquierda: Pendientes + Periodo ──────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Pendientes */}
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Pendientes</span>
              <span className="text-xs text-texto-ter">Lo que hay que accionar hoy</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3">
              <TarjetaPendiente
                href="/panel/requerimientos"
                titulo="Requerimientos"
                accion="Por aprobar"
                conteo={cargando ? null : (datos?.pendientes.requerimientosPorAprobar ?? 0)}
                bordeDerecho
              />
              <TarjetaPendiente
                href="/panel/compras"
                titulo="Órdenes de compra"
                accion="Por recibir"
                conteo={cargando ? null : (datos?.pendientes.ocPorRecibir ?? 0)}
                bordeDerecho
              />
              <TarjetaPendiente
                href="/panel/ventas"
                titulo="Ventas"
                accion="Por despachar"
                conteo={cargando ? null : (datos?.pendientes.ventasPorDespachar ?? 0)}
              />
            </div>
          </section>

          {/* Periodo contable */}
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Periodo contable</span>
              <Link href="/panel/cierres" className="text-xs text-oro-osc hover:underline">
                Ver cierres →
              </Link>
            </div>
            <div className="p-5">
              {cargando ? (
                <div className="space-y-3">
                  <div className="h-7 w-40 animate-pulse rounded bg-panel-alt" />
                  <div className="h-5 w-56 animate-pulse rounded bg-panel-alt" />
                </div>
              ) : datos ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-semibold text-tinta">
                      {formatearPeriodo(datos.periodo.actual)}
                    </span>
                    <span
                      className={
                        datos.periodo.estado === "ABIERTO"
                          ? "insignia insignia-exito"
                          : "insignia insignia-neutra"
                      }
                    >
                      {datos.periodo.estado === "ABIERTO" ? "Abierto" : "Cerrado"}
                    </span>
                  </div>
                  <div className="mt-4 flex gap-8">
                    <div>
                      <p className="text-xs text-texto-sec">Entradas del mes</p>
                      <p className="mono mt-0.5 text-lg font-semibold text-exito">
                        {formatearNumero(datos.periodo.movimientosEntrada)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-texto-sec">Salidas del mes</p>
                      <p className="mono mt-0.5 text-lg font-semibold text-tinta">
                        {formatearNumero(datos.periodo.movimientosSalida)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-sm text-texto-ter">Sin datos del periodo.</p>
              )}
            </div>
          </section>
        </div>

        {/* ── Columna derecha: Reposición + Actividad ──────────────────── */}
        <div className="flex flex-col gap-6">
          {/* Reposición sugerida */}
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Reposición sugerida</span>
              <Link href="/panel/reposicion" className="text-xs text-oro-osc hover:underline">
                Ver todo →
              </Link>
            </div>
            <div className="p-2">
              {cargando ? (
                <ListaSkeleton filas={4} />
              ) : !datos || datos.reposicion.items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-texto-ter">
                  No hay productos bajo el mínimo.
                </p>
              ) : (
                <ul>
                  {datos.reposicion.items.map((item) => (
                    <li
                      key={item.skuId}
                      className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-panel-alt"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-texto">{item.producto}</p>
                        <p className="mono text-xs text-texto-ter">{item.codigoParlante}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="mono text-xs text-peligro">
                          {formatearNumero(item.disponible)} / {formatearNumero(item.stockMinimo)}
                        </p>
                        <p className="text-xs text-texto-sec">
                          pedir{" "}
                          <span className="mono font-semibold text-oro-osc">
                            {formatearNumero(item.sugerido)}
                          </span>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Actividad reciente */}
          <section className="panel">
            <div className="panel-cabecera">
              <span className="panel-titulo">Actividad reciente</span>
              <Link href="/panel/auditoria" className="text-xs text-oro-osc hover:underline">
                Ver auditoría →
              </Link>
            </div>
            <div className="p-2">
              {cargando ? (
                <ListaSkeleton filas={5} />
              ) : !datos || datos.actividad.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-texto-ter">
                  Sin actividad reciente.
                </p>
              ) : (
                <ul>
                  {datos.actividad.map((act, i) => (
                    <li
                      key={`${act.creadoEn}-${i}`}
                      className="flex items-start justify-between gap-3 rounded-md px-3 py-2 hover:bg-panel-alt"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-texto">
                          <span className="font-medium">{act.accion}</span>{" "}
                          <span className="text-texto-sec">{act.entidad}</span>
                        </p>
                        {act.detalle && (
                          <p className="truncate text-xs text-texto-ter">{act.detalle}</p>
                        )}
                        <p className="text-xs text-texto-ter">{act.usuario}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap text-xs text-texto-ter">
                        {tiempoRelativo(act.creadoEn)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponentes ────────────────────────────────────────────────────────

function Kpi({
  etiqueta,
  valor,
  pie,
  tono,
  destacado,
  href,
}: {
  etiqueta: string;
  valor: string | null;
  pie: string;
  tono?: "peligro" | "exito" | "aviso";
  destacado?: boolean;
  href?: string;
}): React.JSX.Element {
  const colorValor =
    tono === "peligro"
      ? "text-peligro"
      : tono === "aviso"
        ? "text-aviso"
        : tono === "exito"
          ? "text-exito"
          : "text-tinta";

  const contenido = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-texto-sec">{etiqueta}</p>
        {href && (
          <span className="text-texto-ter transition-colors group-hover:text-oro-osc" aria-hidden>
            →
          </span>
        )}
      </div>
      {valor === null ? (
        <div className="mt-2 h-8 w-28 animate-pulse rounded bg-panel-alt" />
      ) : (
        <p
          className={`mono mt-1.5 text-2xl font-semibold leading-none ${
            destacado ? "text-tinta" : colorValor
          }`}
        >
          {valor}
        </p>
      )}
      <p className="mt-2 text-xs text-texto-ter">{pie}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="panel group p-5 transition-colors hover:bg-panel-alt">
        {contenido}
      </Link>
    );
  }
  return <div className="panel p-5">{contenido}</div>;
}

function TarjetaPendiente({
  href,
  titulo,
  accion,
  conteo,
  bordeDerecho,
}: {
  href: string;
  titulo: string;
  accion: string;
  conteo: number | null;
  bordeDerecho?: boolean;
}): React.JSX.Element {
  const activo = conteo !== null && conteo > 0;
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-1 p-4 transition-colors hover:bg-panel-alt ${
        bordeDerecho ? "sm:border-r sm:border-borde" : ""
      } border-b border-borde sm:border-b-0`}
    >
      <div className="flex items-baseline gap-2">
        {conteo === null ? (
          <span className="h-7 w-8 animate-pulse rounded bg-panel-alt" />
        ) : (
          <span
            className={`mono text-2xl font-semibold leading-none ${
              activo ? "text-tinta" : "text-texto-ter"
            }`}
          >
            {formatearNumero(conteo)}
          </span>
        )}
        {conteo !== null && (
          <span
            className={
              activo ? "insignia insignia-oro" : "insignia insignia-neutra"
            }
          >
            {activo ? accion : "Al día"}
          </span>
        )}
      </div>
      <p className="text-sm text-texto-sec">{titulo}</p>
      <span className="text-xs text-texto-ter transition-colors group-hover:text-oro-osc">
        Ir al módulo →
      </span>
    </Link>
  );
}

function ListaSkeleton({ filas }: { filas: number }): React.JSX.Element {
  return (
    <ul className="space-y-1">
      {Array.from({ length: filas }).map((_, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="h-4 w-40 animate-pulse rounded bg-panel-alt" />
          <div className="h-4 w-16 animate-pulse rounded bg-panel-alt" />
        </li>
      ))}
    </ul>
  );
}
