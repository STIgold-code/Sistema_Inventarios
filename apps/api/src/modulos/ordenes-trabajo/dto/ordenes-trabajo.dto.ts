import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CrearOrdenTrabajoDto {
  @IsString()
  @MinLength(1, { message: "descripcion es obligatoria" })
  descripcion!: string;

  @IsInt()
  centroCostoId!: number;
}

export class ActualizarOrdenTrabajoDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "descripcion no puede estar vacia" })
  descripcion?: string;

  @IsOptional()
  @IsInt()
  centroCostoId?: number;
}
