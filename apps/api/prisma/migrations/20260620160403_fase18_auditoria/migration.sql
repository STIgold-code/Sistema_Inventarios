-- CreateTable
CREATE TABLE "registro_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "empresa_id" BIGINT NOT NULL,
    "usuario_id" BIGINT NOT NULL,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidad_id" BIGINT,
    "detalle" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registro_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registro_auditoria_empresa_id_entidad_entidad_id_idx" ON "registro_auditoria"("empresa_id", "entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "registro_auditoria_empresa_id_creado_en_idx" ON "registro_auditoria"("empresa_id", "creado_en");

-- CreateIndex
CREATE INDEX "registro_auditoria_empresa_id_usuario_id_idx" ON "registro_auditoria"("empresa_id", "usuario_id");

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_auditoria" ADD CONSTRAINT "registro_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
