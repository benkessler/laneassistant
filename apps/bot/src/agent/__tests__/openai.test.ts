import type { LLMMessage } from "@openviktor/shared";
import { LLMError } from "@openviktor/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProvider } from "../providers/openai.js";

const originalFetch = globalThis.fetch;

function stubFetch(body: unknown, status = 200) {
	const mock = vi.fn(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
		),
	);
	globalThis.fetch = mock as unknown as typeof fetch;
	return mock;
}

function lastFetchCall(mock: ReturnType<typeof vi.fn>) {
	const [url, init] = mock.mock.calls[0];
	return {
		url: url as string,
		body: JSON.parse(init.body as string),
		headers: init.headers as Record<string, string>,
	};
}

const baseResponse = {
	id: "chatcmpl-test123",
	model: "llama3.2",
	choices: [
		{
			message: { role: "assistant", content: "Hello!" },
			finish_reason: "stop",
		},
	],
	usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

const toolCallResponse = {
	id: "chatcmpl-tool456",
	model: "llama3.2",
	choices: [
		{
			message: {
				role: "assistant",
				content: null,
				tool_calls: [
					{
						id: "call_abc123",
						type: "function",
						function: {
							name: "get_weather",
							arguments: '{"city":"London"}',
						},
					},
				],
			},
			finish_reason: "tool_calls",
		},
	],
	usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
};

describe("OpenAIProvider", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("sends a basic chat request", async () => {
		const mock = stubFetch(baseResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		const result = await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(result.id).toBe("chatcmpl-test123");
		expect(result.content).toEqual([{ type: "text", text: "Hello!" }]);
		expect(result.stopReason).toBe("end_turn");
		expect(result.inputTokens).toBe(10);
		expect(result.outputTokens).toBe(5);
		expect(result.costCents).toBe(0);

		const call = lastFetchCall(mock);
		expect(call.url).toBe("http://localhost:11434/v1/chat/completions");
		expect(call.body.model).toBe("llama3.2");
		expect(call.body.messages).toEqual([{ role: "user", content: "Hi" }]);
	});

	it("sends Authorization header when apiKey is provided", async () => {
		const mock = stubFetch(baseResponse);

		const provider = new OpenAIProvider({ apiKey: "sk-test-key" });
		await provider.chat({
			model: "gpt-4o",
			messages: [{ role: "user", content: "Hi" }],
		});

		const call = lastFetchCall(mock);
		expect(call.headers.Authorization).toBe("Bearer sk-test-key");
	});

	it("omits Authorization header when no apiKey", async () => {
		const mock = stubFetch(baseResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "Hi" }],
		});

		const call = lastFetchCall(mock);
		expect(call.headers.Authorization).toBeUndefined();
	});

	it("handles tool call responses", async () => {
		stubFetch(toolCallResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		const result = await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "What's the weather?" }],
			tools: [
				{
					name: "get_weather",
					description: "Get weather for a city",
					input_schema: {
						type: "object",
						properties: { city: { type: "string" } },
					},
				},
			],
		});

		expect(result.stopReason).toBe("tool_use");
		expect(result.content).toEqual([
			{
				type: "tool_use",
				id: "call_abc123",
				name: "get_weather",
				input: { city: "London" },
			},
		]);
	});

	it("sends tools and tool_choice in the request", async () => {
		const mock = stubFetch(toolCallResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "weather" }],
			tools: [
				{
					name: "get_weather",
					description: "Get weather",
					input_schema: { type: "object" },
				},
			],
			toolChoice: "auto",
		});

		const call = lastFetchCall(mock);
		expect(call.body.tools).toEqual([
			{
				type: "function",
				function: {
					name: "get_weather",
					description: "Get weather",
					parameters: { type: "object" },
				},
			},
		]);
		expect(call.body.tool_choice).toBe("auto");
	});

	it("maps 'any' toolChoice to 'required'", async () => {
		const mock = stubFetch(toolCallResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "weather" }],
			tools: [
				{
					name: "get_weather",
					description: "Get weather",
					input_schema: { type: "object" },
				},
			],
			toolChoice: "any",
		});

		const call = lastFetchCall(mock);
		expect(call.body.tool_choice).toBe("required");
	});

	it("maps specific tool choice correctly", async () => {
		const mock = stubFetch(toolCallResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "weather" }],
			tools: [
				{
					name: "get_weather",
					description: "Get weather",
					input_schema: { type: "object" },
				},
			],
			toolChoice: { type: "tool", name: "get_weather" },
		});

		const call = lastFetchCall(mock);
		expect(call.body.tool_choice).toEqual({
			type: "function",
			function: { name: "get_weather" },
		});
	});

	it("converts assistant tool_use blocks to OpenAI tool_calls format", async () => {
		const mock = stubFetch(baseResponse);

		const messages: LLMMessage[] = [
			{ role: "user", content: "What's the weather?" },
			{
				role: "assistant",
				content: [
					{ type: "text", text: "Let me check." },
					{
						type: "tool_use",
						id: "call_1",
						name: "get_weather",
						input: { city: "London" },
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "call_1",
						content: '{"temp": 15}',
					},
				],
			},
		];

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await provider.chat({ model: "ollama/llama3.2", messages });

		const call = lastFetchCall(mock);
		expect(call.body.messages).toEqual([
			{ role: "user", content: "What's the weather?" },
			{
				role: "assistant",
				content: "Let me check.",
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: {
							name: "get_weather",
							arguments: '{"city":"London"}',
						},
					},
				],
			},
			{
				role: "tool",
				tool_call_id: "call_1",
				content: '{"temp": 15}',
			},
		]);
	});

	it("converts system messages correctly", async () => {
		const mock = stubFetch(baseResponse);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await provider.chat({
			model: "ollama/llama3.2",
			messages: [
				{ role: "system", content: "You are helpful." },
				{ role: "user", content: "Hi" },
			],
		});

		const call = lastFetchCall(mock);
		expect(call.body.messages[0]).toEqual({ role: "system", content: "You are helpful." });
	});

	it("throws LLMError on HTTP error", async () => {
		stubFetch({ error: { message: "Model not found" } }, 404);

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await expect(
			provider.chat({
				model: "ollama/nonexistent",
				messages: [{ role: "user", content: "Hi" }],
			}),
		).rejects.toThrow(LLMError);
	});

	it("throws on empty choices", async () => {
		stubFetch({
			id: "chatcmpl-empty",
			model: "llama3.2",
			choices: [],
			usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
		});

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await expect(
			provider.chat({
				model: "ollama/llama3.2",
				messages: [{ role: "user", content: "Hi" }],
			}),
		).rejects.toThrow("No response choices");
	});

	it("handles response with both text and tool calls", async () => {
		stubFetch({
			id: "chatcmpl-mixed",
			model: "llama3.2",
			choices: [
				{
					message: {
						role: "assistant",
						content: "I'll look that up.",
						tool_calls: [
							{
								id: "call_mixed1",
								type: "function",
								function: {
									name: "search",
									arguments: '{"query":"test"}',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
			usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 },
		});

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		const result = await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "search for test" }],
		});

		expect(result.content).toHaveLength(2);
		expect(result.content[0]).toEqual({ type: "text", text: "I'll look that up." });
		expect(result.content[1]).toEqual({
			type: "tool_use",
			id: "call_mixed1",
			name: "search",
			input: { query: "test" },
		});
		expect(result.stopReason).toBe("tool_use");
	});

	it("handles missing usage in response", async () => {
		stubFetch({
			id: "chatcmpl-nousage",
			model: "llama3.2",
			choices: [
				{
					message: { role: "assistant", content: "Hello!" },
					finish_reason: "stop",
				},
			],
		});

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		const result = await provider.chat({
			model: "ollama/llama3.2",
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(result.inputTokens).toBe(0);
		expect(result.outputTokens).toBe(0);
	});

	it("throws on malformed JSON in tool call arguments", async () => {
		stubFetch({
			id: "chatcmpl-badjson",
			model: "llama3.2",
			choices: [
				{
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_bad",
								type: "function",
								function: {
									name: "get_weather",
									arguments: "not valid json{{{",
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		});

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await expect(
			provider.chat({
				model: "ollama/llama3.2",
				messages: [{ role: "user", content: "weather" }],
			}),
		).rejects.toThrow("malformed JSON");
	});

	it("throws when tool call arguments is a non-object JSON value", async () => {
		stubFetch({
			id: "chatcmpl-nonobj",
			model: "llama3.2",
			choices: [
				{
					message: {
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "call_nonobj",
								type: "function",
								function: {
									name: "get_weather",
									arguments: '"just a string"',
								},
							},
						],
					},
					finish_reason: "tool_calls",
				},
			],
			usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
		});

		const provider = new OpenAIProvider({ baseUrl: "http://localhost:11434/v1" });
		await expect(
			provider.chat({
				model: "ollama/llama3.2",
				messages: [{ role: "user", content: "weather" }],
			}),
		).rejects.toThrow("non-object arguments");
	});
});
