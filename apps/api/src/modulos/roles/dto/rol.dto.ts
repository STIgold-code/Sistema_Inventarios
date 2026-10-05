import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { NoModificable } from "../../../comun/decoradores/no-modificable.decorator.js";
import { Recortar } from "../../../comun/decoradores/recortar.decorator.js";
import { SiSeEnvia } from "../../../comun/decoradores/si-se-envia.decorator.js";
import { MENSAJE_CODIGO_ROL, REGEX_CODIGO_ROL } from "../reglas-rol.js";

/** Tope defensivo de permisos por rol en una sola peticion. */
const MAXIMO_PERMISOS = 200;

export class CrearRolDto {
  @Recortar()
  @IsString()
  @Matches(REGEX_CODIGO_ROL, { message: MENSAJE_CODIGO_ROL })
  codigo!: string;

  @IsString()
  @IsNotEmpty({ message: "Ingresa el nombre del rol" })
  @MaxLength(120)
  nombre!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Asigna al menos un permiso" })
  @ArrayMaxSize(MAXIMO_PERMISOS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  // Sin tope, un id mayor pierde precision al parsear el JSON o desborda int8.
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  permisoIds!: number[];
}

/**
 * Todos los campos son opcionales; `permisoIds`, si se envia, REEMPLAZA el
 * conjunto. El `codigo` es inmutable: si viene en el cuerpo se rechaza.
 */
export class ActualizarRolDto {
  @NoModificable("El codigo del rol no se puede modificar")
  codigo?: never;

  @SiSeEnvia()
  @IsString()
  @IsNotEmpty({ message: "Ingresa el nombre del rol" })
  @MaxLength(120)
  nombre?: string;

  @SiSeEnvia()
  @IsArray()
  @ArrayMinSize(1, { message: "Asigna al menos un permiso" })
  @ArrayMaxSize(MAXIMO_PERMISOS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  permisoIds?: number[];
}
