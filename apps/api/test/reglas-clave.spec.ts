import {
  bytesDeClave,
  excedeLargoClave,
  validarClaveNueva,
} from "../src/auth/clave.js";

/** Reglas puras de clave nueva (sin BD). */
describe("Reglas de clave nueva", () => {
  const EMAIL = "rocio@bm.com";

  it("acepta una clave valida", () => {
    expect(validarClaveNueva("Inventario-Seguro-2026", EMAIL)).toBeNull();
  });

  it("exige al menos 8 caracteres", () => {
    expect(validarClaveNueva("Ab3$xyz", EMAIL)).toBe(
      "La nueva clave debe tener al menos 8 caracteres",
    );
  });

  it.each([
    "admin1234",
    "almacen1234",
    "compras1234",
    "ventas1234",
    "auditor1234",
    "ADMIN1234",
    "Password123",
    "12345678",
  ])("rechaza la clave prohibida %s sin distinguir mayusculas", (clave) => {
    expect(validarClaveNueva(clave, EMAIL)).toBe(
      "La nueva clave es demasiado comun o ya fue publicada; elige otra",
    );
  });

  it("rechaza una clave que contiene la parte local del correo, sin distinguir mayusculas", () => {
    expect(validarClaveNueva("MiClave-ROCIO-2026", EMAIL)).toBe(
      "La nueva clave no debe contener tu usuario de correo",
    );
  });

  it.each([
    [" admin1234", "espacio inicial"],
    ["admin1234 ", "espacio final"],
    ["contrasen\u0303a", "ñ descompuesta (n + tilde combinante)"],
    ["CONTRASEÑA", "ñ compuesta en mayusculas"],
    ["\uFF41\uFF44\uFF4D\uFF49\uFF4E\uFF11\uFF12\uFF13\uFF14", "ancho completo (NFKC)"],
    ["ÁDMIN1234", "mayusculas con tilde"],
  ])("normaliza antes de comparar con la lista: %j (%s)", (clave) => {
    expect(validarClaveNueva(clave, EMAIL)).toBe(
      "La nueva clave es demasiado comun o ya fue publicada; elige otra",
    );
  });

  it("normaliza la regla del correo: tildes en la clave o en el correo", () => {
    const MENSAJE = "La nueva clave no debe contener tu usuario de correo";
    expect(validarClaveNueva("Rocío2026", EMAIL)).toBe(MENSAJE);
    expect(validarClaveNueva("raul-2026-x", "raúl@bm.com")).toBe(MENSAJE);
    expect(validarClaveNueva("Roci\u0301o-2026" /* i + acento combinante */, EMAIL)).toBe(MENSAJE);
  });

  it("no aplica la regla del correo si la parte local tiene menos de 3 caracteres", () => {
    expect(validarClaveNueva("ab-segura-2026", "ab@bm.com")).toBeNull();
  });

  it("mide el largo maximo en bytes UTF-8, no en caracteres", () => {
    const ene36 = "ñ".repeat(36); // 36 caracteres, 72 bytes
    const ene37 = "ñ".repeat(37); // 37 caracteres, 74 bytes
    expect(bytesDeClave(ene36)).toBe(72);
    expect(excedeLargoClave(ene36)).toBe(false);
    expect(excedeLargoClave(ene37)).toBe(true);
    expect(validarClaveNueva(ene36, EMAIL)).toBeNull();
    expect(validarClaveNueva(ene37, EMAIL)).toMatch(/maximo 72 bytes/);
    expect(validarClaveNueva("a".repeat(73), EMAIL)).toMatch(/maximo 72 bytes/);
  });
});
