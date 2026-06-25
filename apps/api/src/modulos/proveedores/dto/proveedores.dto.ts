import { IsEmail, IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CrearProveedorDto {
  @IsString()
  @Matches(/^\d{11}$/, { message: "El RUC debe tener 11 digitos" })
  ruc!: string;

  @IsString()
  @MinLength(1)
  razonSocial!: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: "Ingresa un email valido" })
  email?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsString()
  monedaHabitual?: string;

  @IsOptional()
  @IsString()
  cci?: string;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  tipoDocIdentidad?: string;
}

export class ActualizarProveedorDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  razonSocial?: string;

  @IsOptional()
  @IsString()
  direccion?: string;

  @IsOptional()
  @IsString()
  telefono?: string;

  @IsOptional()
  @IsEmail({}, { message: "Ingresa un email valido" })
  email?: string;

  @IsOptional()
  @IsString()
  condicionPago?: string;

  @IsOptional()
  @IsString()
  monedaHabitual?: string;

  @IsOptional()
  @IsString()
  cci?: string;

  @IsOptional()
  @IsString()
  contactoNombre?: string;

  @IsOptional()
  @IsString()
  tipoDocIdentidad?: string;
}
