import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { Recortar } from "../../../comun/decoradores/recortar.decorator.js";

/** Tope defensivo de roles por usuario en una sola peticion. */
const MAXIMO_ROLES = 50;

/**
 * Opcional SOLO si se omite. A diferencia de @IsOptional(), un `null`
 * explicito sigue validandose y se rechaza con 400.
 */
const SiSeEnvia = (): PropertyDecorator =>
  ValidateIf((_objeto: object, valor: unknown) => valor !== undefined);

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
  rolIds?: number[];
}

export class RestablecerClaveDto {
  @IsString()
  @IsNotEmpty({ message: "Ingresa la nueva clave" })
  clave!: string;
}
