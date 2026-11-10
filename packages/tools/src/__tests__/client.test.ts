import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ToolGatewayClient } from "../client.js";

let server: Server;
let port = 0;

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let data = "";
		req.on("data", (chunk: Buffer) => {
			data += chunk.toString();
		});
		req.on("end", () => resolve(data));
	});
}

beforeAll(
	() =>
		new Promise<void>((resolve) => {
			server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
				const url = new URL(req.url ?? "/", `http://localhost:${port}`);

				if (url.pathname !== "/v1/tools/call") {
					res.writeHead(404, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Not found" }));
					return;
				}

				const auth = req.headers.authorization;
				if (auth !== "Bearer test-token") {
					res.writeHead(401, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: "Unauthorized" }));
					return;
				}

				const rawBody = await readBody(req);
				const body = JSON.parse(rawBody) as {
					role: string;
					arguments: Record<string, unknown>;
				};

				res.writeHead(200, { "Content-Type": "application/json" });
				if (body.role === "echo") {
					res.end(JSON.stringify({ result: { echoed: body.arguments.message } }));
				} else if (body.role === "fail") {
					res.end(JSON.stringify({ error: "Tool failed" }));
				} else {
					res.end(JSON.stringify({ error: `Unknown tool: ${body.role}` }));
				}
			});

			server.listen(0, () => {
				const addr = server.address();
				port = typeof addr === "object" && addr ? addr.port : 0;
				resolve();
			});
		}),
);

afterAll(
	() =>
		new Promise<void>((resolve) => {
			server.close(() => resolve());
		}),
);

describe("ToolGatewayClient", () => {
	it("calls tool and returns result", async () => {
		const client = new ToolGatewayClient({
			baseUrl: `http://localhost:${port}`,
			token: "test-token",
		});

		const result = await client.call("echo", { message: "hello" });
		expect(result.output).toEqual({ echoed: "hello" });
		expect(result.error).toBeUndefined();
		expect(result.durationMs).toBeGreaterThanOrEqual(0);
	});

	it("returns error from gateway", async () => {
		const client = new ToolGatewayClient({
			baseUrl: `http://localhost:${port}`,
			token: "test-token",
		});

		const result = await client.call("fail", {});
		expect(result.error).toBe("Tool failed");
	});

	it("returns error on auth failure", async () => {
		const client = new ToolGatewayClient({
			baseUrl: `http://localhost:${port}`,
			token: "wrong-token",
		});

		const result = await client.call("echo", { message: "hello" });
		expect(result.error).toContain("401");
	});

	it("returns error on connection failure", async () => {
		const client = new ToolGatewayClient({
			baseUrl: "http://localhost:1",
			token: "test-token",
			timeoutMs: 1_000,
		});

		const result = await client.call("echo", { message: "hello" });
		expect(result.error).toBeDefined();
	});
});
