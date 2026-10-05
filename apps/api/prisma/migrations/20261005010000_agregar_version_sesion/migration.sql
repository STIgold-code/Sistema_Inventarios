-- Version de sesion por usuario. Viaja en el JWT (claim `ver`); al revocar las
-- sesiones (cambio o restablecimiento de clave) se incrementa y los access
-- tokens emitidos antes quedan invalidos sin esperar a que expiren.
ALTER TABLE "usuario" ADD COLUMN "version_sesion" INTEGER NOT NULL DEFAULT 0;
