import type { Logger } from "@openviktor/shared";
import type { ToolExecutionContext, ToolRegistry } from "@openviktor/tools";
import type { SpacesService } from "@openviktor/tools/spaces";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@openviktor/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@openviktor/tools")>();
	return {
		...actual,
		ensureWorkspace: vi.fn().mockResolvedValue("/data/workspaces/ws_1"),
	};
});

import { createSpacesApi } from "../api.js";

const mockService: Pick<SpacesService, "findBySecret"> = {
	findBySecret: vi.fn(),
};

const mockRegistry: Pick<ToolRegistry, "resolve" | "execute" | "isLocalOnly"> = {
	resolve: vi.fn(),
	execute: vi.fn(),
	isLocalOnly: vi.fn().mockReturnValue(true),
};

const mockLogger: Pick<Logger, "info" | "warn" | "error" | "debug" | "fatal" | "trace" | "child"> =
	{
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		fatal: vi.fn(),
		trace: vi.fn(),
		child: vi.fn(),
	};

function makeRequest(path: string, body: Record<string, unknown>, method = "POST"): Request {
	return new Request(`http://localhost${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("Spaces API", () => {
	let api: ReturnType<typeof createSpacesApi>;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createSpacesApi({
			spacesService: mockService as SpacesService,
			registry: mockRegistry as unknown as ToolRegistry,
			logger: mockLogger as unknown as Logger,
			defaultTimeoutMs: 60_000,
		});
	});

	describe("POST /api/viktor-spaces/tools/call", () => {
		it("rejects requests with missing project_secret", async () => {
			const req = makeRequest("/api/viktor-spaces/tools/call", {
				project_name: "test",
				role: "quick_ai_search",
				arguments: {},
			});

			const res = await api.fetch(req);
			expect(res.status).toBe(401);
		});

		it("rejects requests with invalid secret", async () => {
			vi.mocked(mockService.findBySecret).mockResolvedValue(null);

			const req = makeRequest("/api/viktor-spaces/tools/call", {
				project_name: "test",
				project_secret: "bad",
				role: "quick_ai_search",
				arguments: {},
			});

			const res = await api.fetch(req);
			expect(res.status).toBe(403);
		});

		it("proxies valid tool calls to the registry", async () => {
			vi.mocked(mockService.findBySecret).mockResolvedValue({
				workspaceId: "ws_1",
				spaceId: "sp_1",
			});
			vi.mocked(mockRegistry.resolve).mockReturnValue("quick_ai_search");
			vi.mocked(mockRegistry.execute).mockResolvedValue({
				output: { answer: "42" },
				durationMs: 100,
			});

			const req = makeRequest("/api/viktor-spaces/tools/call", {
				project_name: "test",
				project_secret: "secret_valid",
				role: "quick_ai_search",
				arguments: { search_question: "test" },
			});

			const res = await api.fetch(req);
			expect(res.status).toBe(200);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.success).toBe(true);
			expect((body.result as Record<string, unknown>).answer).toBe("42");
		});

		it("returns tool errors in response body", async () => {
			vi.mocked(mockService.findBySecret).mockResolvedValue({
				workspaceId: "ws_1",
				spaceId: "sp_1",
			});
			vi.mocked(mockRegistry.resolve).mockReturnValue("quick_ai_search");
			vi.mocked(mockRegistry.execute).mockResolvedValue({
				output: null,
				durationMs: 50,
				error: "Tool failed",
			});

			const req = makeRequest("/api/viktor-spaces/tools/call", {
				project_name: "test",
				project_secret: "secret_valid",
				role: "quick_ai_search",
				arguments: {},
			});

			const res = await api.fetch(req);
			const body = (await res.json()) as Record<string, unknown>;
			expect(body.success).toBe(false);
			expect(body.error).toBe("Tool failed");
		});

		it("returns 404 for unknown tools", async () => {
			vi.mocked(mockService.findBySecret).mockResolvedValue({
				workspaceId: "ws_1",
				spaceId: "sp_1",
			});
			vi.mocked(mockRegistry.resolve).mockReturnValue(undefined);

			const req = makeRequest("/api/viktor-spaces/tools/call", {
				project_name: "test",
				project_secret: "secret_valid",
				role: "nonexistent",
				arguments: {},
			});

			const res = await api.fetch(req);
			expect(res.status).toBe(404);
		});
	});

	describe("POST /api/viktor-spaces/send-email", () => {
		it("returns 503 when resend is not configured", async () => {
			const req = makeRequest("/api/viktor-spaces/send-email", {
				project_name: "test",
				project_secret: "secret_valid",
				to_email: "user@example.com",
				subject: "Test",
				html_content: "<p>Hi</p>",
			});

			const res = await api.fetch(req);
			expect(res.status).toBe(503);
		});

		it("authenticates before sending email", async () => {
			const apiWithResend = createSpacesApi({
				spacesService: mockService as SpacesService,
				registry: mockRegistry as unknown as ToolRegistry,
				logger: mockLogger as unknown as Logger,
				defaultTimeoutMs: 60_000,
				resendApiKey: "re_test",
			});

			vi.mocked(mockService.findBySecret).mockResolvedValue(null);

			const req = makeRequest("/api/viktor-spaces/send-email", {
				project_name: "test",
				project_secret: "bad_secret",
				to_email: "user@example.com",
				subject: "Test",
				html_content: "<p>Hi</p>",
			});

			const res = await apiWithResend.fetch(req);
			expect(res.status).toBe(403);
		});
	});

	describe("routing", () => {
		it("returns 404 for unmatched paths", async () => {
			const req = makeRequest("/api/viktor-spaces/unknown", {});
			const res = await api.fetch(req);
			expect(res.status).toBe(404);
		});

		it("returns 405 for non-POST methods", async () => {
			const req = new Request("http://localhost/api/viktor-spaces/tools/call", {
				method: "GET",
			});
			const res = await api.fetch(req);
			expect(res.status).toBe(405);
		});
	});
});
