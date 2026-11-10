-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('INITIALIZING', 'READY', 'DEPLOYING', 'ACTIVE', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "SpaceEnvironment" AS ENUM ('PREVIEW', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "SpaceDeployStatus" AS ENUM ('PENDING', 'BUILDING', 'DEPLOYING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "spaces" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SpaceStatus" NOT NULL DEFAULT 'INITIALIZING',
    "sandbox_path" TEXT NOT NULL,
    "domain" TEXT,
    "preview_url" TEXT,
    "production_url" TEXT,
    "convex_url_dev" TEXT,
    "convex_url_prod" TEXT,
    "project_secret" TEXT NOT NULL,
    "last_deployed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_deployments" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "environment" "SpaceEnvironment" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "SpaceDeployStatus" NOT NULL DEFAULT 'PENDING',
    "url" TEXT,
    "vercel_url" TEXT,
    "convex_deployment" TEXT,
    "commit_message" TEXT,
    "build_log" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_variables" (
    "id" TEXT NOT NULL,
    "space_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "space_variables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "spaces_domain_key" ON "spaces"("domain");

-- CreateIndex
CREATE INDEX "spaces_workspace_id_status_idx" ON "spaces"("workspace_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "spaces_workspace_id_name_key" ON "spaces"("workspace_id", "name");

-- CreateIndex
CREATE INDEX "space_deployments_space_id_created_at_idx" ON "space_deployments"("space_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "space_variables_space_id_key_key" ON "space_variables"("space_id", "key");

-- AddForeignKey
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_deployments" ADD CONSTRAINT "space_deployments_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_variables" ADD CONSTRAINT "space_variables_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "spaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
