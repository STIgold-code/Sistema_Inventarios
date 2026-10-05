/**
 * Forma canonica del correo de un usuario: sin espacios en los extremos y en
 * minusculas. Todo correo que se persiste pasa por aqui.
 */
export function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}
