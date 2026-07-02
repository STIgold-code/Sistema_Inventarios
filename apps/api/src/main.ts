import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Railway (y cualquier PaaS) sirve la app detras de un proxy inverso. Sin esto,
  // Express veria siempre la IP del proxy y el rate limiting agruparia a TODOS los
  // clientes bajo una sola IP, bloqueandolos entre si. Con trust proxy = 1 se toma
  // la IP real del cliente desde el primer salto de X-Forwarded-For, que es lo que
  // usa el ThrottlerGuard para rastrear por IP.
  app.set("trust proxy", 1);

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
