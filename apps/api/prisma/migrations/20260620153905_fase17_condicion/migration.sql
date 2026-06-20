-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TipoMovimiento" ADD VALUE 'DETERIORO';
ALTER TYPE "TipoMovimiento" ADD VALUE 'RECUPERACION';
ALTER TYPE "TipoMovimiento" ADD VALUE 'BAJA_DETERIORO';

-- AlterTable
ALTER TABLE "item_stock" ADD COLUMN     "cantidad_deteriorada" DECIMAL(20,8) NOT NULL DEFAULT 0;
