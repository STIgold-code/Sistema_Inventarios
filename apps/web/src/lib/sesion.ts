import type { UsuarioAutenticado } from "@bm/contratos";

/**
 * Helpers de sesion client-side. El access token, el refresh token y el usuario
 * se persisten en localStorage para sobrevivir recargas. Todas las funciones
 * validan que exista `window` para ser seguras frente a SSR.
 */

const CLAVE_TOKEN = "bm.token";
const CLAVE_REFRESH = "bm.refresh";
const CLAVE_USUARIO = "bm.usuario";

function hayNavegador(): boolean {
  return typeof window !== "undefined";
}

export interface DatosSesion {
  token: string;
  refreshToken: string;
  usuario: UsuarioAutenticado;
}

export function guardarSesion({ token, refreshToken, usuario }: DatosSesion): void {
  if (!hayNavegador()) return;
  window.localStorage.setItem(CLAVE_TOKEN, token);
  window.localStorage.setItem(CLAVE_REFRESH, refreshToken);
  window.localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
}

/** Actualiza solo los tokens tras una renovacion silenciosa. */
export function guardarTokens(token: string, refreshToken: string): void {
  if (!hayNavegador()) return;
  window.localStorage.setItem(CLAVE_TOKEN, token);
  window.localStorage.setItem(CLAVE_REFRESH, refreshToken);
}

export function leerToken(): string | null {
  if (!hayNavegador()) return null;
  return window.localStorage.getItem(CLAVE_TOKEN);
}

export function leerRefresh(): string | null {
  if (!hayNavegador()) return null;
  return window.localStorage.getItem(CLAVE_REFRESH);
}

export function leerUsuario(): UsuarioAutenticado | null {
  if (!hayNavegador()) return null;
  const crudo = window.localStorage.getItem(CLAVE_USUARIO);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as UsuarioAutenticado;
  } catch {
    return null;
  }
}

export function limpiarSesion(): void {
  if (!hayNavegador()) return;
  window.localStorage.removeItem(CLAVE_TOKEN);
  window.localStorage.removeItem(CLAVE_REFRESH);
  window.localStorage.removeItem(CLAVE_USUARIO);
}

export function haySesion(): boolean {
  return leerToken() !== null;
}
