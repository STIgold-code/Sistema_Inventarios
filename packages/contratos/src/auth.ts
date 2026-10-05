import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Correo invalido"),
  clave: z.string().min(8, "La clave debe tener al menos 8 caracteres"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Largo maximo de una clave en BYTES UTF-8: bcrypt ignora lo que excede 72 bytes. */
export const LARGO_MAXIMO_CLAVE_BYTES = 72;

/**
 * Largo en bytes UTF-8 (igual que TextEncoder / Buffer.byteLength, incluidos
 * los surrogates sueltos, que se codifican como U+FFFD de 3 bytes). Se calcula
 * a mano porque este paquete compila solo con lib ES2022, sin DOM ni tipos de
 * Node, y TextEncoder no esta tipado aqui.
 */
function bytesUtf8(valor: string): number {
  let bytes = 0;
  for (const caracter of valor) {
    const punto = caracter.codePointAt(0) ?? 0;
    if (punto < 0x80) bytes += 1;
    else if (punto < 0x800) bytes += 2;
    else if (punto < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

/**
 * Formulario de cambio de clave. Replica las reglas de forma de la API (actual
 * requerida, nueva de al menos 8 caracteres y hasta 72 bytes, distinta de la
 * actual) y agrega la confirmacion, que solo existe en el cliente. Las reglas
 * que dependen de datos del servidor (claves prohibidas, correo) solo las
 * aplica la API; el cliente muestra su mensaje.
 */
export const cambiarClaveSchema = z
  .object({
    claveActual: z.string().min(1, "Ingresa tu contraseña actual"),
    claveNueva: z
      .string()
      .min(8, "La nueva contraseña debe tener al menos 8 caracteres")
      .refine(
        (valor) => bytesUtf8(valor) <= LARGO_MAXIMO_CLAVE_BYTES,
        "La nueva contraseña es demasiado larga (máximo 72 bytes; las letras con tilde y la ñ ocupan 2)",
      ),
    confirmacion: z.string(),
  })
  .superRefine((datos, contexto) => {
    if (datos.claveNueva === datos.claveActual) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["claveNueva"],
        message: "La nueva contraseña debe ser distinta de la actual",
      });
    }
    if (datos.confirmacion !== datos.claveNueva) {
      contexto.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmacion"],
        message: "La confirmación no coincide con la nueva contraseña",
      });
    }
  });
export type CambiarClaveFormulario = z.infer<typeof cambiarClaveSchema>;

/** Cuerpo de POST /auth/cambiar-clave. */
export interface CambiarClaveInput {
  claveActual: string;
  claveNueva: string;
}

/**
 * Codigo con el que la API rechaza (403) cualquier peticion de un usuario con
 * clave temporal, salvo el propio cambio de clave.
 */
export const CODIGO_CLAVE_TEMPORAL = "CLAVE_TEMPORAL";

/**
 * Codigo con el que la API rechaza (400) una clave NUEVA que no cumple las
 * reglas (cambio de clave, alta de usuario, restablecimiento). Permite marcar
 * el error en el campo de la clave.
 */
export const CODIGO_CLAVE_INVALIDA = "CLAVE_INVALIDA";

export interface UsuarioAutenticado {
  id: string;
  empresaId: string;
  email: string;
  nombre: string;
  permisos: string[];
  /** true mientras la clave vigente sea temporal; debe cambiarse para continuar. */
  debeCambiarClave: boolean;
}

/** Respuesta de POST /auth/login y de POST /auth/cambiar-clave. */
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
