import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpacesService } from "../service.js";

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

const mockPrisma = {
	space: {
		create: vi.fn(),
		findUnique: vi.fn(),
		findFirst: vi.fn(),
		findMany: vi.fn(),
		update: vi.fn(),
	},
	spaceDeployment: {
		create: vi.fn(),
		update: vi.fn(),
	},
};

const mockConvex = {
	createProject: vi.fn(),
	deploy: vi.fn(),
	query: vi.fn(),
	deleteProject: vi.fn(),
	setEnvVars: vi.fn().mockResolvedValue(undefined),
};

const mockVercel = {
	createProject: vi.fn(),
	deploy: vi.fn(),
	setDomain: vi.fn(),
	deleteProject: vi.fn(),
};

describe("SpacesService", () => {
	let service: SpacesService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new SpacesService({
			prisma: mockPrisma as unknown as never,
			convex: mockConvex as unknown as never,
			vercel: mockVercel as unknown as never,
			spacesDir: "/data/workspaces",
		});
	});

	it("initializes a new space project", async () => {
		mockConvex.createProject.mockResolvedValue({
			projectId: "proj_1",
			devUrl: "https://dev.convex.cloud",
			prodUrl: "https://prod.convex.cloud",
			devDeployKey: "dev:key1",
			prodDeployKey: "prod:key2",
		});
		mockVercel.createProject.mockResolvedValue({ projectId: "prj_123", name: "app-test" });
		mockVercel.setDomain.mockResolvedValue("test-abc123.viktor.space");
		mockPrisma.space.create.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/data/workspaces/ws1/viktor-spaces/test",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
			projectSecret: "secret_abc",
		});

		const result = await service.initProject("ws1", "test", "A test app");
		expect(result.success).toBe(true);
		expect(result.convexUrlDev).toBe("https://dev.convex.cloud");
		expect(result.convexUrlProd).toBe("https://prod.convex.cloud");
		expect(result.sandboxPath).toBe("/data/workspaces/ws1/viktor-spaces/test");
		expect(mockPrisma.space.create).toHaveBeenCalledOnce();
		expect(mockConvex.createProject).toHaveBeenCalledWith(
			"test",
		);
	});

	it("deploys a space to preview", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/tmp/test",
			domain: "test-abc.viktor.space",
			convexUrlDev: "https://dev.convex.cloud",
			convexDevDeployKey: "dev:key1",
			convexProdDeployKey: "prod:key2",
		});
		mockConvex.deploy.mockResolvedValue({ success: true, output: "OK" });
		mockVercel.deploy.mockResolvedValue({
			deploymentId: "dpl_1",
			url: "test-123.vercel.app",
		});
		mockPrisma.spaceDeployment.create.mockResolvedValue({ id: "dep_1" });
		mockPrisma.spaceDeployment.update.mockResolvedValue({});
		mockPrisma.space.update.mockResolvedValue({});

		const result = await service.deploy("ws1", "test", "preview", "initial deploy");
		expect(result.success).toBe(true);
		expect(result.url).toBe("test-123.vercel.app");
		expect(result.environment).toBe("preview");
		expect(mockConvex.deploy).toHaveBeenCalledWith("/tmp/test", "dev", "dev:key1");
	});

	it("deploys a space to production", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/tmp/test",
			domain: "test-abc.viktor.space",
			convexDevDeployKey: "dev:key1",
			convexProdDeployKey: "prod:key2",
		});
		mockConvex.deploy.mockResolvedValue({ success: true, output: "OK" });
		mockVercel.deploy.mockResolvedValue({
			deploymentId: "dpl_1",
			url: "test-prod.vercel.app",
		});
		mockPrisma.spaceDeployment.create.mockResolvedValue({ id: "dep_1" });
		mockPrisma.spaceDeployment.update.mockResolvedValue({});
		mockPrisma.space.update.mockResolvedValue({});

		const result = await service.deploy("ws1", "test", "production");
		expect(result.success).toBe(true);
		expect(result.url).toBe("https://test-abc.viktor.space");
		expect(mockConvex.deploy).toHaveBeenCalledWith("/tmp/test", "prod", "prod:key2");
	});

	it("returns error when deploying nonexistent space", async () => {
		mockPrisma.space.findUnique.mockResolvedValue(null);

		const result = await service.deploy("ws1", "nope", "preview");
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("lists spaces for a workspace", async () => {
		mockPrisma.space.findMany.mockResolvedValue([
			{
				id: "space_1",
				name: "test",
				status: "ACTIVE",
				previewUrl: "https://preview.test",
				productionUrl: null,
			},
		]);

		const result = await service.listSpaces("ws1");
		expect(result.apps).toHaveLength(1);
		expect(result.apps[0].name).toBe("test");
		expect(result.apps[0].status).toBe("ACTIVE");
	});

	it("gets space status", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			status: "ACTIVE",
			sandboxPath: "/tmp/test",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
			previewUrl: "https://preview.test",
			productionUrl: "https://prod.test",
			lastDeployedAt: new Date("2026-03-12"),
		});

		const result = await service.getStatus("ws1", "test");
		expect(result.status).toBe("ACTIVE");
		expect(result.productionUrl).toBe("https://prod.test");
		expect(result.lastDeployedAt).toBe("2026-03-12T00:00:00.000Z");
	});

	it("throws when getting status of nonexistent space", async () => {
		mockPrisma.space.findUnique.mockResolvedValue(null);

		await expect(service.getStatus("ws1", "nope")).rejects.toThrow("not found");
	});

	it("queries a space database", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
		});
		mockConvex.query.mockResolvedValue({ success: true, data: [{ _id: "1" }] });

		const result = await service.queryDatabase("ws1", "test", "tasks:list", {}, "dev");
		expect(result.success).toBe(true);
		expect(result.data).toEqual([{ _id: "1" }]);
		expect(mockConvex.query).toHaveBeenCalledWith("https://dev.convex.cloud", "tasks:list", {});
	});

	it("queries prod database", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
		});
		mockConvex.query.mockResolvedValue({ success: true, data: [] });

		const result = await service.queryDatabase("ws1", "test", "tasks:list", {}, "prod");
		expect(mockConvex.query).toHaveBeenCalledWith("https://prod.convex.cloud", "tasks:list", {});
		expect(result.success).toBe(true);
	});

	it("returns error when querying nonexistent space", async () => {
		mockPrisma.space.findUnique.mockResolvedValue(null);

		const result = await service.queryDatabase("ws1", "nope", "fn", {}, "dev");
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("deletes a space and its resources", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/tmp/test",
			vercelProjectId: "prj_123",
		});
		mockConvex.deleteProject.mockResolvedValue({
			success: true,
			deletedResources: ["convex_dev", "convex_prod"],
		});
		mockVercel.deleteProject.mockResolvedValue({ success: true });
		mockPrisma.space.update.mockResolvedValue({});

		const result = await service.deleteProject("ws1", "test");
		expect(result.success).toBe(true);
		expect(result.deletedResources).toContain("convex_dev");
		expect(result.deletedResources).toContain("vercel_project");
		expect(result.deletedResources).toContain("database_record_soft_deleted");
	});

	it("returns error when deleting nonexistent space", async () => {
		mockPrisma.space.findUnique.mockResolvedValue(null);

		const result = await service.deleteProject("ws1", "nope");
		expect(result.success).toBe(false);
		expect(result.error).toContain("not found");
	});

	it("finds a space by project secret", async () => {
		mockPrisma.space.findFirst.mockResolvedValue({
			id: "space_1",
			workspaceId: "ws1",
		});

		const result = await service.findBySecret("test", "secret_valid");
		expect(result).toEqual({ workspaceId: "ws1", spaceId: "space_1" });
	});

	it("returns null for invalid secret", async () => {
		mockPrisma.space.findFirst.mockResolvedValue(null);

		const result = await service.findBySecret("test", "secret_bad");
		expect(result).toBeNull();
	});
});
