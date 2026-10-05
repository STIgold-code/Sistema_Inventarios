import { HttpException } from "@nestjs/common";

/** Espera que la promesa falle con una HttpException y devuelve su cuerpo JSON. */
export async function cuerpoDelError(promesa: Promise<unknown>): Promise<unknown> {
  const error: unknown = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  if (!(error instanceof HttpException)) {
    throw new Error(`Se esperaba una HttpException y se obtuvo: ${String(error)}`);
  }
  return error.getResponse();
}
