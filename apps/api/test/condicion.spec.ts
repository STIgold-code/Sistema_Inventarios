import { Prisma } from "@prisma/client";
import { PrismaService } from "../src/comun/prisma/prisma.service.js";
import { MovimientoService } from "../src/modulos/inventario/movimientos/movimiento.service.js";
import { TiposCambioService } from "../src/modulos/tipos-cambio/tipos-cambio.service.js";
import { StockInsuficienteError } from "../src/modulos/inventario/movimientos/errores.js";
import type { UsuarioRequest } from "../src/comun/contexto/usuario-request.js";

/**
 * Tests de integracion de la discriminacion por CONDICION (buen uso vs
 * deteriorado). Verifican el invariante: marcar deteriorado mueve stock de
 * disponible a deteriorado SIN cambiar costo ni el total fisico; recuperar
 * revierte; dar de baja saca del deteriorado; y una venta nunca toma del
 * stock deteriorado.
 */
describe("Condicion deteriorado (integracion)", () => {
  const prisma = new PrismaService();
  const servicio = new MovimientoService(prisma, new TiposCambioService(prisma));

  let usuario: UsuarioRequest;
  let almacenId: bigint;
  let contadorSku = 0;
  const RUN = Date.now().toString().slice(-9);

  beforeAll(async () => {
    await prisma.$connect();
    const empresa = await prisma.empresa.findFirstOrThrow();
    const admin = await prisma.usuario.findFirstOrThrow({ where: { empresaId: empresa.id } });
    const almacen = await prisma.almacen.findFirstOrThrow({ where: { empresaId: empresa.id } });
    almacenId = almacen.id;
    usuario = {
      id: admin.id,
      empresaId: empresa.id,
      email: admin.email,
      nombre: admin.nombre,
      permisos: [],
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function crearSku(): Promise<bigint> {
    const empresaId = usuario.empresaId;
    const familia = await prisma.familia.findFirstOrThrow({ where: { empresaId } });
    const unidad = await prisma.unidad.findFirstOrThrow({ where: { empresaId } });
    const producto = await prisma.producto.create({
      data: { empresaId, familiaId: familia.id, nombre: `Condicion ${contadorSku}` },
    });
    contadorSku += 1;
    const codigo = `8${RUN}${contadorSku.toString().padStart(4, "0")}`;
    const sku = await prisma.sku.create({
      data: { empresaId, productoId: producto.id, codigoParlante: codigo, unidadId: unidad.id },
    });
    return sku.id;
  }

  function num(d: Prisma.Decimal | string): number {
    return new Prisma.Decimal(d).toNumber();
  }

  it("marcar deteriorado descuenta disponible y suma deteriorado sin cambiar costo ni el total fisico", async () => {
    const skuId = await crearSku();
    await servicio.recibirCompra(usuario, { skuId, almacenId, cantidad: "10", costoUnitario: "5" });

    await servicio.marcarDeteriorado(usuario, { skuId, almacenId, cantidad: "3", motivo: "Golpe en transporte" });

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId } });
    expect(num(item.cantidadDisponible)).toBe(7);
    expect(num(item.cantidadDeteriorada)).toBe(3);
    // El costo promedio no cambia: es la misma existencia.
    expect(num(item.costoPromedio)).toBe(5);
    // El total fisico (disponible + comprometida + deteriorada) sigue siendo 10.
    const fisico = num(item.cantidadDisponible) + num(item.cantidadComprometida) + num(item.cantidadDeteriorada);
    expect(fisico).toBe(10);

    // No se consumieron capas FIFO: la capa original queda intacta.
    const capa = await prisma.capaCosto.findFirstOrThrow({ where: { skuId } });
    expect(num(capa.cantidadRestante)).toBe(10);

    // Movimiento DETERIORO con snapshot de saldo fisico inalterado.
    const mov = await prisma.movimientoStock.findFirstOrThrow({ where: { skuId, tipo: "DETERIORO" } });
    expect(num(mov.saldoCantidad)).toBe(10);
  });

  it("recuperar revierte: devuelve de deteriorado a disponible", async () => {
    const skuId = await crearSku();
    await servicio.recibirCompra(usuario, { skuId, almacenId, cantidad: "10", costoUnitario: "5" });
    await servicio.marcarDeteriorado(usuario, { skuId, almacenId, cantidad: "4", motivo: "Revision" });

    await servicio.recuperarDeteriorado(usuario, { skuId, almacenId, cantidad: "4", motivo: "Reparado" });

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId } });
    expect(num(item.cantidadDisponible)).toBe(10);
    expect(num(item.cantidadDeteriorada)).toBe(0);
    expect(num(item.costoPromedio)).toBe(5);
  });

  it("dar de baja saca del deteriorado y reduce el total fisico", async () => {
    const skuId = await crearSku();
    await servicio.recibirCompra(usuario, { skuId, almacenId, cantidad: "10", costoUnitario: "5" });
    await servicio.marcarDeteriorado(usuario, { skuId, almacenId, cantidad: "6", motivo: "Daño" });

    await servicio.darDeBajaDeteriorado(usuario, { skuId, almacenId, cantidad: "2", motivo: "Irreparable" });

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId } });
    expect(num(item.cantidadDisponible)).toBe(4);
    expect(num(item.cantidadDeteriorada)).toBe(4);
    // El total fisico bajo de 10 a 8 (salida real del deteriorado).
    const fisico = num(item.cantidadDisponible) + num(item.cantidadComprometida) + num(item.cantidadDeteriorada);
    expect(fisico).toBe(8);

    // La baja consumio capas FIFO: quedan 8 en la capa.
    const capa = await prisma.capaCosto.findFirstOrThrow({ where: { skuId } });
    expect(num(capa.cantidadRestante)).toBe(8);
  });

  it("una venta NO puede tomar del stock deteriorado", async () => {
    const skuId = await crearSku();
    await servicio.recibirCompra(usuario, { skuId, almacenId, cantidad: "10", costoUnitario: "5" });
    // Deja 2 disponibles y 8 deteriorados.
    await servicio.marcarDeteriorado(usuario, { skuId, almacenId, cantidad: "8", motivo: "Mojado" });

    // Vender 5 debe fallar: solo hay 2 disponibles; los 8 deteriorados no cuentan.
    await expect(
      servicio.registrarSalidaVenta(usuario, { skuId, almacenId, cantidad: "5" }),
    ).rejects.toBeInstanceOf(StockInsuficienteError);

    // Vender hasta el disponible (2) si funciona.
    await expect(
      servicio.registrarSalidaVenta(usuario, { skuId, almacenId, cantidad: "2" }),
    ).resolves.toMatchObject({ costoSalida: "10" });

    const item = await prisma.itemStock.findFirstOrThrow({ where: { skuId } });
    expect(num(item.cantidadDisponible)).toBe(0);
    expect(num(item.cantidadDeteriorada)).toBe(8);
  });
});
