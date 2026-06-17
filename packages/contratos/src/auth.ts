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
  token: string;
  usuario: UsuarioAutenticado;
}
