-- AlterTable
ALTER TABLE "threads" ADD COLUMN "locked_by" TEXT,
ADD COLUMN "locked_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "threads_status_idx" ON "threads"("status");

-- CreateIndex
CREATE INDEX "threads_workspace_id_status_idx" ON "threads"("workspace_id", "status");
