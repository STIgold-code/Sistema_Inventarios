/**
 * Crea los roles del equipo de BM con permisos acotados y un usuario por rol.
 * Uso: pnpm --filter @bm/api exec dotenv -e ../../.env -- tsx prisma/seed-usuarios.ts
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcrypt";

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

// Usuario por rol.
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

  for (const u of USUARIOS) {
    const rol = await prisma.rol.findFirstOrThrow({
      where: { empresaId: empresa.id, codigo: u.rol },
    });
    const hashClave = await bcrypt.hash(u.clave, 10);
    const usuario = await prisma.usuario.upsert({
      where: { empresaId_email: { empresaId: empresa.id, email: u.email } },
      update: { nombre: u.nombre, hashClave },
      create: { empresaId: empresa.id, email: u.email, hashClave, nombre: u.nombre },
    });
    await prisma.usuarioRol.upsert({
      where: { usuarioId_rolId: { usuarioId: usuario.id, rolId: rol.id } },
      update: {},
      create: { usuarioId: usuario.id, rolId: rol.id },
    });
  }

  console.log("Usuarios del equipo creados:");
  for (const u of USUARIOS) {
    console.log(`  ${u.rol.padEnd(11)} | ${u.email} | ${u.clave}`);
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
