import { IsEmail, IsString, MinLength } from "class-validator";
import { Recortar } from "../../comun/decoradores/recortar.decorator.js";

export class LoginDto {
  // Se recorta para aceptar el correo con espacios; las mayusculas las
  // normaliza AuthService.login.
  @Recortar()
  @IsEmail({}, { message: "Correo invalido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "La clave debe tener al menos 8 caracteres" })
  clave!: string;
}
