"use client";

import { useEffect } from "react";

/**
 * Recupera la aplicación de un ChunkLoadError. El edge HTTP/2 puede cortar la
 * descarga de un chunk de JavaScript (responde 200 pero el stream se resetea),
 * lo que deja la página rota con una excepción sin recuperación. Cuando eso
 * ocurre, recargamos una sola vez: al segundo intento el chunk casi siempre
 * baja bien. La guarda en sessionStorage evita un bucle de recargas si el fallo
 * fuese persistente, y se limpia tras una carga exitosa para permitir futuros
 * reintentos en la misma sesión.
 */
const CLAVE_REINTENTO = "recuperacion-chunk-reintento";

function esErrorDeChunk(valor: unknown): boolean {
  if (!valor) return false;
  const mensaje =
    valor instanceof Error ? `${valor.name} ${valor.message}` : String(valor);
  return /ChunkLoadError|Loading chunk [\d]+ failed|Loading CSS chunk/i.test(
    mensaje,
  );
}

export function RecuperacionChunks(): null {
  useEffect(() => {
    function recuperar(): void {
      if (sessionStorage.getItem(CLAVE_REINTENTO)) return; // ya reintentamos
      sessionStorage.setItem(CLAVE_REINTENTO, "1");
      window.location.reload();
    }

    function alError(evento: ErrorEvent): void {
      if (esErrorDeChunk(evento.error ?? evento.message)) recuperar();
    }
    function alRechazo(evento: PromiseRejectionEvent): void {
      if (esErrorDeChunk(evento.reason)) recuperar();
    }

    window.addEventListener("error", alError);
    window.addEventListener("unhandledrejection", alRechazo);

    // Si la página cargó sin fallar, liberamos la guarda para que un futuro
    // ChunkLoadError pueda volver a disparar una recarga.
    const limpiar = window.setTimeout(() => {
      sessionStorage.removeItem(CLAVE_REINTENTO);
    }, 10000);

    return () => {
      window.removeEventListener("error", alError);
      window.removeEventListener("unhandledrejection", alRechazo);
      window.clearTimeout(limpiar);
    };
  }, []);

  return null;
}
