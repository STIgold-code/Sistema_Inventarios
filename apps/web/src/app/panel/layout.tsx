"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { borrarSesion, haySesion, leerUsuario } from "@/lib/sesion";
import { INICIO, MODULOS, colorDeRuta, esActivo, moduloDeRuta } from "@/lib/modulos";
import type { UsuarioAutenticado } from "@bm/contratos";

export default function LayoutPanel({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element | null {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<UsuarioAutenticado | null>(null);
  const [listo, setListo] = useState<boolean>(false);
  const [menuAbierto, setMenuAbierto] = useState<boolean>(false);
  const [expandidos, setExpandidos] = useState<string[]>([]);

  useEffect(() => {
    if (!haySesion()) {
      router.replace("/login");
      return;
    }
    setUsuario(leerUsuario());
    setListo(true);
  }, [router]);

  // Cierra el menú móvil al cambiar de ruta.
  useEffect(() => {
    setMenuAbierto(false);
  }, [pathname]);

  // Abre automáticamente el módulo que contiene la ruta activa.
  useEffect(() => {
    const activo = moduloDeRuta(pathname);
    if (activo) {
      setExpandidos((previo) =>
        previo.includes(activo) ? previo : [...previo, activo],
      );
    }
  }, [pathname]);

  function alternarModulo(titulo: string): void {
    setExpandidos((previo) =>
      previo.includes(titulo)
        ? previo.filter((t) => t !== titulo)
        : [...previo, titulo],
    );
  }

  function cerrarSesion(): void {
    borrarSesion();
    router.replace("/login");
  }

  if (!listo) return null;

  const inicial = (usuario?.nombre ?? "U").charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen">
      {/* Overlay (solo móvil, cuando el menú está abierto) */}
      {menuAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMenuAbierto(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r border-borde bg-panel transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca */}
        <div className="flex items-center justify-between border-b border-borde px-4 py-4">
          <div>
            <div className="inline-flex rounded-md bg-tinta px-2.5 py-2">
              <Image src="/logo-bm.png" alt="BM Ingenieros S.A.C." width={112} height={39} />
            </div>
            <p className="mt-2 text-[0.7rem] text-texto-ter">Sistema de Inventarios</p>
          </div>
          <button
            type="button"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
            className="flex h-9 w-9 items-center justify-center rounded-md text-texto-sec hover:bg-panel-alt lg:hidden"
          >
            <IconoCerrar />
          </button>
        </div>

        {/* Navegacion */}
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Navegación principal">
          {/* Inicio (acceso directo) — color neutro de marca */}
          <div data-modulo="marca">
            <Link
              href={INICIO.href}
              aria-current={esActivo(INICIO.href, pathname) ? "page" : undefined}
              className={`mb-3 flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                esActivo(INICIO.href, pathname)
                  ? "item-activo font-semibold"
                  : "font-medium text-texto-sec hover:bg-panel-alt hover:text-tinta"
              }`}
            >
              {INICIO.etiqueta}
            </Link>
          </div>

          {/* Módulos padre (acordeón). Cada grupo tiñe su título e ítems
              activos con su color de wayfinding (heredado vía data-modulo). */}
          {MODULOS.map((modulo) => {
            const abierto = expandidos.includes(modulo.titulo);
            const tieneActivo = modulo.enlaces.some((e) => esActivo(e.href, pathname));
            return (
              <div key={modulo.titulo} className="mb-1.5" data-modulo={modulo.color}>
                <button
                  type="button"
                  onClick={() => alternarModulo(modulo.titulo)}
                  aria-expanded={abierto}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide transition-colors ${
                    tieneActivo
                      ? "modulo-titulo"
                      : "text-texto-ter hover:text-texto-sec"
                  }`}
                >
                  <span>{modulo.titulo}</span>
                  <IconoChevron abierto={abierto} />
                </button>
                {abierto && (
                  <div className="mt-0.5 space-y-0.5">
                    {modulo.enlaces.map((enlace) => {
                      const activo = esActivo(enlace.href, pathname);
                      return (
                        <Link
                          key={enlace.href}
                          href={enlace.href}
                          aria-current={activo ? "page" : undefined}
                          className={`flex items-center rounded-md py-2 pl-5 pr-3 text-sm transition-colors ${
                            activo
                              ? "item-activo font-semibold"
                              : "font-medium text-texto-sec hover:bg-panel-alt hover:text-tinta"
                          }`}
                        >
                          {enlace.etiqueta}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Usuario */}
        <div className="border-t border-borde p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-tinta text-xs font-semibold text-white">
              {inicial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-tinta">{usuario?.nombre ?? "Usuario"}</p>
              <p className="truncate text-xs text-texto-ter">{usuario?.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarSesion}
            className="btn btn-contorno mt-2 h-9 w-full text-sm"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar (solo móvil) */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-borde bg-panel/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <button
            type="button"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
            className="flex h-9 w-9 items-center justify-center rounded-md text-tinta hover:bg-panel-alt"
          >
            <IconoMenu />
          </button>
          <div className="inline-flex rounded bg-tinta px-2 py-1">
            <Image src="/logo-bm.png" alt="BM Ingenieros" width={84} height={29} />
          </div>
        </header>

        <main
          data-modulo={colorDeRuta(pathname)}
          className="fondo-modulo flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
        >
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function IconoChevron({ abierto }: { abierto: boolean }): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 transition-transform duration-200 ${abierto ? "rotate-90" : ""}`}
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function IconoMenu(): React.JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  );
}

function IconoCerrar(): React.JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
