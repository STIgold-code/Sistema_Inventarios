import { ConceptoContable } from "@prisma/client";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

/// Una fila de configuracion de cuenta para un concepto contable.
export class CuentaContableDto {
  @IsEnum(ConceptoContable)
  concepto!: ConceptoContable;

  @IsString()
  @MinLength(1)
  cuentaDebe!: string;

  @IsString()
  @MinLength(1)
  cuentaHaber!: string;
}

/// Payload del PUT: reemplaza la configuracion de cuentas de la empresa.
export class ActualizarCuentasDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CuentaContableDto)
  cuentas!: CuentaContableDto[];
}
