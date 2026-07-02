import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AuthService } from "./auth.service.js";

/**
 * Tareas programadas del modulo de autenticacion.
 */
@Injectable()
export class TareasAuthService {
  private readonly logger = new Logger(TareasAuthService.name);

  constructor(private readonly auth: AuthService) {}

  /**
   * Purga diaria de tokens de refresh obsoletos (expirados o revocados hace
   * tiempo). Se ejecuta de madrugada para no competir con el trafico real.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgarTokensObsoletos(): Promise<void> {
    const borrados = await this.auth.purgarTokensObsoletos();
    this.logger.log(
      `Purga de tokens de refresh: ${borrados} registro(s) eliminado(s).`,
    );
  }
}
