import { IsString, MinLength } from "class-validator";

/** Body de POST /auth/refresh y POST /auth/logout: el refresh token opaco. */
export class RefrescarDto {
  @IsString()
  @MinLength(1, { message: "El token de refresco es obligatorio" })
  refreshToken!: string;
}
