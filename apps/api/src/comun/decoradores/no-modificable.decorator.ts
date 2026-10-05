import { ValidateBy } from "class-validator";

/**
 * Rechaza con 400 un campo que no se puede modificar si viene en el cuerpo (con
 * cualquier valor, incluido null). Sin esto, el ValidationPipe con whitelist lo
 * descartaria en silencio y el cliente creeria que el cambio se aplico.
 */
export const NoModificable = (mensaje: string): PropertyDecorator =>
  ValidateBy({
    name: "noModificable",
    validator: {
      validate: (valor: unknown): boolean => valor === undefined,
      defaultMessage: (): string => mensaje,
    },
  });
