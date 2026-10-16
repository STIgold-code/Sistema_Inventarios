import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { CorrelativoService } from "../src/modulos/comun/correlativo/correlativo.service.js";
import { AuditoriaService } from "../src/modulos/auditoria/auditoria.service.js";
import { ValesService } from "../src/modulos/vales/vales.service.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";
import { CrearValeSalidaDto, DespacharValeDto } from "../src/modulos/vales/dto/vales.dto.js";
import { validarCuerpo } from "./apoyo/validar-cuerpo.js";

/**
 * Integracion del vale de salida (hoja de cargo): crear -> autorizar ->
 * despachar genera una salida REAL del ledger (consumo FIFO), descuenta el
 * stock del almacen y enlaza el movimiento al vale. Despachar un vale no
 * autorizado debe fallar.
 */
describe("ValesService (integracion)", () => {
  const prisma = new PrismaService();
  const movimientos = new MovimientoService(prisma, new TiposCambioService(prisma), new AuditoriaService(prisma));
  const correlativos = new CorrelativoService();
  const vales = new ValesService(
    prisma,
    correlativos,
    movimientos,
    new AuditoriaService(prisma),
  );

  let usuario: UsuarioRequest;
  // Autorizador/despachador distinto del solicitante: la segregacion de
  // funciones impide que quien solicita el vale lo autorice o despache.
  let autorizador: UsuarioRequest;
  let almacenId: bigint;
  let centroCostoId: bigint;
  let skuId: bigint;
  const RUN = Date.now().toString().slice(-9);
  // Vales que NO llegan al ledger: se pueden borrar al final. Los despachados
  // quedan, porque el ledger (inmutable) apunta a ellos.
  const valesSinDespacho: bigint[] = [];

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
    almacenId = almacen.id;
    usuario = { id: admin.id, empresaId: empresa.id, email: admin.email, nombre: admin.nombre, permisos: [], debeCambiarClave: false };

    // Segundo usuario real (el FK autorizadoPorId lo exige) para autorizar/despachar.
    const segundo = await prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        email: `autorizador${RUN}@test.com`,
        hashClave: "x",
        nombre: "Autorizador test",
      },
    });
    autorizador = {
      id: segundo.id,
      empresaId: empresa.id,
      email: segundo.email,
      nombre: segundo.nombre,
      permisos: [],
      debeCambiarClave: false,
    };

    const centro = await prisma.centroCosto.create({
      data: { empresaId: empresa.id, codigo: `CC${RUN}`, nombre: "Obra test" },
    });
    centroCostoId = centro.id;

    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const producto = await prisma.producto.create({
      data: { empresaId: empresa.id, familiaId: familia.id, nombre: "Vale test" },
    });
    const sku = await prisma.sku.create({
      data: { empresaId: empresa.id, productoId: producto.id, codigoParlante: `3${RUN}0001`, unidadId: unidad.id },
    });
    skuId = sku.id;
    // Stock inicial: 100 unidades al costo 5.
    await movimientos.recibirCompra(usuario, { skuId, almacenId, cantidad: "100", costoUnitario: "5" });
  });

  afterAll(async () => {
    await prisma.registroAuditoria.deleteMany({
      where: { entidad: "VALE_SALIDA", entidadId: { in: valesSinDespacho } },
    });
    await prisma.valeSalida.deleteMany({ where: { id: { in: valesSinDespacho } } });
    await prisma.$disconnect();
  });

  it("autoriza y despacha descontando stock real y creando el movimiento", async () => {
    const antes = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    const dispAntes = new Prisma.Decimal(antes.cantidadDisponible).toNumber();

    const vale = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      destino: "Frente 1",
      lineas: [{ skuId, cantidad: "30" }],
    });

    await vales.autorizar(autorizador, BigInt(vale.id));
    await vales.despachar(autorizador, BigInt(vale.id));

    // Stock disponible descontado en 30.
    const despues = await prisma.itemStock.findFirstOrThrow({ where: { skuId, almacenId } });
    expect(new Prisma.Decimal(despues.cantidadDisponible).toNumber()).toBe(dispAntes - 30);

    // El vale queda DESPACHADO con cantidadDespachada y movimiento enlazado.
    const guardado = await prisma.valeSalida.findUniqueOrThrow({
      where: { id: BigInt(vale.id) },
      include: { lineas: true },
    });
    expect(guardado.estado).toBe("DESPACHADO");
    const linea = guardado.lineas[0]!;
    expect(new Prisma.Decimal(linea.cantidadDespachada).toNumber()).toBe(30);
    expect(linea.movimientoStockId).not.toBeNull();

    // El movimiento del ledger apunta al vale (documentoTipo VALE_SALIDA, documentoId poblado).
    const mov = await prisma.movimientoStock.findUniqueOrThrow({
      where: { id: linea.movimientoStockId! },
    });
    expect(mov.documentoTipo).toBe("VALE_SALIDA");
    expect(mov.documentoId).toBe(BigInt(vale.id));
    expect(mov.tipo).toBe("SALIDA_CONSUMO");
  });

  it("despachar un vale no autorizado falla", async () => {
    const vale = await vales.crear(usuario, {
      almacenId,
      centroCostoId,
      destino: "Frente 2",
      lineas: [{ skuId, cantidad: "5" }],
    });

    // Aun en BORRADOR: no se puede despachar.
    await expect(vales.despachar(usuario, BigInt(vale.id))).rejects.toThrow();

    // El stock no se toco y el vale sigue en BORRADOR.
    const guardado = await prisma.valeSalida.findUniqueOrThrow({ where: { id: BigInt(vale.id) } });
    expect(guardado.estado).toBe("BORRADOR");
  });

  describe("comprobante fisico y persona que recibe", () => {
    function cuerpoVale(extra: object = {}): object {
      return {
        almacenId: Number(almacenId),
        centroCostoId: Number(centroCostoId),
        destino: "Frente papel",
        lineas: [{ skuId: Number(skuId), cantidad: "2" }],
        ...extra,
      };
    }

    it("guarda y devuelve el comprobante fisico y la persona que recibe", async () => {
      const { id } = await vales.crear(usuario, {
        almacenId,
        centroCostoId,
        destino: "Frente papel",
        comprobanteFisico: "001-036488",
        entregadoA: "Juan Quispe",
        lineas: [{ skuId, cantidad: "2" }],
      });
      valesSinDespacho.push(BigInt(id));

      const detalle = await vales.obtener(usuario.empresaId, BigInt(id));
      expect(detalle.comprobanteFisico).toBe("001-036488");
      expect(detalle.entregadoA).toBe("Juan Quispe");
      const enLista = (await vales.listar(usuario.empresaId)).find((v) => v.id === id)!;
      expect(enLista.comprobanteFisico).toBe("001-036488");
      expect(enLista.entregadoA).toBe("Juan Quispe");

      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "VALE_SALIDA", entidadId: BigInt(id), accion: "CREAR" },
      });
      expect(traza.detalle).toContain("001-036488");
    });

    it("registra en el despacho a quien recibe el material", async () => {
      const { id } = await vales.crear(usuario, {
        almacenId,
        centroCostoId,
        destino: "Frente papel",
        lineas: [{ skuId, cantidad: "3" }],
      });
      expect((await vales.obtener(usuario.empresaId, BigInt(id))).entregadoA).toBeNull();

      await vales.autorizar(autorizador, BigInt(id));
      await vales.despachar(autorizador, BigInt(id), new Map(), "Rosa Mamani");

      const detalle = await vales.obtener(usuario.empresaId, BigInt(id));
      expect(detalle.estado).toBe("DESPACHADO");
      expect(detalle.entregadoA).toBe("Rosa Mamani");
      const traza = await prisma.registroAuditoria.findFirstOrThrow({
        where: { entidad: "VALE_SALIDA", entidadId: BigInt(id), accion: "DESPACHAR" },
      });
      expect(traza.detalle).toContain("Rosa Mamani");
    });

    it("despachar sin indicar quien recibe conserva el dato registrado al crear", async () => {
      const { id } = await vales.crear(usuario, {
        almacenId,
        centroCostoId,
        destino: "Frente papel",
        entregadoA: "Carlos Huaman",
        lineas: [{ skuId, cantidad: "1" }],
      });
      await vales.autorizar(autorizador, BigInt(id));
      await vales.despachar(autorizador, BigInt(id));

      expect((await vales.obtener(usuario.empresaId, BigInt(id))).entregadoA).toBe("Carlos Huaman");
    });

    it("el DTO recorta los textos y rechaza null o mas de 120 caracteres", async () => {
      const recortado = await validarCuerpo(
        CrearValeSalidaDto,
        cuerpoVale({ comprobanteFisico: " 001-036489 ", entregadoA: "  Ana Flores " }),
      );
      if (!recortado.valido) throw new Error(recortado.mensajes.join("; "));
      expect(recortado.valor.comprobanteFisico).toBe("001-036489");
      expect(recortado.valor.entregadoA).toBe("Ana Flores");

      const LARGO = "x".repeat(121);
      expect((await validarCuerpo(CrearValeSalidaDto, cuerpoVale({ comprobanteFisico: LARGO }))).valido).toBe(false);
      expect((await validarCuerpo(CrearValeSalidaDto, cuerpoVale({ entregadoA: LARGO }))).valido).toBe(false);
      expect((await validarCuerpo(CrearValeSalidaDto, cuerpoVale({ comprobanteFisico: null }))).valido).toBe(false);
      expect((await validarCuerpo(CrearValeSalidaDto, cuerpoVale({ entregadoA: null }))).valido).toBe(false);
      expect((await validarCuerpo(DespacharValeDto, { entregadoA: LARGO })).valido).toBe(false);
      expect((await validarCuerpo(DespacharValeDto, { entregadoA: null })).valido).toBe(false);

      const despacho = await validarCuerpo(DespacharValeDto, { entregadoA: " Luis Rojas " });
      if (!despacho.valido) throw new Error(despacho.mensajes.join("; "));
      expect(despacho.valor.entregadoA).toBe("Luis Rojas");
      expect((await validarCuerpo(DespacharValeDto, {})).valido).toBe(true);
    });
  });
});
