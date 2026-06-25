"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { borrarSesion, haySesion, leerUsuario } from "@/lib/sesion";
import { INICIO, MODULOS, esActivo, moduloDeRuta } from "@/lib/modulos";
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
        data-tema="oscuro"
        style={{
          background: "var(--sidebar-fondo)",
          borderColor: "var(--sidebar-borde)",
        }}
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-64 flex-col border-r transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          menuAbierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Marca */}
        <div
          style={{ borderColor: "var(--sidebar-borde)" }}
          className="flex items-center justify-between border-b px-4 py-4"
        >
          <div>
            <div className="inline-flex rounded-md bg-black/30 px-2.5 py-2 ring-1 ring-white/5">
              <Image src="/logo-bm.png" alt="BM Ingenieros S.A.C." width={112} height={39} />
            </div>
            <p className="mt-2 text-[0.7rem]" style={{ color: "var(--sidebar-texto-tenue)" }}>
              Sistema de Inventarios
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar menú"
            style={{ color: "var(--sidebar-texto)" }}
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10 hover:text-white lg:hidden"
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
              style={esActivo(INICIO.href, pathname) ? undefined : { color: "var(--sidebar-texto-fuerte)" }}
              className={`mb-3 flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                esActivo(INICIO.href, pathname)
                  ? "item-activo font-semibold"
                  : "font-medium hover:bg-white/5 hover:text-white"
              }`}
            >
              {INICIO.etiqueta}
            </Link>
          </div>

          {/* Módulos padre (acordeón). El título de cada grupo va SIEMPRE en su
              color de módulo brillante (heredado vía data-modulo + data-tema del
              sidebar); los ítems activos toman fondo y filo del mismo color. */}
          {MODULOS.map((modulo) => {
            const abierto = expandidos.includes(modulo.titulo);
            return (
              <div key={modulo.titulo} data-modulo={modulo.color} className="mb-1">
                <button
                  type="button"
                  onClick={() => alternarModulo(modulo.titulo)}
                  aria-expanded={abierto}
                  className="modulo-titulo flex w-full items-center justify-between rounded-md px-3 py-2 text-[0.7rem] font-semibold uppercase tracking-wide"
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
                          style={activo ? undefined : { color: "var(--sidebar-texto)" }}
                          className={`flex items-center rounded-md py-2 pl-5 pr-3 text-sm transition-colors ${
                            activo
                              ? "item-activo font-semibold"
                              : "font-medium hover:bg-white/5 hover:text-white"
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
        <div style={{ borderColor: "var(--sidebar-borde)" }} className="border-t p-3">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-white/10">
              {inicial}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium" style={{ color: "var(--sidebar-texto-fuerte)" }}>
                {usuario?.nombre ?? "Usuario"}
              </p>
              <p className="truncate text-xs" style={{ color: "var(--sidebar-texto-tenue)" }}>
                {usuario?.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={cerrarSesion}
            style={{ borderColor: "var(--sidebar-borde)", color: "var(--sidebar-texto-fuerte)" }}
            className="mt-2 flex h-9 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-white/10 hover:text-white"
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

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
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
