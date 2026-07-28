-- AlterTable: persist grossPay so lockPayroll can cap deductions without
-- reconstructing it from a possibly-clamped netPay
ALTER TABLE "PayrollItem" ADD COLUMN "grossPay" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: StockDeliveryItem quantities can be fractional (KG/LITRE/GRAM)
ALTER TABLE "StockDeliveryItem" ALTER COLUMN "orderedQty" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "StockDeliveryItem" ALTER COLUMN "cashierQty" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "StockDeliveryItem" ALTER COLUMN "counterQty" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "StockDeliveryItem" ALTER COLUMN "finalQty" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable: StockMovement quantities can be fractional (KG/LITRE/GRAM)
ALTER TABLE "StockMovement" ALTER COLUMN "qty" SET DATA TYPE DOUBLE PRECISION;
ALTER TABLE "StockMovement" ALTER COLUMN "previousQty" SET DATA TYPE DOUBLE PRECISION;

-- AlterEnum: bank-transfer deliveries sit here until admin confirms AP settlement
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING_SETTLEMENT';
