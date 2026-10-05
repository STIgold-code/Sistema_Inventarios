/**
 * Crea los roles del equipo de BM con permisos acotados y los usuarios del equipo.
 * Uso: pnpm --filter @bm/api exec dotenv -e ../../.env -- tsx prisma/seed-usuarios.ts
 */
import { PrismaClient } from "@prisma/client";
import { hashearClave } from "../src/auth/clave.js";

const prisma = new PrismaClient();

// Rol -> permisos que le corresponden.
const ROLES: Record<string, { nombre: string; permisos: string[] }> = {
  ALMACENERO: {
    nombre: "Almacenero",
    permisos: ["producto.ver", "inventario.ver", "inventario.movimiento.crear"],
  },
  COMPRAS: {
    nombre: "Compras",
    permisos: ["producto.ver", "inventario.ver", "compra.gestionar"],
  },
  VENTAS: {
    nombre: "Ventas",
    permisos: ["producto.ver", "inventario.ver", "venta.gestionar"],
  },
  AUDITOR: {
    nombre: "Auditor",
    permisos: ["producto.ver", "inventario.ver", "reporte.ver"],
  },
};

// Usuarios del equipo. El rol ADMIN lo crea seed.ts.
const USUARIOS: Array<{ email: string; clave: string; nombre: string; rol: string }> = [
  { email: "almacenero@bmingenieros.pe", clave: "almacen1234", nombre: "Almacenero", rol: "ALMACENERO" },
  { email: "compras@bmingenieros.pe", clave: "compras1234", nombre: "Encargado de Compras", rol: "COMPRAS" },
  { email: "ventas@bmingenieros.pe", clave: "ventas1234", nombre: "Encargado de Ventas", rol: "VENTAS" },
  { email: "auditor@bmingenieros.pe", clave: "auditor1234", nombre: "Auditor", rol: "AUDITOR" },
];

async function main(): Promise<void> {
  const empresa = await prisma.empresa.findFirstOrThrow();

  for (const [codigo, def] of Object.entries(ROLES)) {
    const rol = await prisma.rol.upsert({
      where: { empresaId_codigo: { empresaId: empresa.id, codigo } },
      update: { nombre: def.nombre },
      create: { empresaId: empresa.id, codigo, nombre: def.nombre },
    });
    for (const codigoPermiso of def.permisos) {
      const permiso = await prisma.permiso.findUnique({ where: { codigo: codigoPermiso } });
      if (!permiso) continue;
      await prisma.rolPermiso.upsert({
        where: { rolId_permisoId: { rolId: rol.id, permisoId: permiso.id } },
        update: {},
        create: { rolId: rol.id, permisoId: permiso.id },
      });
    }
  }

  const creados = new Set<string>();
  for (const u of USUARIOS) {
    const rol = await prisma.rol.findFirstOrThrow({
      where: { empresaId: empresa.id, codigo: u.rol },
    });
    const existente = await prisma.usuario.findUnique({
      where: { email: u.email },
      select: { id: true },
    });
    // Un usuario existente conserva su clave y sus roles (un administrador pudo
    // quitarle alguno): el seed solo actualiza el nombre.
    if (existente) {
      await prisma.usuario.update({ where: { id: existente.id }, data: { nombre: u.nombre } });
      continue;
    }
    // Usuario nuevo: clave inicial temporal (debe cambiarse al ingresar) y su rol.
    await prisma.usuario.create({
      data: {
        empresaId: empresa.id,
        email: u.email,
        hashClave: await hashearClave(u.clave),
        nombre: u.nombre,
        debeCambiarClave: true,
        roles: { create: { rolId: rol.id } },
      },
    });
    creados.add(u.email);
  }

  console.log("Usuarios del equipo (la clave solo se aplica a los creados ahora, como temporal):");
  for (const u of USUARIOS) {
    const estado = creados.has(u.email)
      ? `creado, clave temporal: ${u.clave}`
      : "ya existia, conserva su clave";
    console.log(`  ${u.rol.padEnd(11)} | ${u.email} | ${estado}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
