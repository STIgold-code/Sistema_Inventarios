import { z } from "zod";

/** Parametros de paginacion estandar. */
export const paginacionSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(200).default(50),
});
export type Paginacion = z.infer<typeof paginacionSchema>;

/** Respuesta paginada generica. */
export interface RespuestaPaginada<T> {
  datos: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Decimal transportado como string para no perder precision en JSON. */
export const decimalSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/, "Debe ser un numero decimal valido");
