import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail({}, { message: "Correo invalido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "La clave debe tener al menos 8 caracteres" })
  clave!: string;
}
