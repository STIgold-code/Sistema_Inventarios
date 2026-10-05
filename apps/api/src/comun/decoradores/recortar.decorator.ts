import { Transform } from "class-transformer";

/**
 * Quita los espacios de los extremos de un texto ANTES de validarlo (el
 * ValidationPipe global transforma primero). Otros tipos, incluido `null`, se
 * dejan intactos para que la validacion los rechace.
 */
export const Recortar = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value));
