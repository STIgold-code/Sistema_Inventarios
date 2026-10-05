import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../src/comun/prisma/prisma.service.js";
import {
  AuditoriaService,
  type DatosAuditoria,
} from "../../src/modulos/auditoria/auditoria.service.js";

/** Espera maxima de la barrera: si no llegan todos, el que espera sigue solo. */
const ESPERA_BARRERA_MS = 500;

/**
 * Barrera para forzar el solapamiento de dos transacciones: cada una espera a
 * que la otra llegue al mismo punto (o a que venza la espera). Sin el bloqueo
 * de administracion, ambas llegan y se verifican viendo al otro aun activo;
 * con el bloqueo, la segunda no puede llegar hasta que la primera termine.
 */
export function crearBarrera(participantes: number): () => Promise<void> {
  let llegados = 0;
  let abrir: () => void = () => undefined;
  const abierta = new Promise<void>((resolver) => {
    abrir = resolver;
  });
  return async () => {
    llegados++;
    if (llegados >= participantes) abrir();
    let temporizador: NodeJS.Timeout | undefined;
    const vencida = new Promise<void>((resolver) => {
      temporizador = setTimeout(resolver, ESPERA_BARRERA_MS);
    });
    await Promise.race([abierta, vencida]);
    clearTimeout(temporizador);
  };
}

/**
 * Auditoria que se detiene en la barrera antes de escribir. El registro ocurre
 * dentro de la transaccion, despues de la escritura y antes de la invariante:
 * justo la ventana que el bloqueo debe cerrar.
 */
export class AuditoriaConBarrera extends AuditoriaService {
  constructor(
    prisma: PrismaService,
    private readonly esperar: () => Promise<void>,
  ) {
    super(prisma);
  }

  override async registrar(datos: DatosAuditoria, tx?: Prisma.TransactionClient): Promise<void> {
    await this.esperar();
    return super.registrar(datos, tx);
  }
}
