import type { LLMMessage } from "@openviktor/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoogleProvider } from "../providers/google.js";

const FAKE_KEY = "test-api-key";

function mockFetchResponse(body: unknown, status = 200) {
	const mock = vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		json: () => Promise.resolve(body),
		text: () => Promise.resolve(JSON.stringify(body)),
	}) as unknown as typeof fetch;
	return mock;
}

describe("GoogleProvider thought signature round-trip", () => {
	const originalFetch = globalThis.fetch;

	beforeEach(() => {
		vi.restoreAllMocks();
	});

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("captures thoughtSignature from response into providerMetadata", async () => {
		const geminiResponse = {
			candidates: [
				{
					content: {
						role: "model",
						parts: [
							{
								functionCall: { name: "read_learnings", args: { query: "test" } },
								thoughtSignature: "sig_abc123",
							},
						],
					},
					finishReason: "STOP",
				},
			],
			usageMetadata: {
				promptTokenCount: 10,
				candidatesTokenCount: 5,
				totalTokenCount: 15,
			},
		};

		globalThis.fetch = mockFetchResponse(geminiResponse);

		const provider = new GoogleProvider(FAKE_KEY);
		const result = await provider.chat({
			model: "gemini-2.5-flash",
			messages: [{ role: "user", content: "test" }],
			tools: [
				{
					name: "read_learnings",
					description: "Read learnings",
					input_schema: { type: "object", properties: { query: { type: "string" } } },
				},
			],
		});

		expect(result.stopReason).toBe("tool_use");
		const toolBlock = result.content.find((b) => b.type === "tool_use");
		expect(toolBlock).toBeDefined();
		expect(toolBlock?.type).toBe("tool_use");
		expect(toolBlock?.type === "tool_use" ? toolBlock.providerMetadata : undefined).toEqual({
			thoughtSignature: "sig_abc123",
		});
	});

	it("echoes thoughtSignature back in subsequent request", async () => {
		// Second call response (simple text)
		const secondResponse = {
			candidates: [
				{
					content: { role: "model", parts: [{ text: "Done" }] },
					finishReason: "STOP",
				},
			],
			usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 3, totalTokenCount: 23 },
		};

		globalThis.fetch = mockFetchResponse(secondResponse);

		const messages: LLMMessage[] = [
			{ role: "user", content: "test" },
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "call_abc",
						name: "read_learnings",
						input: { query: "test" },
						providerMetadata: { thoughtSignature: "sig_abc123" },
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "call_abc",
						content: '{"results": []}',
					},
				],
			},
		];

		const provider = new GoogleProvider(FAKE_KEY);
		await provider.chat({
			model: "gemini-2.5-flash",
			messages,
			tools: [
				{
					name: "read_learnings",
					description: "Read learnings",
					input_schema: { type: "object", properties: { query: { type: "string" } } },
				},
			],
		});

		// Inspect the request body sent to fetch
		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const requestBody = JSON.parse(fetchCall[1]?.body as string);

		// Find the model turn with the function call
		const modelTurn = requestBody.contents.find((c: { role: string }) => c.role === "model");
		expect(modelTurn).toBeDefined();

		const fcPart = modelTurn.parts.find((p: { functionCall?: unknown }) => p.functionCall);
		expect(fcPart).toBeDefined();
		expect(fcPart.thoughtSignature).toBe("sig_abc123");
	});

	it("omits thoughtSignature when not present in providerMetadata", async () => {
		const secondResponse = {
			candidates: [
				{
					content: { role: "model", parts: [{ text: "Done" }] },
					finishReason: "STOP",
				},
			],
			usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 3, totalTokenCount: 23 },
		};

		globalThis.fetch = mockFetchResponse(secondResponse);

		const messages: LLMMessage[] = [
			{ role: "user", content: "test" },
			{
				role: "assistant",
				content: [
					{
						type: "tool_use",
						id: "call_abc",
						name: "read_learnings",
						input: { query: "test" },
						// No providerMetadata — simulates non-thinking model response
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: "call_abc",
						content: '{"results": []}',
					},
				],
			},
		];

		const provider = new GoogleProvider(FAKE_KEY);
		await provider.chat({
			model: "gemini-2.5-flash",
			messages,
			tools: [
				{
					name: "read_learnings",
					description: "Read learnings",
					input_schema: { type: "object", properties: { query: { type: "string" } } },
				},
			],
		});

		const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
		const requestBody = JSON.parse(fetchCall[1]?.body as string);
		const modelTurn = requestBody.contents.find((c: { role: string }) => c.role === "model");
		const fcPart = modelTurn.parts.find((p: { functionCall?: unknown }) => p.functionCall);
		expect(fcPart.thoughtSignature).toBeUndefined();
	});

	it("handles parallel function calls with signature only on first", async () => {
		const geminiResponse = {
			candidates: [
				{
					content: {
						role: "model",
						parts: [
							{
								functionCall: { name: "get_temp", args: { location: "Paris" } },
								thoughtSignature: "sig_parallel",
							},
							{
								functionCall: { name: "get_temp", args: { location: "London" } },
								// No signature on second parallel call
							},
						],
					},
					finishReason: "STOP",
				},
			],
			usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, totalTokenCount: 18 },
		};

		globalThis.fetch = mockFetchResponse(geminiResponse);

		const provider = new GoogleProvider(FAKE_KEY);
		const result = await provider.chat({
			model: "gemini-2.5-flash",
			messages: [{ role: "user", content: "weather in Paris and London" }],
			tools: [
				{
					name: "get_temp",
					description: "Get temperature",
					input_schema: { type: "object", properties: { location: { type: "string" } } },
				},
			],
		});

		const toolBlocks = result.content.filter((b) => b.type === "tool_use");
		expect(toolBlocks).toHaveLength(2);

		// First has signature
		if (toolBlocks[0].type === "tool_use") {
			expect(toolBlocks[0].providerMetadata).toEqual({ thoughtSignature: "sig_parallel" });
		}
		// Second does not
		if (toolBlocks[1].type === "tool_use") {
			expect(toolBlocks[1].providerMetadata).toBeUndefined();
		}
	});
});
