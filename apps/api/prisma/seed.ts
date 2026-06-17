import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

const prisma = new PrismaClient();
const aqui = dirname(fileURLToPath(import.meta.url));

interface FamiliaSemilla {
  codigo: string;
  nombre: string;
}

// Unidades de medida segun Tabla 6 SUNAT (UN/ECE Rec 20).
const UNIDADES: ReadonlyArray<{ codigo: string; nombre: string }> = [
  { codigo: "NIU", nombre: "Unidad" },
  { codigo: "KGM", nombre: "Kilogramo" },
  { codigo: "TNE", nombre: "Tonelada" },
  { codigo: "GRM", nombre: "Gramo" },
  { codigo: "MTR", nombre: "Metro" },
  { codigo: "MTK", nombre: "Metro cuadrado" },
  { codigo: "MTQ", nombre: "Metro cubico" },
  { codigo: "LTR", nombre: "Litro" },
  { codigo: "GLL", nombre: "Galon" },
  { codigo: "BX", nombre: "Caja" },
  { codigo: "PR", nombre: "Par" },
  { codigo: "SET", nombre: "Juego" },
  { codigo: "BG", nombre: "Bolsa" },
  { codigo: "CEN", nombre: "Ciento" },
  { codigo: "MLL", nombre: "Millar" },
];

// Permisos del sistema (recurso.accion).
const PERMISOS: ReadonlyArray<{ codigo: string; nombre: string }> = [
  { codigo: "producto.ver", nombre: "Ver productos" },
  { codigo: "producto.crear", nombre: "Crear productos" },
  { codigo: "producto.editar", nombre: "Editar productos" },
  { codigo: "inventario.ver", nombre: "Ver inventario y kardex" },
  { codigo: "inventario.movimiento.crear", nombre: "Registrar movimientos" },
  { codigo: "compra.gestionar", nombre: "Gestionar compras" },
  { codigo: "venta.gestionar", nombre: "Gestionar ventas" },
  { codigo: "reporte.ver", nombre: "Ver reportes" },
  { codigo: "activo.gestionar", nombre: "Gestionar activos fijos" },
  { codigo: "almacen.administrar", nombre: "Administrar almacenes y sucursales" },
];

async function main(): Promise<void> {
  // --- Empresa BM Ingenieros ---
  // TODO: reemplazar el RUC por el real de BM Ingenieros.
  const empresa = await prisma.empresa.upsert({
    where: { ruc: "20100000001" },
    update: {},
    create: {
      ruc: "20100000001",
      razonSocial: "BENITES MALPICA INGENIEROS S.A.C.",
      nombre: "BM ingenieros",
    },
  });

  // --- Sucursal Soledad ---
  const sucursal = await prisma.sucursal.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "SOLEDAD" } },
    update: {},
    create: { empresaId: empresa.id, codigo: "SOLEDAD", nombre: "Soledad" },
  });

  // --- Almacen principal (01 / ALREPO07) ---
  await prisma.almacen.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "01" } },
    update: {},
    create: {
      empresaId: empresa.id,
      sucursalId: sucursal.id,
      codigo: "01",
      nombre: "Almacen Principal",
    },
  });

  // --- Familias reales (53 grupos extraidos del Excel) ---
  const familias = JSON.parse(
    readFileSync(join(aqui, "familias.json"), "utf-8"),
  ) as FamiliaSemilla[];
  for (const fam of familias) {
    await prisma.familia.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: fam.codigo } },
      update: { nombre: fam.nombre },
      create: { empresaId: empresa.id, codigo: fam.codigo, nombre: fam.nombre },
    });
  }

  // --- Unidades de medida SUNAT ---
  for (const uni of UNIDADES) {
    await prisma.unidad.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo: uni.codigo } },
      update: { nombre: uni.nombre },
      create: { empresaId: empresa.id, codigo: uni.codigo, nombre: uni.nombre },
    });
  }

  // --- Permisos ---
  for (const per of PERMISOS) {
    await prisma.permiso.upsert({
      where: { codigo: per.codigo },
      update: { nombre: per.nombre },
      create: { codigo: per.codigo, nombre: per.nombre },
    });
  }

  // --- Rol ADMIN con todos los permisos ---
  const rolAdmin = await prisma.rol.upsert({
    where: { empresaId_codigo: { empresaId: empresa.id, codigo: "ADMIN" } },
    update: {},
    create: { empresaId: empresa.id, codigo: "ADMIN", nombre: "Administrador" },
  });
  const permisos = await prisma.permiso.findMany();
  for (const per of permisos) {
    await prisma.rolPermiso.upsert({
      where: { rolId_permisoId: { rolId: rolAdmin.id, permisoId: per.id } },
      update: {},
      create: { rolId: rolAdmin.id, permisoId: per.id },
    });
  }

  // --- Usuario administrador ---
  const hashClave = await bcrypt.hash("admin1234", 10);
  const admin = await prisma.usuario.upsert({
    where: { empresaId_email: { empresaId: empresa.id, email: "admin@bmingenieros.pe" } },
    update: {},
    create: {
      empresaId: empresa.id,
      email: "admin@bmingenieros.pe",
      hashClave,
      nombre: "Administrador",
    },
  });
  await prisma.usuarioRol.upsert({
    where: { usuarioId_rolId: { usuarioId: admin.id, rolId: rolAdmin.id } },
    update: {},
    create: { usuarioId: admin.id, rolId: rolAdmin.id },
  });

  console.log("Seed completado:");
  console.log(`  Empresa: ${empresa.nombre} (RUC ${empresa.ruc})`);
  console.log(`  Familias: ${familias.length}`);
  console.log(`  Unidades: ${UNIDADES.length}`);
  console.log(`  Permisos: ${PERMISOS.length}`);
  console.log(`  Usuario: admin@bmingenieros.pe / admin1234`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
