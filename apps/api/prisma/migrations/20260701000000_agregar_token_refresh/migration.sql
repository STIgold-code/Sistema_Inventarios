-- Token de refresco para renovacion silenciosa de sesion.
-- Se persiste unicamente el hash SHA-256 del token opaco (nunca el plano).
-- La rotacion encadena registros via reemplazado_por_id para detectar reuso.
CREATE TABLE "token_refresh" (
  "id" BIGSERIAL PRIMARY KEY,
  "usuario_id" BIGINT NOT NULL,
  "empresa_id" BIGINT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expira_en" TIMESTAMP(3) NOT NULL,
  "revocado_en" TIMESTAMP(3),
  "reemplazado_por_id" BIGINT,
  "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "token_refresh_token_hash_key" ON "token_refresh"("token_hash");
CREATE INDEX "token_refresh_usuario_id_idx" ON "token_refresh"("usuario_id");

ALTER TABLE "token_refresh"
  ADD CONSTRAINT "token_refresh_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "token_refresh"
  ADD CONSTRAINT "token_refresh_reemplazado_por_id_fkey"
  FOREIGN KEY ("reemplazado_por_id") REFERENCES "token_refresh"("id") ON DELETE SET NULL ON UPDATE CASCADE;
