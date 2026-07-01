import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Correo invalido"),
  clave: z.string().min(8, "La clave debe tener al menos 8 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface UsuarioAutenticado {
  id: string;
  empresaId: string;
  email: string;
  nombre: string;
  permisos: string[];
}

export interface RespuestaLogin {
  /** Access token JWT de vida corta. Se conserva `token` por compatibilidad. */
  token: string;
  /** Refresh token opaco para la renovacion silenciosa de sesion. */
  refreshToken: string;
  usuario: UsuarioAutenticado;
}

/** Respuesta de POST /auth/refresh: par renovado + usuario. */
export interface RespuestaRefresco {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioAutenticado;
}
