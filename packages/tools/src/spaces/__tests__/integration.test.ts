import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../registry.js";
import { SpacesService } from "../service.js";
import { createSpacesToolExecutors } from "../tools.js";

vi.mock("node:fs", () => ({
	mkdirSync: vi.fn(),
	cpSync: vi.fn(),
	writeFileSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
	execFile: vi.fn(
		(
			_cmd: string,
			_args: string[],
			_opts: unknown,
			cb: (err: Error | null, stdout?: string) => void,
		) => cb(null, ""),
	),
}));

const ctx: ToolExecutionContext = {
	workspaceId: "ws_integration",
	workspaceDir: "/data/workspaces/ws_integration",
	timeoutMs: 60_000,
};

const PROJECT_NAME = "my-app";
const SANDBOX_PATH = `/data/workspaces/ws_integration/viktor-spaces/${PROJECT_NAME}`;

type SpaceRecord = {
	id: string;
	workspaceId: string;
	name: string;
	description: string | null;
	status: string;
	sandboxPath: string;
	domain: string;
	previewUrl: string | null;
	productionUrl: string | null;
	convexUrlDev: string | null;
	convexUrlProd: string | null;
	vercelProjectId: string | null;
	projectSecret: string;
	lastDeployedAt: Date | null;
	createdAt: Date;
};

type DeploymentRecord = {
	id: string;
	spaceId: string;
	environment: string;
	status: string;
	url: string | null;
	vercelUrl: string | null;
	commitMessage: string | undefined;
	durationMs: number | null;
};

describe("Viktor Spaces lifecycle integration", () => {
	let spaces: Map<string, SpaceRecord>;
	let deployments: Map<string, DeploymentRecord>;
	let deploymentCounter: number;

	let mockConvex: {
		createProject: ReturnType<typeof vi.fn>;
		deploy: ReturnType<typeof vi.fn>;
		query: ReturnType<typeof vi.fn>;
		deleteProject: ReturnType<typeof vi.fn>;
		setEnvVars: ReturnType<typeof vi.fn>;
	};

	let mockVercel: {
		createProject: ReturnType<typeof vi.fn>;
		deploy: ReturnType<typeof vi.fn>;
		setDomain: ReturnType<typeof vi.fn>;
		deleteProject: ReturnType<typeof vi.fn>;
	};

	let mockPrisma: {
		space: {
			create: ReturnType<typeof vi.fn>;
			findUnique: ReturnType<typeof vi.fn>;
			findMany: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
		spaceDeployment: {
			create: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
	};

	let executors: ReturnType<typeof createSpacesToolExecutors>;

	beforeEach(() => {
		vi.clearAllMocks();
		spaces = new Map();
		deployments = new Map();
		deploymentCounter = 0;

		mockConvex = {
			createProject: vi.fn().mockResolvedValue({
				projectId: "proj_1",
				devUrl: "https://dev.convex.cloud/my-app",
				prodUrl: "https://prod.convex.cloud/my-app",
				devDeployKey: "dev:test-key",
				prodDeployKey: "prod:test-key",
			}),
			deploy: vi.fn().mockResolvedValue({ success: true, output: "deployed" }),
			query: vi.fn().mockResolvedValue({ success: true, data: [{ _id: "row_1", value: 42 }] }),
			deleteProject: vi.fn().mockResolvedValue({
				success: true,
				deletedResources: ["convex_dev", "convex_prod"],
			}),
			setEnvVars: vi.fn().mockResolvedValue(undefined),
		};

		mockVercel = {
			createProject: vi
				.fn()
				.mockResolvedValue({ projectId: "prj_abc", name: `app-${PROJECT_NAME}` }),
			deploy: vi
				.fn()
				.mockImplementation((_buildDir: string, environment: "preview" | "production") =>
					Promise.resolve({
						url: `https://${PROJECT_NAME}-${environment}.vercel.app`,
					}),
				),
			setDomain: vi.fn().mockResolvedValue(`${PROJECT_NAME}-a1b2c3d4.viktor.space`),
			deleteProject: vi.fn().mockResolvedValue({ success: true }),
		};

		mockPrisma = {
			space: {
				create: vi
					.fn()
					.mockImplementation(
						({ data }: { data: Omit<SpaceRecord, "id" | "lastDeployedAt" | "createdAt"> }) => {
							const record: SpaceRecord = {
								id: "space_int_1",
								lastDeployedAt: null,
								createdAt: new Date("2026-03-17T00:00:00.000Z"),
								...data,
							};
							spaces.set(`${data.workspaceId}:${data.name}`, record);
							return Promise.resolve(record);
						},
					),

				findUnique: vi
					.fn()
					.mockImplementation(
						({
							where,
						}: { where: { workspaceId_name?: { workspaceId: string; name: string } } }) => {
							if (where.workspaceId_name) {
								const { workspaceId, name } = where.workspaceId_name;
								return Promise.resolve(spaces.get(`${workspaceId}:${name}`) ?? null);
							}
							return Promise.resolve(null);
						},
					),

				findMany: vi
					.fn()
					.mockImplementation(
						({ where }: { where: { workspaceId: string; status?: { not: string } } }) => {
							const results = Array.from(spaces.values()).filter((s) => {
								if (s.workspaceId !== where.workspaceId) return false;
								if (where.status?.not && s.status === where.status.not) return false;
								return true;
							});
							return Promise.resolve(results);
						},
					),

				update: vi
					.fn()
					.mockImplementation(
						({ where, data }: { where: { id: string }; data: Partial<SpaceRecord> }) => {
							for (const [key, record] of spaces.entries()) {
								if (record.id === where.id) {
									const updated = { ...record, ...data };
									spaces.set(key, updated);
									return Promise.resolve(updated);
								}
							}
							return Promise.resolve(null);
						},
					),
			},

			spaceDeployment: {
				create: vi
					.fn()
					.mockImplementation(
						({
							data,
						}: { data: Omit<DeploymentRecord, "id" | "url" | "vercelUrl" | "durationMs"> }) => {
							deploymentCounter += 1;
							const record: DeploymentRecord = {
								id: `dep_${deploymentCounter}`,
								url: null,
								vercelUrl: null,
								durationMs: null,
								...data,
							};
							deployments.set(record.id, record);
							return Promise.resolve(record);
						},
					),

				update: vi
					.fn()
					.mockImplementation(
						({ where, data }: { where: { id: string }; data: Partial<DeploymentRecord> }) => {
							const record = deployments.get(where.id);
							if (record) {
								const updated = { ...record, ...data };
								deployments.set(where.id, updated);
								return Promise.resolve(updated);
							}
							return Promise.resolve(null);
						},
					),
			},
		};

		const service = new SpacesService({
			prisma: mockPrisma as unknown as never,
			convex: mockConvex as unknown as never,
			vercel: mockVercel as unknown as never,
			spacesDir: "/data/workspaces",
			spacesApiUrl: "https://api.viktor.space",
		});

		executors = createSpacesToolExecutors(service);
	});

	it("runs the full lifecycle through tool executors", async () => {
		const initResult = await executors.init_app_project(
			{ project_name: PROJECT_NAME, description: "Integration test app" },
			ctx,
		);

		expect(initResult.error).toBeUndefined();
		const initOutput = initResult.output as {
			success: boolean;
			projectName: string;
			sandboxPath: string;
			convexUrlDev: string;
			convexUrlProd: string;
		};
		expect(initOutput.success).toBe(true);
		expect(initOutput.projectName).toBe(PROJECT_NAME);
		expect(initOutput.sandboxPath).toBe(SANDBOX_PATH);
		expect(initOutput.convexUrlDev).toBe("https://dev.convex.cloud/my-app");
		expect(initOutput.convexUrlProd).toBe("https://prod.convex.cloud/my-app");
		expect(mockConvex.createProject).toHaveBeenCalledOnce();
		expect(mockVercel.createProject).toHaveBeenCalledOnce();
		expect(mockVercel.setDomain).toHaveBeenCalledOnce();
		expect(mockPrisma.space.create).toHaveBeenCalledOnce();

		const listAfterInit = await executors.list_apps({}, ctx);

		expect(listAfterInit.error).toBeUndefined();
		const listAfterInitOutput = listAfterInit.output as {
			apps: Array<{ name: string; status: string }>;
		};
		expect(listAfterInitOutput.apps).toHaveLength(1);
		expect(listAfterInitOutput.apps[0].name).toBe(PROJECT_NAME);
		expect(listAfterInitOutput.apps[0].status).toBe("READY");

		const statusResult = await executors.get_app_status({ project_name: PROJECT_NAME }, ctx);

		expect(statusResult.error).toBeUndefined();
		const statusOutput = statusResult.output as {
			projectName: string;
			status: string;
			sandboxPath: string;
			convexUrlDev: string | null;
			convexUrlProd: string | null;
			previewUrl: string | null;
			productionUrl: string | null;
			lastDeployedAt: string | null;
		};
		expect(statusOutput.projectName).toBe(PROJECT_NAME);
		expect(statusOutput.status).toBe("READY");
		expect(statusOutput.sandboxPath).toBe(SANDBOX_PATH);
		expect(statusOutput.convexUrlDev).toBe("https://dev.convex.cloud/my-app");
		expect(statusOutput.convexUrlProd).toBe("https://prod.convex.cloud/my-app");
		expect(statusOutput.lastDeployedAt).toBeNull();

		const previewDeployResult = await executors.deploy_app(
			{ project_name: PROJECT_NAME, environment: "preview", commit_message: "Initial preview" },
			ctx,
		);

		expect(previewDeployResult.error).toBeUndefined();
		const previewOutput = previewDeployResult.output as {
			success: boolean;
			environment: string;
			url: string;
		};
		expect(previewOutput.success).toBe(true);
		expect(previewOutput.environment).toBe("preview");
		expect(previewOutput.url).toBe(`https://${PROJECT_NAME}-preview.vercel.app`);
		expect(mockConvex.deploy).toHaveBeenCalledWith(SANDBOX_PATH, "dev", "dev:test-key");

		const prodDeployResult = await executors.deploy_app(
			{ project_name: PROJECT_NAME, environment: "production", commit_message: "Go live" },
			ctx,
		);

		expect(prodDeployResult.error).toBeUndefined();
		const prodOutput = prodDeployResult.output as {
			success: boolean;
			environment: string;
			url: string;
		};
		expect(prodOutput.success).toBe(true);
		expect(prodOutput.environment).toBe("production");
		expect(prodOutput.url).toBe(`https://${PROJECT_NAME}-a1b2c3d4.viktor.space`);
		expect(mockConvex.deploy).toHaveBeenCalledWith(SANDBOX_PATH, "prod", "prod:test-key");
		expect(mockPrisma.spaceDeployment.create).toHaveBeenCalledTimes(2);

		const queryResult = await executors.query_app_database(
			{ project_name: PROJECT_NAME, function_name: "tasks:list", environment: "dev", args: {} },
			ctx,
		);

		expect(queryResult.error).toBeUndefined();
		const queryOutput = queryResult.output as { success: boolean; data: unknown };
		expect(queryOutput.success).toBe(true);
		expect(queryOutput.data).toEqual([{ _id: "row_1", value: 42 }]);
		expect(mockConvex.query).toHaveBeenCalledWith(
			"https://dev.convex.cloud/my-app",
			"tasks:list",
			{},
		);

		const deleteResult = await executors.delete_app_project({ project_name: PROJECT_NAME }, ctx);

		expect(deleteResult.error).toBeUndefined();
		const deleteOutput = deleteResult.output as {
			success: boolean;
			projectName: string;
			deletedResources: string[];
		};
		expect(deleteOutput.success).toBe(true);
		expect(deleteOutput.projectName).toBe(PROJECT_NAME);
		expect(deleteOutput.deletedResources).toContain("convex_dev");
		expect(deleteOutput.deletedResources).toContain("convex_prod");
		expect(deleteOutput.deletedResources).toContain("vercel_project");
		expect(deleteOutput.deletedResources).toContain("database_record_soft_deleted");

		const listAfterDelete = await executors.list_apps({}, ctx);

		expect(listAfterDelete.error).toBeUndefined();
		const listAfterDeleteOutput = listAfterDelete.output as { apps: unknown[] };
		expect(listAfterDeleteOutput.apps).toHaveLength(0);
	});
});
