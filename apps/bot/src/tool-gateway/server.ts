import type { Logger } from "@laneassistant/shared";
import type { ToolBackend, ToolExecutionContext, ToolRegistry } from "@laneassistant/tools";
import { ensureWorkspace, verifyWorkspaceToolToken } from "@laneassistant/tools";

interface GatewayRequest {
	role: string;
	arguments: Record<string, unknown>;
}

interface GatewayDeps {
	registry: ToolRegistry;
	backend: ToolBackend;
	logger: Logger;
	defaultTimeoutMs: number;
}

function validateAuth(req: Request): string | Response {
	const authHeader = req.headers.get("authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}
	const workspaceId = verifyWorkspaceToolToken(authHeader.slice(7));
	if (!workspaceId) {
		return Response.json({ error: "Invalid token" }, { status: 403 });
	}
	return workspaceId;
}

async function parseBody(req: Request): Promise<GatewayRequest | Response> {
	try {
		const body = (await req.json()) as Record<string, unknown>;
		if (
			body.arguments !== undefined &&
			(typeof body.arguments !== "object" ||
				body.arguments === null ||
				Array.isArray(body.arguments))
		) {
			return Response.json(
				{ error: "Invalid 'arguments' field: must be an object" },
				{ status: 400 },
			);
		}
		return body as unknown as GatewayRequest;
	} catch {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
}

export function createToolGateway(deps: GatewayDeps): {
	fetch: (req: Request) => Promise<Response>;
} {
	const { registry, backend, logger, defaultTimeoutMs } = deps;

	async function handleToolCall(workspaceId: string, body: GatewayRequest): Promise<Response> {
		if (!body.role || typeof body.role !== "string") {
			return Response.json({ error: "Missing or invalid 'role' field" }, { status: 400 });
		}

		const resolvedKey = registry.resolve(body.role, workspaceId);
		if (!resolvedKey) {
			return Response.json({ error: `Unknown tool: ${body.role}` }, { status: 404 });
		}

		const workspaceDir = await ensureWorkspace(workspaceId);
		const ctx: ToolExecutionContext = { workspaceId, workspaceDir, timeoutMs: defaultTimeoutMs };

		logger.info({ tool: body.role, workspaceId }, "Tool call started");
		const start = Date.now();
		const useLocal = registry.isLocalOnly(resolvedKey);
		const result = useLocal
			? await registry.execute(resolvedKey, body.arguments ?? {}, ctx)
			: await backend.execute(body.role, body.arguments ?? {}, ctx);
		const durationMs = Date.now() - start;

		if (result.error) {
			logger.warn(
				{ tool: body.role, workspaceId, durationMs, error: result.error, args: body.arguments },
				"Tool call failed",
			);
			return Response.json({ error: result.error });
		}

		logger.info({ tool: body.role, workspaceId, durationMs }, "Tool call completed");
		return Response.json({ result: result.output });
	}

	return {
		fetch: async (req: Request): Promise<Response> => {
			const url = new URL(req.url, "http://localhost");

			if (req.method === "GET" && url.pathname === "/health") {
				return Response.json({ status: "ok", tools: registry.getAllDefinitions().length });
			}

			if (req.method !== "POST" || url.pathname !== "/v1/tools/call") {
				return Response.json({ error: "Not found" }, { status: 404 });
			}

			const authResult = validateAuth(req);
			if (authResult instanceof Response) return authResult;

			const bodyResult = await parseBody(req);
			if (bodyResult instanceof Response) return bodyResult;

			return handleToolCall(authResult, bodyResult);
		},
	};
}
