import { ValidateIf } from "class-validator";

/**
 * Campo opcional SOLO si se omite. A diferencia de @IsOptional(), un `null`
 * explicito sigue validandose y se rechaza con 400.
 */
export const SiSeEnvia = (): PropertyDecorator =>
  ValidateIf((_objeto: object, valor: unknown) => valor !== undefined);
