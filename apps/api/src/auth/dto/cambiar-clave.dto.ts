import { IsNotEmpty, IsString } from "class-validator";

/**
 * Solo forma. Las reglas de la clave nueva (largo en bytes, lista de claves
 * prohibidas, correo) viven en `validarClaveNueva` (auth/clave.ts) porque
 * dependen del usuario y se reutilizan fuera de este endpoint.
 */
export class CambiarClaveDto {
  @IsString()
  @IsNotEmpty({ message: "Ingresa tu clave actual" })
  claveActual!: string;

  @IsString()
  @IsNotEmpty({ message: "Ingresa la nueva clave" })
  claveNueva!: string;
}
