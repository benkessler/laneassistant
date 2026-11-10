-- AlterTable: Add new fields to workspaces
ALTER TABLE "workspaces"
ADD COLUMN "slack_app_token" TEXT,
ADD COLUMN "installed_by" TEXT,
ADD COLUMN "oauth_access_token" TEXT,
ADD COLUMN "oauth_refresh_token" TEXT,
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: subscriptions
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT NOT NULL,
    "stripe_sub_id" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tier" TEXT NOT NULL DEFAULT 'free',
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: usage_records
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "tool_executions" INTEGER NOT NULL DEFAULT 0,
    "llm_cost_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_workspace_id_key" ON "subscriptions"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_customer_id_key" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_sub_id_key" ON "subscriptions"("stripe_sub_id");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_workspace_id_date_key" ON "usage_records"("workspace_id", "date");

-- CreateIndex
CREATE INDEX "usage_records_workspace_id_date_idx" ON "usage_records"("workspace_id", "date");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
