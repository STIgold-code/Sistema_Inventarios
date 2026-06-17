import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../comun/prisma/prisma.service.js";

@Controller("salud")
export class SaludController {
  constructor(private readonly prisma: PrismaService) {}

  /** Healthcheck: confirma que la API responde y la base de datos contesta. */
  @Get()
  async verificar(): Promise<{ estado: string; baseDatos: string }> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { estado: "ok", baseDatos: "ok" };
  }
}
