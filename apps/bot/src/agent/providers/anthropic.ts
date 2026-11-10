import Anthropic from "@anthropic-ai/sdk";
import type {
	ContentBlock,
	LLMMessage,
	LLMProvider,
	LLMResponse,
	LLMToolDefinition,
	StopReason,
} from "@laneassistant/shared";
import { calculateCostCents } from "../pricing.js";
import { mapProviderError, withRetry } from "../retry.js";

type AnthropicMessage = Anthropic.MessageParam;

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";

export interface AnthropicProviderOptions {
	/** Reasoning effort for models that support it. Claude Opus 5.5 defaults to "medium" when unset. */
	effort?: EffortLevel;
}

const THINKING_BINDING_BETA = "thinking-binding-controls-2026-08-01";
const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** Models that take adaptive thinking and `output_config.effort` (and reject `budget_tokens`). */
export function supportsAdaptiveThinking(model: string): boolean {
	return (
		/^claude-(fable|mythos)-/.test(model) ||
		/^claude-(opus|sonnet|haiku)-5/.test(model) ||
		/^claude-(opus|sonnet)-4-[6-9]/.test(model)
	);
}

/** Models that accept the server-side refusal fallback (`fallbacks: "default"`). */
export function supportsServerFallback(model: string): boolean {
	return /^claude-(fable-5-[12]|opus-5|sonnet-5-5)/.test(model);
}
type AnthropicTool = Anthropic.Tool;
type AnthropicContent = Anthropic.ContentBlockParam;

function toAnthropicMessages(messages: LLMMessage[]): AnthropicMessage[] {
	return messages
		.filter((m) => m.role !== "system")
		.map((m) => ({
			role: m.role as "user" | "assistant",
			content: typeof m.content === "string" ? m.content : (m.content as AnthropicContent[]),
		}));
}

function extractSystemPrompt(messages: LLMMessage[]): string | undefined {
	const systemMessages = messages.filter((m) => m.role === "system");
	if (systemMessages.length === 0) return undefined;
	return systemMessages
		.map((m) => {
			if (typeof m.content === "string") return m.content;
			if (Array.isArray(m.content)) {
				return m.content
					.filter((b) => b.type === "text")
					.map((b) => (b as { text: string }).text)
					.join("\n\n");
			}
			return "";
		})
		.join("\n\n");
}

function toAnthropicTools(tools: LLMToolDefinition[]): AnthropicTool[] {
	return tools.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema: t.input_schema as Anthropic.Tool.InputSchema,
	}));
}

type ResponseBlock =
	| { type: "text"; text: string }
	| { type: "tool_use"; id: string; name: string; input: unknown }
	| { type: "thinking"; thinking: string; signature: string }
	| { type: "redacted_thinking"; data: string }
	| { type: string };

/**
 * Thinking blocks are kept verbatim so they can be replayed unchanged within the tool loop,
 * which current models require. Block types this harness does not use are dropped rather than
 * turned into empty text blocks, which the API rejects when sent back.
 */
function mapContentBlocks(blocks: ResponseBlock[]): ContentBlock[] {
	const mapped: ContentBlock[] = [];
	for (const block of blocks) {
		if (block.type === "text" && "text" in block) {
			mapped.push({ type: "text", text: block.text });
		} else if (block.type === "tool_use" && "id" in block) {
			mapped.push({
				type: "tool_use",
				id: block.id,
				name: block.name,
				input: block.input as Record<string, unknown>,
			});
		} else if (block.type === "thinking" && "signature" in block) {
			mapped.push({ type: "thinking", thinking: block.thinking, signature: block.signature });
		} else if (block.type === "redacted_thinking" && "data" in block) {
			mapped.push({ type: "redacted_thinking", data: block.data });
		}
	}
	return mapped;
}

type ChatParams = Parameters<LLMProvider["chat"]>[0];

function resolveToolChoice(toolChoice: ChatParams["toolChoice"]): Anthropic.ToolChoice | undefined {
	if (!toolChoice) return undefined;
	return typeof toolChoice === "string" ? { type: toolChoice } : toolChoice;
}

export class AnthropicProvider implements LLMProvider {
	private client: Anthropic;
	private effort?: EffortLevel;

	constructor(apiKey: string, options: AnthropicProviderOptions = {}) {
		this.client = new Anthropic({ apiKey });
		this.effort = options.effort;
	}

	private buildRequest(params: ChatParams): {
		requestParams: Record<string, unknown>;
		betas: string[];
	} {
		const adaptive = supportsAdaptiveThinking(params.model);
		const system = extractSystemPrompt(params.messages);
		const requestParams: Record<string, unknown> = {
			model: params.model,
			messages: toAnthropicMessages(params.messages),
			max_tokens: params.maxTokens ?? 16_000,
			...(system ? { system } : {}),
		};
		const betas: string[] = [];

		if (params.tools?.length) {
			requestParams.tools = toAnthropicTools(params.tools);
			// Current models reject forced tool choice ("any" / a named tool) with a 400.
			const toolChoice = adaptive ? undefined : resolveToolChoice(params.toolChoice);
			if (toolChoice) requestParams.tool_choice = toolChoice;
		}

		if (adaptive) {
			// The runner can change the tool set mid-run (skills hot-load tools) and trims
			// oversized tool results on context overflow. Both invalidate earlier thinking
			// blocks, so ask the API to drop those blocks instead of rejecting the request.
			requestParams.thinking = {
				type: "adaptive",
				block_binding: { prefix_mismatch_behavior: "drop_block" },
			};
			betas.push(THINKING_BINDING_BETA);
			if (this.effort) requestParams.output_config = { effort: this.effort };
		}

		if (supportsServerFallback(params.model)) {
			requestParams.fallbacks = "default";
			betas.push(SERVER_FALLBACK_BETA);
		}

		return { requestParams, betas };
	}

	async chat(params: ChatParams): Promise<LLMResponse> {
		const { requestParams, betas } = this.buildRequest(params);

		try {
			const response = await withRetry(() =>
				this.client.messages.create(
					requestParams as unknown as Anthropic.MessageCreateParamsNonStreaming,
					{
						timeout: params.timeoutMs,
						...(betas.length > 0 ? { headers: { "anthropic-beta": betas.join(",") } } : {}),
					},
				),
			);

			const usage = response.usage;
			const cacheCreation =
				"cache_creation_input_tokens" in usage
					? ((usage.cache_creation_input_tokens as number) ?? 0)
					: 0;
			const cacheRead =
				"cache_read_input_tokens" in usage ? ((usage.cache_read_input_tokens as number) ?? 0) : 0;

			const tokenUsage = {
				inputTokens: usage.input_tokens,
				outputTokens: usage.output_tokens,
				cacheCreationInputTokens: cacheCreation,
				cacheReadInputTokens: cacheRead,
			};

			return {
				id: response.id,
				content: mapContentBlocks(response.content as unknown as ResponseBlock[]),
				stopReason: response.stop_reason as StopReason,
				model: response.model,
				inputTokens: usage.input_tokens,
				outputTokens: usage.output_tokens,
				cacheCreationInputTokens: cacheCreation,
				cacheReadInputTokens: cacheRead,
				costCents: calculateCostCents(response.model, tokenUsage),
			};
		} catch (error) {
			throw mapProviderError(error);
		}
	}
}
