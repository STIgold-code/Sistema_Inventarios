import { ActualizarRolDto, CrearRolDto } from "../src/modulos/roles/dto/rol.dto.js";
import { MENSAJE_CODIGO_ROL } from "../src/modulos/roles/reglas-rol.js";
import { validarCuerpo } from "./apoyo/validar-cuerpo.js";

/** Validacion de los DTOs de roles con el ValidationPipe real de la app. */
describe("DTOs de roles (ValidationPipe real)", () => {
  const ALTA_VALIDA = { codigo: "ALMACEN_2", nombre: "Almacen", permisoIds: [1] };

  it("el alta recorta el codigo antes de validarlo y conserva los ids", async () => {
    const resultado = await validarCuerpo(CrearRolDto, { ...ALTA_VALIDA, codigo: "  ALMACEN_2 " });

    expect(resultado).toEqual({
      valido: true,
      valor: expect.objectContaining({ codigo: "ALMACEN_2", permisoIds: [1] }),
    });
  });

  it.each(["almacen", "A", "X".repeat(31), "CON-GUION"])(
    "el alta rechaza el codigo %j",
    async (codigo) => {
      const resultado = await validarCuerpo(CrearRolDto, { ...ALTA_VALIDA, codigo });
      expect(resultado).toEqual({ valido: false, mensajes: [MENSAJE_CODIGO_ROL] });
    },
  );

  it.each(["codigo", "nombre", "permisoIds"])("el alta rechaza %s: null", async (campo) => {
    const resultado = await validarCuerpo(CrearRolDto, { ...ALTA_VALIDA, [campo]: null });
    expect(resultado.valido).toBe(false);
  });

  it.each([
    ["vacia", []],
    ["con decimales", [1.5]],
    ["con textos", ["1", "2"]],
    ["con cero", [0]],
    ["por encima de MAX_SAFE_INTEGER", [Number.MAX_SAFE_INTEGER + 2]],
    ["con 1e20", [1e20]],
    ["mas larga que el tope", Array.from({ length: 201 }, (_, i) => i + 1)],
  ])("el alta rechaza una lista de permisos %s", async (_caso, permisoIds) => {
    const resultado = await validarCuerpo(CrearRolDto, { ...ALTA_VALIDA, permisoIds });
    expect(resultado.valido).toBe(false);
  });

  it("el alta acepta el tope exacto de permisos y el id maximo seguro", async () => {
    const permisoIds = Array.from({ length: 199 }, (_, i) => i + 1).concat(Number.MAX_SAFE_INTEGER);
    const resultado = await validarCuerpo(CrearRolDto, { ...ALTA_VALIDA, permisoIds });
    expect(resultado.valido).toBe(true);
  });

  it.each([["NUEVO"], [null], [""]])(
    "la edicion rechaza cualquier codigo en el cuerpo (%j): es inmutable",
    async (codigo) => {
      const resultado = await validarCuerpo(ActualizarRolDto, { codigo, nombre: "Otro" });
      expect(resultado).toEqual({
        valido: false,
        mensajes: ["El codigo del rol no se puede modificar"],
      });
    },
  );

  it.each(["nombre", "permisoIds"])("la edicion rechaza %s: null", async (campo) => {
    const resultado = await validarCuerpo(ActualizarRolDto, { [campo]: null });
    expect(resultado.valido).toBe(false);
  });

  it("la edicion rechaza un id de permiso fuera del rango seguro", async () => {
    const resultado = await validarCuerpo(ActualizarRolDto, {
      permisoIds: [Number.MAX_SAFE_INTEGER + 2],
    });
    expect(resultado.valido).toBe(false);
  });

  it("la edicion acepta campos omitidos y descarta los desconocidos", async () => {
    const resultado = await validarCuerpo(ActualizarRolDto, { nombre: "Solo nombre", extra: 1 });
    expect(resultado).toEqual({ valido: true, valor: expect.objectContaining({ nombre: "Solo nombre" }) });
    expect(resultado.valido && "extra" in resultado.valor).toBe(false);
  });
});
