import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../registry.js";
import { createSpacesToolExecutors, spacesToolDefinitions } from "../tools.js";

const ctx: ToolExecutionContext = {
	workspaceId: "ws_test",
	workspaceDir: "/tmp/test",
	timeoutMs: 30_000,
};

function makeMockService() {
	return {
		initProject: vi.fn(),
		deploy: vi.fn(),
		listSpaces: vi.fn(),
		getStatus: vi.fn(),
		queryDatabase: vi.fn(),
		deleteProject: vi.fn(),
		findBySecret: vi.fn(),
	};
}

describe("spacesToolDefinitions", () => {
	it("has exactly 6 entries", () => {
		expect(spacesToolDefinitions).toHaveLength(6);
	});

	it("has the correct tool names", () => {
		const names = spacesToolDefinitions.map((d) => d.name);
		expect(names).toContain("init_app_project");
		expect(names).toContain("deploy_app");
		expect(names).toContain("list_apps");
		expect(names).toContain("get_app_status");
		expect(names).toContain("query_app_database");
		expect(names).toContain("delete_app_project");
	});

	it("every definition has name, description, and input_schema", () => {
		for (const def of spacesToolDefinitions) {
			expect(def.name).toBeTruthy();
			expect(def.description).toBeTruthy();
			expect(def.input_schema).toBeDefined();
		}
	});
});

describe("createSpacesToolExecutors", () => {
	let service: ReturnType<typeof makeMockService>;
	let executors: ReturnType<typeof createSpacesToolExecutors>;

	beforeEach(() => {
		service = makeMockService();
		executors = createSpacesToolExecutors(service as never);
	});

	describe("init_app_project", () => {
		it("calls service.initProject and returns result", async () => {
			const expected = {
				success: true,
				projectName: "my-app",
				sandboxPath: "/spaces/ws_test/my-app",
				convexUrlDev: "https://dev.convex.cloud",
				convexUrlProd: "https://prod.convex.cloud",
			};
			service.initProject.mockResolvedValue(expected);

			const result = await executors.init_app_project(
				{ project_name: "my-app", description: "My app" },
				ctx,
			);

			expect(service.initProject).toHaveBeenCalledWith("ws_test", "my-app", "My app");
			expect(result.output).toEqual(expected);
			expect(result.error).toBeUndefined();
			expect(result.durationMs).toBeGreaterThanOrEqual(0);
		});

		it("catches errors and returns them in the error field", async () => {
			service.initProject.mockRejectedValue(new Error("Convex unavailable"));

			const result = await executors.init_app_project({ project_name: "my-app" }, ctx);

			expect(result.output).toBeNull();
			expect(result.error).toBe("Convex unavailable");
		});
	});

	describe("deploy_app", () => {
		it("calls service.deploy with correct args", async () => {
			const expected = {
				success: true,
				environment: "preview",
				url: "https://preview.vercel.app",
			};
			service.deploy.mockResolvedValue(expected);

			const result = await executors.deploy_app(
				{ project_name: "my-app", environment: "preview", commit_message: "feat: update" },
				ctx,
			);

			expect(service.deploy).toHaveBeenCalledWith("ws_test", "my-app", "preview", "feat: update");
			expect(result.output).toEqual(expected);
			expect(result.error).toBeUndefined();
		});

		it("catches errors and returns them in the error field", async () => {
			service.deploy.mockRejectedValue(new Error("Deploy failed"));

			const result = await executors.deploy_app(
				{ project_name: "my-app", environment: "production" },
				ctx,
			);

			expect(result.output).toBeNull();
			expect(result.error).toBe("Deploy failed");
		});
	});

	describe("list_apps", () => {
		it("calls service.listSpaces and returns result", async () => {
			const expected = {
				apps: [{ name: "my-app", status: "ACTIVE", previewUrl: null, productionUrl: null }],
			};
			service.listSpaces.mockResolvedValue(expected);

			const result = await executors.list_apps({}, ctx);

			expect(service.listSpaces).toHaveBeenCalledWith("ws_test");
			expect(result.output).toEqual(expected);
			expect(result.error).toBeUndefined();
		});

		it("catches errors and returns them in the error field", async () => {
			service.listSpaces.mockRejectedValue(new Error("DB error"));

			const result = await executors.list_apps({}, ctx);

			expect(result.output).toBeNull();
			expect(result.error).toBe("DB error");
		});
	});

	describe("get_app_status", () => {
		it("calls service.getStatus with project name", async () => {
			const expected = {
				projectName: "my-app",
				status: "ACTIVE",
				sandboxPath: "/spaces/ws_test/my-app",
				convexUrlDev: "https://dev.convex.cloud",
				convexUrlProd: "https://prod.convex.cloud",
				previewUrl: null,
				productionUrl: null,
				lastDeployedAt: null,
			};
			service.getStatus.mockResolvedValue(expected);

			const result = await executors.get_app_status({ project_name: "my-app" }, ctx);

			expect(service.getStatus).toHaveBeenCalledWith("ws_test", "my-app");
			expect(result.output).toEqual(expected);
			expect(result.error).toBeUndefined();
		});

		it("catches errors and returns them in the error field", async () => {
			service.getStatus.mockRejectedValue(new Error("Space not found: my-app"));

			const result = await executors.get_app_status({ project_name: "my-app" }, ctx);

			expect(result.output).toBeNull();
			expect(result.error).toBe("Space not found: my-app");
		});
	});

	describe("query_app_database", () => {
		it("calls service.queryDatabase with correct args", async () => {
			const expected = { success: true, data: [{ id: "1", text: "hello" }] };
			service.queryDatabase.mockResolvedValue(expected);

			const result = await executors.query_app_database(
				{
					project_name: "my-app",
					function_name: "tasks:list",
					environment: "dev",
					args: { limit: 10 },
				},
				ctx,
			);

			expect(service.queryDatabase).toHaveBeenCalledWith(
				"ws_test",
				"my-app",
				"tasks:list",
				{ limit: 10 },
				"dev",
			);
			expect(result.output).toEqual(expected);
			expect(result.error).toBeUndefined();
		});

		it("uses empty object when args are omitted", async () => {
			service.queryDatabase.mockResolvedValue({ success: true, data: [] });

			await executors.query_app_database(
				{ project_name: "my-app", function_name: "tasks:list", environment: "prod" },
				ctx,
			);

			expect(service.queryDatabase).toHaveBeenCalledWith(
				"ws_test",
				"my-app",
				"tasks:list",
				{},
				"prod",
			);
		});

		it("catches errors and returns them in the error field", async () => {
			service.queryDatabase.mockRejectedValue(new Error("Query failed"));

			const result = await executors.query_app_database(
				{ project_name: "my-app", function_name: "tasks:list", environment: "dev" },
				ctx,
			);

			expect(result.output).toBeNull();
			expect(result.error).toBe("Query failed");
		});
	});

	describe("delete_app_project", () => {
		it("calls service.deleteProject and returns result", async () => {
			const expected = {
				success: true,
				projectName: "my-app",
				deletedResources: ["convex_project", "vercel_project", "database_record"],
			};
			service.deleteProject.mockResolvedValue(expected);

			const result = await executors.delete_app_project({ project_name: "my-app" }, ctx);

			expect(service.deleteProject).toHaveBeenCalledWith("ws_test", "my-app");
			expect(result.output).toEqual(expected);
			expect(result.error).toBeUndefined();
		});

		it("catches errors and returns them in the error field", async () => {
			service.deleteProject.mockRejectedValue(new Error("Delete failed"));

			const result = await executors.delete_app_project({ project_name: "my-app" }, ctx);

			expect(result.output).toBeNull();
			expect(result.error).toBe("Delete failed");
		});
	});
});
