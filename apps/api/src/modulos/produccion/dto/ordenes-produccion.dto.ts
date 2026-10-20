import { IsInt, IsOptional, IsString, Matches } from "class-validator";

// Decimal estrictamente mayor a cero: rechaza "0", "0.0", "00.000", etc.
// El lookahead negativo descarta cualquier cadena compuesta solo por ceros.
const REGEX_DECIMAL = /^(?!0+(\.0+)?$)\d+(\.\d+)?$/;

export class CrearOrdenProduccionDto {
  @IsInt()
  formulaId!: number;

  // Cantidad de producto terminado a producir, en unidad de control.
  @Matches(REGEX_DECIMAL, { message: "cantidadPlanificada debe ser decimal positivo" })
  cantidadPlanificada!: string;

  @IsInt()
  almacenInsumosId!: number;

  @IsInt()
  almacenDestinoId!: number;

  @IsInt()
  centroCostoId!: number;

  @IsOptional()
  @IsInt()
  ordenTrabajoId?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class CerrarOrdenProduccionDto {
  // Cantidad de producto terminado realmente obtenida, en unidad de control.
  @Matches(REGEX_DECIMAL, { message: "cantidadProducida debe ser decimal positivo" })
  cantidadProducida!: string;

  // Si se informa, reemplaza al almacén de destino de la orden.
  @IsOptional()
  @IsInt()
  almacenDestinoId?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
