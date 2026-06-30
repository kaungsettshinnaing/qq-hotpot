-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('STOCK', 'NON_STOCK');

-- CreateEnum
CREATE TYPE "StockCountType" AS ENUM ('SPOT', 'WEEKLY');

-- CreateTable
CREATE TABLE "StockCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCount" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "StockCountType" NOT NULL,
    "createdById" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockCountItem" (
    "id" TEXT NOT NULL,
    "countId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "actualQty" INTEGER,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,

    CONSTRAINT "StockCountItem_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "StockItem" ADD COLUMN "categoryId" TEXT;

-- AlterTable
ALTER TABLE "StockDelivery" ADD COLUMN "invoiceType" "InvoiceType" NOT NULL DEFAULT 'STOCK';

-- AlterTable
ALTER TABLE "StockDeliveryItem" ALTER COLUMN "stockItemId" DROP NOT NULL,
    ADD COLUMN "description" TEXT,
    ADD COLUMN "unitLabel" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN "previousQty" INTEGER;

-- CreateIndex
CREATE INDEX "StockCount_date_idx" ON "StockCount"("date");

-- CreateIndex
CREATE UNIQUE INDEX "StockCountItem_countId_stockItemId_key" ON "StockCountItem"("countId", "stockItemId");

-- CreateIndex
CREATE INDEX "StockCountItem_countId_idx" ON "StockCountItem"("countId");

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "StockCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCount" ADD CONSTRAINT "StockCount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_countId_fkey" FOREIGN KEY ("countId") REFERENCES "StockCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockCountItem" ADD CONSTRAINT "StockCountItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
