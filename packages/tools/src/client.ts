import type { ToolResult } from "@openviktor/shared";

export class ToolGatewayClient {
	private baseUrl: string;
	private token: string;
	private timeoutMs: number;

	constructor(opts: { baseUrl: string; token: string; timeoutMs?: number }) {
		this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
		this.token = opts.token;
		this.timeoutMs = opts.timeoutMs ?? 600_000;
	}

	async call(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
		const start = Date.now();
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const response = await fetch(`${this.baseUrl}/v1/tools/call`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.token}`,
				},
				body: JSON.stringify({ role: toolName, arguments: args }),
				signal: controller.signal,
			});

			const durationMs = Date.now() - start;

			if (!response.ok) {
				const body = await response.text();
				return {
					output: null,
					durationMs,
					error: `Gateway error: ${response.status} - ${body}`,
				};
			}

			const data = (await response.json()) as { result?: unknown; error?: string };

			if (data.error) {
				return { output: null, durationMs, error: data.error };
			}

			return { output: data.result ?? null, durationMs };
		} catch (error) {
			const durationMs = Date.now() - start;
			if (error instanceof DOMException && error.name === "AbortError") {
				return {
					output: null,
					durationMs,
					error: `Tool "${toolName}" timed out after ${this.timeoutMs}ms`,
				};
			}
			const message = error instanceof Error ? error.message : String(error);
			return { output: null, durationMs, error: `Gateway request failed: ${message}` };
		} finally {
			clearTimeout(timer);
		}
	}
}
