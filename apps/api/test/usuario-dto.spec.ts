import { LoginDto } from "../src/auth/dto/login.dto.js";
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
} from "../src/modulos/usuarios/dto/usuario.dto.js";
import { validarCuerpo } from "./apoyo/validar-cuerpo.js";

/** Validacion de los DTOs de usuarios con el ValidationPipe real de la app. */
describe("DTOs de administracion de usuarios (ValidationPipe real)", () => {
  const ALTA_VALIDA = {
    email: "maria.lopez@bm.com",
    nombre: "Maria",
    clave: "Inicial-Segura-2026",
    rolIds: [1],
  };

  it.each(["nombre", "email", "rolIds"])(
    "PATCH rechaza %s: null con 400 (no lo deja pasar como omitido)",
    async (campo) => {
      const resultado = await validarCuerpo(ActualizarUsuarioDto, { [campo]: null });
      expect(resultado.valido).toBe(false);
    },
  );

  it("PATCH acepta campos omitidos (el servicio exige al menos uno)", async () => {
    const resultado = await validarCuerpo(ActualizarUsuarioDto, {});
    expect(resultado.valido).toBe(true);
  });

  it("PATCH rechaza una lista de roles vacia", async () => {
    const resultado = await validarCuerpo(ActualizarUsuarioDto, { rolIds: [] });
    expect(resultado).toEqual({ valido: false, mensajes: ["Asigna al menos un rol"] });
  });

  it.each([
    ["por encima de MAX_SAFE_INTEGER", [Number.MAX_SAFE_INTEGER + 2]],
    ["con 1e20", [1e20]],
    ["con textos", ["1"]],
    ["con decimales", [2.5]],
  ])("alta y PATCH rechazan rolIds %s", async (_caso, rolIds) => {
    const alta = await validarCuerpo(CrearUsuarioDto, { ...ALTA_VALIDA, rolIds });
    const edicion = await validarCuerpo(ActualizarUsuarioDto, { rolIds });
    expect(alta.valido).toBe(false);
    expect(edicion.valido).toBe(false);
  });

  it("el alta acepta el id de rol maximo seguro", async () => {
    const resultado = await validarCuerpo(CrearUsuarioDto, {
      ...ALTA_VALIDA,
      rolIds: [Number.MAX_SAFE_INTEGER],
    });
    expect(resultado.valido).toBe(true);
  });

  it("el alta y el login aceptan el correo con espacios y lo recortan antes de validar", async () => {
    const alta = await validarCuerpo(CrearUsuarioDto, {
      ...ALTA_VALIDA,
      email: "  Maria.Lopez@BM.com ",
    });
    expect(alta).toEqual({
      valido: true,
      valor: expect.objectContaining({ email: "Maria.Lopez@BM.com" }),
    });

    const ingreso = await validarCuerpo(LoginDto, {
      email: " Maria.Lopez@BM.com  ",
      clave: "Inicial-Segura-2026",
    });
    expect(ingreso).toEqual({
      valido: true,
      valor: expect.objectContaining({ email: "Maria.Lopez@BM.com" }),
    });
  });
});
