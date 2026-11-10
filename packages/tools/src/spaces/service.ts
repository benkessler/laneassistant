import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@openviktor/db";
import type { ConvexClient } from "./convex-client.js";
import type { VercelClient } from "./vercel-client.js";

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

interface SpacesServiceConfig {
	prisma: PrismaClient;
	convex: ConvexClient;
	vercel: VercelClient;
	spacesDir: string;
	spacesApiUrl?: string;
}

interface InitResult {
	success: boolean;
	projectName: string;
	sandboxPath: string;
	convexUrlDev: string;
	convexUrlProd: string;
	error?: string;
}

interface DeployResultOutput {
	success: boolean;
	environment: string;
	url: string;
	vercelUrl?: string;
	error?: string;
}

interface ListResult {
	apps: Array<{
		name: string;
		status: string;
		previewUrl: string | null;
		productionUrl: string | null;
	}>;
}

interface StatusResult {
	projectName: string;
	status: string;
	sandboxPath: string;
	convexUrlDev: string | null;
	convexUrlProd: string | null;
	previewUrl: string | null;
	productionUrl: string | null;
	lastDeployedAt: string | null;
}

interface QueryResultOutput {
	success: boolean;
	data: unknown;
	error?: string;
}

interface DeleteResultOutput {
	success: boolean;
	projectName: string;
	deletedResources: string[];
	error?: string;
}

function generateHexId(): string {
	return randomBytes(4).toString("hex");
}

function generateProjectSecret(): string {
	return `secret_${randomBytes(24).toString("hex")}`;
}

export class SpacesService {
	private prisma: PrismaClient;
	private convex: ConvexClient;
	private vercel: VercelClient;
	private spacesDir: string;
	private spacesApiUrl: string | undefined;

	constructor(config: SpacesServiceConfig) {
		this.prisma = config.prisma;
		this.convex = config.convex;
		this.vercel = config.vercel;
		this.spacesDir = config.spacesDir;
		this.spacesApiUrl = config.spacesApiUrl;
	}

	async initProject(workspaceId: string, name: string, description?: string): Promise<InitResult> {
		if (!name || name.length < 2 || name.length > 54 || !NAME_PATTERN.test(name)) {
			return {
				success: false,
				projectName: name,
				sandboxPath: "",
				convexUrlDev: "",
				convexUrlProd: "",
				error:
					"Invalid project name. Use 2-54 lowercase alphanumeric characters and hyphens. Must start and end with alphanumeric.",
			};
		}

		const sandboxPath = `${this.spacesDir}/${workspaceId}/viktor-spaces/${name}`;
		const hexId = generateHexId();
		const projectSecret = generateProjectSecret();

		const currentDir = dirname(fileURLToPath(import.meta.url));
		const templateDir = resolve(currentDir, "./template");
		mkdirSync(sandboxPath, { recursive: true });
		cpSync(templateDir, sandboxPath, { recursive: true });

		const convexResult = await this.convex.createProject(name);
		const vercelResult = await this.vercel.createProject(name);
		const domain = await this.vercel.setDomain(vercelResult.projectId, hexId, name);

		const space = await this.prisma.space.create({
			data: {
				workspaceId,
				name,
				description: description ?? null,
				status: "READY",
				sandboxPath,
				domain,
				previewUrl: `https://preview-${name}-${hexId}.${domain.split(".").slice(-2).join(".")}`,
				convexUrlDev: convexResult.devUrl,
				convexUrlProd: convexResult.prodUrl,
				convexProjectId: convexResult.projectId,
				convexDevDeployKey: convexResult.devDeployKey,
				convexProdDeployKey: convexResult.prodDeployKey,
				vercelProjectId: vercelResult.projectId,
				projectSecret,
			},
		});

		writeFileSync(
			`${sandboxPath}/.env.local`,
			[
				`VITE_CONVEX_URL=${convexResult.devUrl}`,
				`VIKTOR_SPACES_API_URL=${this.spacesApiUrl ?? ""}`,
				`VIKTOR_SPACES_PROJECT_NAME=${name}`,
				`VIKTOR_SPACES_PROJECT_SECRET=${projectSecret}`,
			].join("\n"),
		);

		const envVars = this.spacesEnvVars(name, projectSecret);
		await this.convex.setEnvVars(sandboxPath, convexResult.devDeployKey, envVars);
		await this.convex.setEnvVars(sandboxPath, convexResult.prodDeployKey, envVars);

		return {
			success: true,
			projectName: name,
			sandboxPath: space.sandboxPath,
			convexUrlDev: convexResult.devUrl,
			convexUrlProd: convexResult.prodUrl,
		};
	}

	async deploy(
		workspaceId: string,
		name: string,
		environment: "preview" | "production",
		commitMessage?: string,
	): Promise<DeployResultOutput> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) return { success: false, environment, url: "", error: `Space not found: ${name}` };

		const deployment = await this.prisma.spaceDeployment.create({
			data: {
				spaceId: space.id,
				environment: environment === "preview" ? "PREVIEW" : "PRODUCTION",
				status: "BUILDING",
				commitMessage,
			},
		});

		const start = Date.now();
		const convexEnv = environment === "preview" ? "dev" : "prod";
		const deployKey = convexEnv === "dev" ? space.convexDevDeployKey : space.convexProdDeployKey;

		try {
			await this.convex.setEnvVars(
				space.sandboxPath,
				deployKey ?? "",
				this.spacesEnvVars(space.name, space.projectSecret),
			);
			await this.convex.deploy(space.sandboxPath, convexEnv, deployKey ?? "");
			await this.buildFrontend(space.sandboxPath);

			const vercelResult = await this.vercel.deploy(space.sandboxPath, environment);

			await this.prisma.spaceDeployment.update({
				where: { id: deployment.id },
				data: {
					status: "SUCCESS",
					url: vercelResult.url,
					vercelUrl: vercelResult.url,
					durationMs: Date.now() - start,
				},
			});

			const updateData: Record<string, unknown> = {
				lastDeployedAt: new Date(),
				status: "ACTIVE",
			};
			if (environment === "production") updateData.productionUrl = `https://${space.domain}`;
			else updateData.previewUrl = vercelResult.url;

			await this.prisma.space.update({
				where: { id: space.id },
				data: updateData,
			});

			return {
				success: true,
				environment,
				url: environment === "production" ? `https://${space.domain}` : vercelResult.url,
				vercelUrl: vercelResult.url,
			};
		} catch (error) {
			await this.prisma.spaceDeployment.update({
				where: { id: deployment.id },
				data: {
					status: "FAILED",
					buildLog: error instanceof Error ? error.message : String(error),
					durationMs: Date.now() - start,
				},
			});
			return {
				success: false,
				environment,
				url: "",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async listSpaces(workspaceId: string): Promise<ListResult> {
		const spaces = await this.prisma.space.findMany({
			where: { workspaceId, status: { not: "DELETED" } },
			orderBy: { createdAt: "asc" },
		});

		return {
			apps: spaces.map((s) => ({
				name: s.name,
				status: s.status,
				previewUrl: s.previewUrl,
				productionUrl: s.productionUrl,
			})),
		};
	}

	async getStatus(workspaceId: string, name: string): Promise<StatusResult> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) throw new Error(`Space not found: ${name}`);

		return {
			projectName: space.name,
			status: space.status,
			sandboxPath: space.sandboxPath,
			convexUrlDev: space.convexUrlDev,
			convexUrlProd: space.convexUrlProd,
			previewUrl: space.previewUrl,
			productionUrl: space.productionUrl,
			lastDeployedAt: space.lastDeployedAt?.toISOString() ?? null,
		};
	}

	async queryDatabase(
		workspaceId: string,
		name: string,
		functionName: string,
		args: Record<string, unknown>,
		environment: "dev" | "prod",
	): Promise<QueryResultOutput> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) return { success: false, data: null, error: `Space not found: ${name}` };

		const url = environment === "dev" ? space.convexUrlDev : space.convexUrlProd;
		if (!url)
			return {
				success: false,
				data: null,
				error: `No ${environment} deployment URL found`,
			};

		return this.convex.query(url, functionName, args);
	}

	async deleteProject(workspaceId: string, name: string): Promise<DeleteResultOutput> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space)
			return {
				success: false,
				projectName: name,
				deletedResources: [],
				error: `Space not found: ${name}`,
			};

		const deleted: string[] = [];

		const convexResult = await this.convex.deleteProject(name);
		deleted.push(...convexResult.deletedResources);

		if (space.vercelProjectId) {
			await this.vercel.deleteProject(space.vercelProjectId);
			deleted.push("vercel_project");
		}

		await this.prisma.space.update({
			where: { id: space.id },
			data: { status: "DELETED", name: `${space.name}__deleted_${Date.now()}` },
		});
		deleted.push("database_record_soft_deleted");

		return { success: true, projectName: name, deletedResources: deleted };
	}

	private buildFrontend(sandboxPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			execFile("npx", ["vite", "build"], { cwd: sandboxPath }, (err) => {
				if (err) return reject(err);
				resolve();
			});
		});
	}

	private spacesEnvVars(name: string, secret: string): Record<string, string> {
		return {
			VIKTOR_SPACES_API_URL: this.spacesApiUrl ?? "",
			VIKTOR_SPACES_PROJECT_NAME: name,
			VIKTOR_SPACES_PROJECT_SECRET: secret,
		};
	}

	async findBySecret(
		projectName: string,
		projectSecret: string,
	): Promise<{ workspaceId: string; spaceId: string } | null> {
		const space = await this.prisma.space.findFirst({
			where: { name: projectName, projectSecret, status: { not: "DELETED" } },
		});
		if (!space) return null;
		return { workspaceId: space.workspaceId, spaceId: space.id };
	}
}
