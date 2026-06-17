import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

// Las PK son BigInt y no son serializables a JSON por defecto.
// Las transportamos como string para no perder precision.
(
  BigInt.prototype as unknown as { toJSON: () => string }
).toJSON = function (): string {
  return this.toString();
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Railway inyecta PORT; en local cae a API_PUERTO o 4021.
  const puerto = Number(process.env.PORT ?? process.env.API_PUERTO ?? 4021);
  await app.listen(puerto, "0.0.0.0");
}

void bootstrap();
