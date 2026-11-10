import type {
	ContentBlock,
	LLMMessage,
	LLMProvider,
	LLMResponse,
	LLMToolDefinition,
	StopReason,
	ToolResultBlock,
} from "@openviktor/shared";
import { LLMError } from "@openviktor/shared";
import { calculateCostCents } from "../pricing.js";
import { withRetry } from "../retry.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface OpenAIToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content?: string | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

interface OpenAITool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters?: Record<string, unknown>;
	};
}

interface OpenAIChoice {
	message: {
		role: string;
		content: string | null;
		tool_calls?: OpenAIToolCall[];
	};
	finish_reason: string;
}

interface OpenAIResponse {
	id: string;
	model: string;
	choices: OpenAIChoice[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface OpenAIProviderOptions {
	baseUrl?: string;
	apiKey?: string;
}

function convertAssistantMessage(content: ContentBlock[]): OpenAIMessage {
	const textParts = content
		.filter((b) => b.type === "text")
		.map((b) => (b as { text: string }).text)
		.join("");

	const toolCalls = content
		.filter((b) => b.type === "tool_use")
		.map((b) => {
			const tu = b as { id: string; name: string; input: Record<string, unknown> };
			return {
				id: tu.id,
				type: "function" as const,
				function: { name: tu.name, arguments: JSON.stringify(tu.input) },
			};
		});

	const msg: OpenAIMessage = { role: "assistant", content: textParts || null };
	if (toolCalls.length > 0) {
		msg.tool_calls = toolCalls;
	}
	return msg;
}

function convertContentBlocks(
	role: "system" | "user" | "assistant",
	content: ContentBlock[],
): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];
	const textParts: string[] = [];
	const toolResults: ToolResultBlock[] = [];

	for (const block of content) {
		if (block.type === "text") {
			textParts.push(block.text);
		} else if (block.type === "tool_result") {
			toolResults.push(block);
		}
	}

	if (textParts.length > 0) {
		result.push({ role, content: textParts.join("") });
	}

	for (const tr of toolResults) {
		result.push({ role: "tool", tool_call_id: tr.tool_use_id, content: tr.content });
	}

	return result;
}

function toOpenAIMessages(messages: LLMMessage[]): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];

	for (const msg of messages) {
		if (typeof msg.content === "string") {
			result.push({ role: msg.role, content: msg.content });
		} else if (msg.role === "assistant") {
			result.push(convertAssistantMessage(msg.content));
		} else {
			result.push(...convertContentBlocks(msg.role, msg.content));
		}
	}

	return result;
}

function toOpenAITools(tools: LLMToolDefinition[]): OpenAITool[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.input_schema,
		},
	}));
}

function mapToolChoice(
	choice: "auto" | "any" | { type: "tool"; name: string },
): "auto" | "required" | { type: "function"; function: { name: string } } {
	if (choice === "auto") return "auto";
	if (choice === "any") return "required";
	return { type: "function", function: { name: choice.name } };
}

function mapFinishReason(reason: string): StopReason {
	switch (reason) {
		case "stop":
			return "end_turn";
		case "length":
			return "max_tokens";
		case "tool_calls":
			return "tool_use";
		case "content_filter":
			return "refusal";
		default:
			return "end_turn";
	}
}

function parseResponseContent(choice: OpenAIChoice): ContentBlock[] {
	const content: ContentBlock[] = [];

	if (choice.message.content) {
		content.push({ type: "text", text: choice.message.content });
	}

	if (choice.message.tool_calls) {
		for (const tc of choice.message.tool_calls) {
			let input: Record<string, unknown>;
			try {
				const parsed = JSON.parse(tc.function.arguments);
				if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
					throw new LLMError(
						`Tool call "${tc.function.name}" returned non-object arguments: ${tc.function.arguments}`,
					);
				}
				input = parsed as Record<string, unknown>;
			} catch (e) {
				if (e instanceof LLMError) throw e;
				throw new LLMError(
					`Tool call "${tc.function.name}" returned malformed JSON arguments: ${tc.function.arguments}`,
				);
			}
			content.push({
				type: "tool_use",
				id: tc.id,
				name: tc.function.name,
				input,
			});
		}
	}

	return content;
}

function mapOpenAIError(status: number, message: string): LLMError {
	switch (status) {
		case 401:
			return new LLMError("Invalid API key");
		case 429:
			return new LLMError("Rate limit exceeded after retries");
		case 400:
			if (message.includes("context length") || message.includes("too long")) {
				return new LLMError(`Bad request: prompt is too long: ${message}`);
			}
			return new LLMError(`Bad request: ${message}`);
		case 404:
			return new LLMError(`Model not found: ${message}`);
		case 500:
		case 503:
			return new LLMError("API is temporarily unavailable");
		default:
			return new LLMError(`OpenAI-compatible API error (${status}): ${message}`);
	}
}

async function openaiRequest(
	url: string,
	body: unknown,
	apiKey: string | undefined,
	timeoutMs?: number,
): Promise<OpenAIResponse> {
	const controller = new AbortController();
	const timeout = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (apiKey) {
			headers.Authorization = `Bearer ${apiKey}`;
		}

		const res = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal: controller.signal,
		});

		if (!res.ok) {
			const errBody = await res.text();
			let message = errBody;
			try {
				const parsed = JSON.parse(errBody);
				message = parsed.error?.message ?? errBody;
			} catch {}
			const err = mapOpenAIError(res.status, message);
			Object.assign(err, { status: res.status });
			throw err;
		}

		return (await res.json()) as OpenAIResponse;
	} finally {
		if (timeout) clearTimeout(timeout);
	}
}

/** Strips provider prefix (e.g. "ollama/llama3.2" → "llama3.2") */
function stripModelPrefix(model: string): string {
	const slashIndex = model.indexOf("/");
	return slashIndex >= 0 ? model.slice(slashIndex + 1) : model;
}

export class OpenAIProvider implements LLMProvider {
	private baseUrl: string;
	private apiKey: string | undefined;

	constructor(options: OpenAIProviderOptions = {}) {
		this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
		this.apiKey = options.apiKey;
	}

	async chat(params: {
		model: string;
		messages: LLMMessage[];
		maxTokens?: number;
		tools?: LLMToolDefinition[];
		toolChoice?: "auto" | "any" | { type: "tool"; name: string };
		timeoutMs?: number;
	}): Promise<LLMResponse> {
		const model = stripModelPrefix(params.model);
		const messages = toOpenAIMessages(params.messages);

		const body: Record<string, unknown> = {
			model,
			messages,
			max_tokens: params.maxTokens ?? 4096,
		};

		if (params.tools?.length) {
			body.tools = toOpenAITools(params.tools);
			if (params.toolChoice) {
				body.tool_choice = mapToolChoice(params.toolChoice);
			}
		}

		const url = `${this.baseUrl}/chat/completions`;

		const response = await withRetry(
			() => openaiRequest(url, body, this.apiKey, params.timeoutMs),
			{ maxRetries: 2 },
		);

		const choice = response.choices?.[0];
		if (!choice) {
			throw new LLMError("No response choices returned from API");
		}

		const content = parseResponseContent(choice);
		const stopReason = mapFinishReason(choice.finish_reason);

		const inputTokens = response.usage?.prompt_tokens ?? 0;
		const outputTokens = response.usage?.completion_tokens ?? 0;

		const tokenUsage = {
			inputTokens,
			outputTokens,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		};

		return {
			id: response.id ?? `openai-${Date.now()}`,
			content,
			stopReason,
			model: response.model ?? model,
			inputTokens,
			outputTokens,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
			costCents: calculateCostCents(params.model, tokenUsage),
		};
	}
}
