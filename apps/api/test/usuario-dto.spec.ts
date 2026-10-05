import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { LoginDto } from "../src/auth/dto/login.dto.js";
import {
  ActualizarUsuarioDto,
  CrearUsuarioDto,
} from "../src/modulos/usuarios/dto/usuario.dto.js";

/**
 * Validacion de DTOs tal como la aplica el ValidationPipe global
 * (plainToInstance + validate, con whitelist).
 */
async function erroresDe<T extends object>(
  clase: new () => T,
  cuerpo: Record<string, unknown>,
): Promise<{ instancia: T; propiedades: string[] }> {
  const instancia = plainToInstance(clase, cuerpo);
  const errores = await validate(instancia, { whitelist: true });
  return { instancia, propiedades: errores.map((e) => e.property) };
}

describe("DTOs de administracion de usuarios", () => {
  it.each(["nombre", "email", "rolIds"])(
    "PATCH rechaza %s: null con 400 (no lo deja pasar como omitido)",
    async (campo) => {
      const { propiedades } = await erroresDe(ActualizarUsuarioDto, { [campo]: null });
      expect(propiedades).toEqual([campo]);
    },
  );

  it("PATCH acepta campos omitidos (el servicio exige al menos uno)", async () => {
    const { propiedades } = await erroresDe(ActualizarUsuarioDto, {});
    expect(propiedades).toEqual([]);
  });

  it("PATCH rechaza una lista de roles vacia", async () => {
    const { propiedades } = await erroresDe(ActualizarUsuarioDto, { rolIds: [] });
    expect(propiedades).toEqual(["rolIds"]);
  });

  it("el alta y el login aceptan el correo con espacios y lo recortan antes de validar", async () => {
    const alta = await erroresDe(CrearUsuarioDto, {
      email: "  Maria.Lopez@BM.com ",
      nombre: "Maria",
      clave: "Inicial-Segura-2026",
      rolIds: [1],
    });
    expect(alta.propiedades).toEqual([]);
    expect(alta.instancia.email).toBe("Maria.Lopez@BM.com");

    const ingreso = await erroresDe(LoginDto, {
      email: " Maria.Lopez@BM.com  ",
      clave: "Inicial-Segura-2026",
    });
    expect(ingreso.propiedades).toEqual([]);
    expect(ingreso.instancia.email).toBe("Maria.Lopez@BM.com");
  });
});
