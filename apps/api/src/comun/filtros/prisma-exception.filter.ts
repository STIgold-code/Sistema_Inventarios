import {
  type ArgumentsHost,
  Catch,
  ConflictException,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { Response } from "express";

/**
 * Filtro global que traduce los errores CONOCIDOS de Prisma a respuestas HTTP
 * limpias en TODO el sistema, en vez de dejar que burbujeen como 500 con stack.
 *
 * Centraliza lo que antes solo unos pocos servicios manejaban a mano (P2002).
 * Los servicios que ya capturan P2002 localmente con un mensaje específico
 * (p.ej. "Ya existe una sucursal con ese código") siguen ganando: este filtro
 * solo actúa sobre los errores de Prisma que no fueron atrapados antes.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class FiltroExcepcionesPrisma implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcepcionesPrisma.name);

  catch(
    excepcion: Prisma.PrismaClientKnownRequestError,
    host: ArgumentsHost,
  ): void {
    const respuesta = host.switchToHttp().getResponse<Response>();
    const http = this.traducir(excepcion);
    const estado = http.getStatus();

    // Solo registramos los inesperados; los 4xx son input del cliente.
    if (estado >= 500) {
      this.logger.error(`Prisma ${excepcion.code}: ${excepcion.message}`);
    }

    const cuerpo = http.getResponse();
    respuesta
      .status(estado)
      .json(
        typeof cuerpo === "string"
          ? { statusCode: estado, message: cuerpo }
          : cuerpo,
      );
  }

  private traducir(e: Prisma.PrismaClientKnownRequestError): HttpException {
    switch (e.code) {
      case "P2002": // violación de restricción única (registro duplicado)
        return new ConflictException("Ya existe un registro con esos datos.");
      case "P2025": // operación sobre un registro inexistente
        return new NotFoundException("El registro solicitado no existe.");
      case "P2003": // violación de clave foránea
        return new ConflictException(
          "No se puede completar la operación: hay datos relacionados.",
        );
      default:
        return new HttpException(
          "No se pudo procesar la operación.",
          HttpStatus.BAD_REQUEST,
        );
    }
  }
}
