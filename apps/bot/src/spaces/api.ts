import type { Logger } from "@openviktor/shared";
import type { ToolExecutionContext, ToolRegistry } from "@openviktor/tools";
import { ensureWorkspace } from "@openviktor/tools";
import type { SpacesService } from "@openviktor/tools/spaces";

interface SpacesApiDeps {
	spacesService: SpacesService;
	registry: ToolRegistry;
	logger: Logger;
	defaultTimeoutMs: number;
	resendApiKey?: string;
	spacesDomain?: string;
}

interface SpacesToolRequest {
	project_name: string;
	project_secret: string;
	role: string;
	arguments: Record<string, unknown>;
}

interface SpacesEmailRequest {
	project_name: string;
	project_secret: string;
	to_email: string;
	subject: string;
	html_content: string;
	text_content?: string;
}

export function createSpacesApi(deps: SpacesApiDeps): {
	fetch: (req: Request) => Promise<Response>;
} {
	const { spacesService, registry, logger, defaultTimeoutMs } = deps;

	async function authenticateRequest(body: {
		project_name?: string;
		project_secret?: string;
	}): Promise<{ workspaceId: string; spaceId: string } | Response> {
		if (!body.project_name || !body.project_secret) {
			return Response.json(
				{ success: false, error: "Missing project_name or project_secret" },
				{ status: 401 },
			);
		}

		const result = await spacesService.findBySecret(body.project_name, body.project_secret);
		if (!result) {
			return Response.json(
				{ success: false, error: "Invalid project credentials" },
				{ status: 403 },
			);
		}

		return result;
	}

	async function handleToolCall(req: Request): Promise<Response> {
		let body: SpacesToolRequest;
		try {
			body = (await req.json()) as SpacesToolRequest;
		} catch {
			return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
		}

		const auth = await authenticateRequest(body);
		if (auth instanceof Response) return auth;

		const resolvedKey = registry.resolve(body.role, auth.workspaceId);
		if (!resolvedKey) {
			return Response.json(
				{ success: false, error: `Unknown tool: ${body.role}` },
				{ status: 404 },
			);
		}

		const workspaceDir = await ensureWorkspace(auth.workspaceId);
		const ctx: ToolExecutionContext = {
			workspaceId: auth.workspaceId,
			workspaceDir,
			timeoutMs: defaultTimeoutMs,
		};

		logger.info({ tool: body.role, projectName: body.project_name }, "Spaces API tool call");
		const result = await registry.execute(resolvedKey, body.arguments ?? {}, ctx);

		if (result.error) {
			return Response.json({ success: false, error: result.error });
		}

		return Response.json({ success: true, result: result.output });
	}

	async function handleSendEmail(req: Request): Promise<Response> {
		if (!deps.resendApiKey) {
			return Response.json(
				{ success: false, error: "Email service not configured" },
				{ status: 503 },
			);
		}

		let body: SpacesEmailRequest;
		try {
			body = (await req.json()) as SpacesEmailRequest;
		} catch {
			return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
		}

		const auth = await authenticateRequest(body);
		if (auth instanceof Response) return auth;

		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${deps.resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: `${body.project_name}@notifications.${deps.spacesDomain ?? "apps.openviktor.com"}`,
				to: body.to_email,
				subject: body.subject,
				html: body.html_content,
				text: body.text_content,
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			logger.warn({ projectName: body.project_name, error: err }, "Spaces email send failed");
			return Response.json({ success: false, error: "Email delivery failed" });
		}

		logger.info({ projectName: body.project_name }, "Spaces email sent");
		return Response.json({ success: true });
	}

	return {
		fetch: async (req: Request): Promise<Response> => {
			const url = new URL(req.url, "http://localhost");

			if (req.method !== "POST") {
				return Response.json({ error: "Method not allowed" }, { status: 405 });
			}

			if (url.pathname === "/api/viktor-spaces/tools/call") {
				return handleToolCall(req);
			}

			if (url.pathname === "/api/viktor-spaces/send-email") {
				return handleSendEmail(req);
			}

			return Response.json({ error: "Not found" }, { status: 404 });
		},
	};
}
