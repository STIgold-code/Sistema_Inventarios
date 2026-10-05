-- El correo del usuario pasa a ser unico en TODAS las empresas: el login busca
-- por correo sin empresa, de modo que un duplicado en otra empresa dejaria a una
-- de las dos cuentas sin poder ingresar. La unicidad global implica la unicidad
-- por empresa, por lo que el indice compuesto anterior se elimina.

-- 1. Forma canonica: sin espacios en los extremos y en minusculas.
UPDATE "usuario" SET "email" = lower(btrim("email"));

-- 2. Unicidad global (falla si quedaran duplicados tras normalizar).
DROP INDEX "usuario_empresa_id_email_key";
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- 3. La BD exige la forma canonica a cualquier escritor (API, seeds, scripts).
--    Prisma no gestiona restricciones CHECK, asi que no genera deriva.
ALTER TABLE "usuario"
  ADD CONSTRAINT "usuario_email_normalizado_check" CHECK ("email" = lower(btrim("email")));
