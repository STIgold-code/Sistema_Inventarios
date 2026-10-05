-- Clave temporal: marca a los usuarios cuya clave vigente fue fijada por un
-- tercero (seed, alta o restablecimiento). Mientras este en true, la API solo
-- permite al usuario cambiar su clave.
ALTER TABLE "usuario" ADD COLUMN "debe_cambiar_clave" BOOLEAN NOT NULL DEFAULT false;

-- Todas las claves existentes estan escritas en el repositorio (seeds), por lo
-- que se obliga a rotarlas en el proximo ingreso.
UPDATE "usuario" SET "debe_cambiar_clave" = true;
