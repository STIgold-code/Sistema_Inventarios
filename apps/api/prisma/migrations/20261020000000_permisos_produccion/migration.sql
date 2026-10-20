-- Permisos del módulo de producción.
-- El despliegue ejecuta `prisma migrate deploy` pero no el seed, así que el catálogo
-- de permisos nuevos y su asignación al rol de sistema (ADMIN) de cada empresa
-- viajan con el código. Idempotente: se puede volver a ejecutar sin efecto.

INSERT INTO "permiso" ("codigo", "nombre") VALUES
  ('formula.gestionar', 'Gestionar fórmulas de producción'),
  ('produccion.gestionar', 'Gestionar órdenes de producción'),
  ('produccion.cerrar', 'Cerrar órdenes de producción (ingreso valorizado)')
ON CONFLICT ("codigo") DO NOTHING;

INSERT INTO "rol_permiso" ("rol_id", "permiso_id")
SELECT r."id", p."id"
FROM "rol" r
CROSS JOIN "permiso" p
WHERE r."codigo" = 'ADMIN'
  AND p."codigo" IN ('formula.gestionar', 'produccion.gestionar', 'produccion.cerrar')
ON CONFLICT ("rol_id", "permiso_id") DO NOTHING;
