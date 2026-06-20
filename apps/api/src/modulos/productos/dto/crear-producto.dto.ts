import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

/** El stock minimo se recibe como string para no perder precision decimal. */
const REGEX_DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Alta de un producto junto con su primer SKU (codigo parlante).
 * El codigo parlante de BM tiene 14 digitos y sus 3 primeros codifican la familia.
 */
export class CrearProductoDto {
  @IsInt()
  @IsPositive()
  familiaId!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nombre!: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  // --- Datos del primer SKU ---

  @IsString()
  @Length(14, 14, { message: "codigoParlante debe tener exactamente 14 caracteres" })
  codigoParlante!: string;

  @IsInt()
  @IsPositive()
  unidadId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  codigoUnspsc?: string;

  @IsOptional()
  @IsString()
  codigoBarras?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreSku?: string;

  @IsOptional()
  @IsString()
  tipoExistencia?: string; // SUNAT Tabla 13 (default 01)

  @IsOptional()
  @IsString()
  metodoValuacion?: string; // SUNAT Tabla 14 (default 2)

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "stockMinimo debe ser decimal positivo" })
  stockMinimo?: string;

  // --- Multi-unidad (opcional) ---
  // Unidad alternativa en la que se podra capturar cantidades en compras/ventas/vales.
  @IsOptional()
  @IsInt()
  @IsPositive()
  unidadReferenciaId?: number;

  // Cuantas unidades de control equivalen a UNA unidad de referencia (> 0).
  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "factorConversion debe ser decimal positivo" })
  factorConversion?: string;

  // --- Precios de venta por nivel (opcionales) ---
  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioPublico debe ser decimal positivo" })
  precioPublico?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioDistribuidor debe ser decimal positivo" })
  precioDistribuidor?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioVenta3 debe ser decimal positivo" })
  precioVenta3?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioVenta4 debe ser decimal positivo" })
  precioVenta4?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  monedaVenta?: string; // ISO-4217 (PEN, USD)
}

/**
 * Actualiza los precios de venta por nivel de un SKU existente. Todos los
 * campos son opcionales: solo se modifican los enviados (los omitidos se
 * conservan; enviar cadena vacia no esta permitido por el regex).
 */
export class ActualizarPreciosSkuDto {
  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioPublico debe ser decimal positivo" })
  precioPublico?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioDistribuidor debe ser decimal positivo" })
  precioDistribuidor?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioVenta3 debe ser decimal positivo" })
  precioVenta3?: string;

  @IsOptional()
  @Matches(REGEX_DECIMAL, { message: "precioVenta4 debe ser decimal positivo" })
  precioVenta4?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  monedaVenta?: string; // ISO-4217 (PEN, USD)
}
