import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Recortar } from "../../../comun/decoradores/recortar.decorator.js";
import { SiSeEnvia } from "../../../comun/decoradores/si-se-envia.decorator.js";

/** Tope defensivo de roles por usuario en una sola peticion. */
const MAXIMO_ROLES = 50;

/**
 * Las claves solo se validan en forma aqui: sus reglas (largo en bytes, lista
 * de prohibidas, correo) viven en `validarClaveNueva` (auth/clave.ts).
 * El correo se recorta aqui y se normaliza (minusculas) en el servicio.
 */
export class CrearUsuarioDto {
  @Recortar()
  @IsEmail({}, { message: "Correo invalido" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: "Ingresa el nombre" })
  @MaxLength(120)
  nombre!: string;

  @IsString()
  @IsNotEmpty({ message: "Ingresa la clave inicial" })
  clave!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "Asigna al menos un rol" })
  @ArrayMaxSize(MAXIMO_ROLES)
  @IsInt({ each: true })
  @Min(1, { each: true })
  // Sin tope, un id mayor pierde precision al parsear el JSON o desborda int8.
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  rolIds!: number[];
}

/** Todos los campos son opcionales; `rolIds`, si se envia, REEMPLAZA los roles. */
export class ActualizarUsuarioDto {
  @SiSeEnvia()
  @Recortar()
  @IsEmail({}, { message: "Correo invalido" })
  @MaxLength(254)
  email?: string;

  @SiSeEnvia()
  @IsString()
  @IsNotEmpty({ message: "Ingresa el nombre" })
  @MaxLength(120)
  nombre?: string;

  @SiSeEnvia()
  @IsArray()
  @ArrayMinSize(1, { message: "Asigna al menos un rol" })
  @ArrayMaxSize(MAXIMO_ROLES)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(Number.MAX_SAFE_INTEGER, { each: true })
  rolIds?: number[];
}

export class RestablecerClaveDto {
  @IsString()
  @IsNotEmpty({ message: "Ingresa la nueva clave" })
  clave!: string;
}
