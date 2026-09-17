-- AlterTable
ALTER TABLE "CartridgeRequest" ADD COLUMN     "arrivedAt" TIMESTAMP(3),
ADD COLUMN     "arrivedById" TEXT;

-- AddForeignKey
ALTER TABLE "CartridgeRequest" ADD CONSTRAINT "CartridgeRequest_arrivedById_fkey" FOREIGN KEY ("arrivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
