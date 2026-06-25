import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module.js";
import { FiltroExcepcionesPrisma } from "./comun/filtros/prisma-exception.filter.js";

/** Límite del cuerpo de la petición; las cargas masivas se envían por lotes. */
const LIMITE_CUERPO = "5mb";

// Las PK son BigInt y no son serializables a JSON por defecto.
// Las transportamos como string para no perder precision.
(
  BigInt.prototype as unknown as { toJSON: () => string }
).toJSON = function (): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use(json({ limit: LIMITE_CUERPO }));
  app.use(urlencoded({ extended: true, limit: LIMITE_CUERPO }));

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  // Traduce errores conocidos de Prisma (duplicados, etc.) a HTTP limpio.
  app.useGlobalFilters(new FiltroExcepcionesPrisma());

  // Railway inyecta PORT; en local cae a API_PUERTO o 4021.
  const puerto = Number(process.env.PORT ?? process.env.API_PUERTO ?? 4021);
  await app.listen(puerto, "0.0.0.0");
}

void bootstrap();
