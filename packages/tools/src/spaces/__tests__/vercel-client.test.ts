import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("node:child_process", () => ({
	execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { VercelClient } from "../vercel-client.js";

const mockExecFile = vi.mocked(execFile);

describe("VercelClient", () => {
	let client: VercelClient;

	beforeEach(() => {
		client = new VercelClient({
			token: "vercel-token",
			orgId: "org_123",
			domain: "viktor.space",
		});
		mockFetch.mockReset();
		vi.clearAllMocks();
	});

	it("creates a new project", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "prj_123", name: "app-test" }),
		});

		const result = await client.createProject("test");
		expect(result.projectId).toBe("prj_123");
		expect(result.name).toBe("app-test");
		expect(mockFetch).toHaveBeenCalledWith(
			"https://api.vercel.com/v10/projects",
			expect.objectContaining({ method: "POST" }),
		);
	});

	it("deploys to preview using CLI", async () => {
		mockExecFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
			(cb as (err: Error | null, stdout?: string) => void)(
				null,
				"https://test-app-abc123.vercel.app\n",
			);
			return undefined as unknown as ReturnType<typeof execFile>;
		});

		const result = await client.deploy("/tmp/test-app", "preview");
		expect(result.url).toBe("https://test-app-abc123.vercel.app");
		expect(mockExecFile).toHaveBeenCalledWith(
			"npx",
			[
				"vercel",
				"deploy",
				"/tmp/test-app/dist",
				"--yes",
				"--token",
				"vercel-token",
				"--scope",
				"org_123",
			],
			expect.anything(),
			expect.any(Function),
		);
	});

	it("deploys to production with --prod flag", async () => {
		mockExecFile.mockImplementationOnce((_cmd, _args, _opts, cb) => {
			(cb as (err: Error | null, stdout?: string) => void)(null, "https://test-app.vercel.app\n");
			return undefined as unknown as ReturnType<typeof execFile>;
		});

		const result = await client.deploy("/tmp/test-app", "production");
		expect(result.url).toBe("https://test-app.vercel.app");
		expect(mockExecFile).toHaveBeenCalledWith(
			"npx",
			[
				"vercel",
				"deploy",
				"/tmp/test-app/dist",
				"--yes",
				"--token",
				"vercel-token",
				"--scope",
				"org_123",
				"--prod",
			],
			expect.anything(),
			expect.any(Function),
		);
	});

	it("sets a custom domain", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ name: "test-abc123.viktor.space" }),
		});

		const domain = await client.setDomain("prj_123", "abc12345", "test");
		expect(domain).toBe("test-abc12345.viktor.space");
	});

	it("deletes a project", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({}),
		});

		const result = await client.deleteProject("prj_123");
		expect(result.success).toBe(true);
	});

	it("throws on API error", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: false,
			status: 404,
			json: async () => ({ error: "Not found" }),
		});

		await expect(client.createProject("test")).rejects.toThrow("Vercel API POST");
	});

	it("includes org ID in headers", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "prj_123", name: "app-test" }),
		});

		await client.createProject("test");
		const callArgs = mockFetch.mock.calls[0];
		expect(callArgs[1].headers["x-vercel-team-id"]).toBe("org_123");
	});
});
