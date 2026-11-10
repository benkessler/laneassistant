import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { ConvexClient } from "../convex-client.js";

const mockExecFile = vi.mocked(execFile);

describe("ConvexClient", () => {
	let client: ConvexClient;

	beforeEach(() => {
		client = new ConvexClient({ accessToken: "token_123", teamId: "team_456" });
		vi.clearAllMocks();
	});

	it("creates a new project via management API", async () => {
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ projectId: 1822923 }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					name: "happy-animal-100",
					deploymentUrl: "https://happy-animal-100.convex.cloud",
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					name: "happy-animal-101",
					deploymentUrl: "https://happy-animal-101.convex.cloud",
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ deployKey: "dev:happy-animal-100|key1" }),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ deployKey: "prod:happy-animal-101|key2" }),
			});

		const result = await client.createProject("test-app");
		expect(result.projectId).toBe("1822923");
		expect(result.devUrl).toBe("https://happy-animal-100.convex.cloud");
		expect(result.prodUrl).toBe("https://happy-animal-101.convex.cloud");
		expect(result.devDeployKey).toBe("dev:happy-animal-100|key1");
		expect(result.prodDeployKey).toBe("prod:happy-animal-101|key2");
		expect(mockFetch).toHaveBeenCalledTimes(5);
	});

	it("deploys functions using CLI with deploy key", async () => {
		mockExecFile
			.mockImplementationOnce((_cmd, _args, _opts, cb) => {
				(cb as (err: Error | null, stdout?: string) => void)(null, "bun install done");
				return undefined as unknown as ReturnType<typeof execFile>;
			})
			.mockImplementationOnce((_cmd, _args, _opts, cb) => {
				(cb as (err: Error | null, stdout?: string) => void)(null, "Deployed successfully");
				return undefined as unknown as ReturnType<typeof execFile>;
			});

		const result = await client.deploy("/tmp/test-app", "prod", "prod:key|abc");
		expect(result.success).toBe(true);
		expect(mockExecFile).toHaveBeenCalledTimes(2);
		expect(mockExecFile).toHaveBeenNthCalledWith(
			1,
			"bun",
			["install"],
			expect.anything(),
			expect.any(Function),
		);
		expect(mockExecFile).toHaveBeenNthCalledWith(
			2,
			"npx",
			["convex", "deploy"],
			expect.objectContaining({
				env: expect.objectContaining({ CONVEX_DEPLOY_KEY: "prod:key|abc" }),
			}),
			expect.any(Function),
		);
	});

	it("deploys to dev using dev --once", async () => {
		mockExecFile
			.mockImplementationOnce((_cmd, _args, _opts, cb) => {
				(cb as (err: Error | null, stdout?: string) => void)(null, "bun install done");
				return undefined as unknown as ReturnType<typeof execFile>;
			})
			.mockImplementationOnce((_cmd, _args, _opts, cb) => {
				(cb as (err: Error | null, stdout?: string) => void)(null, "OK");
				return undefined as unknown as ReturnType<typeof execFile>;
			});

		await client.deploy("/tmp/test-app", "dev", "dev:key|abc");
		expect(mockExecFile).toHaveBeenNthCalledWith(
			2,
			"npx",
			["convex", "dev", "--once"],
			expect.anything(),
			expect.any(Function),
		);
	});

	it("queries a deployment database", async () => {
		mockExecFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
			(cb as (err: Error | null, stdout?: string) => void)(
				null,
				JSON.stringify([{ _id: "1", title: "test" }]),
			);
			return undefined as unknown as ReturnType<typeof execFile>;
		});

		const result = await client.query("https://happy-animal-100.convex.cloud", "tasks:list", {});
		expect(result.success).toBe(true);
		expect(result.data).toEqual([{ _id: "1", title: "test" }]);
	});

	it("deletes a project via management API", async () => {
		mockFetch
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					projects: [{ id: "proj_1", name: "test-app" }],
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				json: async () => ({}),
			});

		const result = await client.deleteProject("test-app");
		expect(result.success).toBe(true);
		expect(result.deletedResources).toContain("convex_project");
	});

	it("throws on management API error", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 401,
			text: async () => "Unauthorized",
		});

		await expect(client.createProject("test")).rejects.toThrow("Convex API");
	});
});
