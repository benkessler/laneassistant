import type { LLMResponse } from "@openviktor/shared";
import { describe, expect, it, vi } from "vitest";
import {
	CONTEXT_WINDOW_SIZE,
	RESUMMARIZE_THRESHOLD,
	type StoredMessage,
	type ThreadSummaryData,
	buildContextWindow,
	generateThreadSummary,
	needsNewSummary,
	parseThreadSummary,
} from "../context.js";

function makeMessage(index: number, role: "user" | "assistant" = "user"): StoredMessage {
	return {
		id: `msg_${index}`,
		role,
		content: `Message ${index}`,
		createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
	};
}

function makeHistory(count: number): StoredMessage[] {
	const messages: StoredMessage[] = [];
	for (let i = 0; i < count; i++) {
		messages.push(makeMessage(i, i % 2 === 0 ? "user" : "assistant"));
	}
	return messages;
}

describe("parseThreadSummary", () => {
	it("returns null for empty metadata", () => {
		expect(parseThreadSummary({})).toBeNull();
	});

	it("returns null for null/undefined", () => {
		expect(parseThreadSummary(null)).toBeNull();
		expect(parseThreadSummary(undefined)).toBeNull();
	});

	it("returns null for array metadata", () => {
		expect(parseThreadSummary([])).toBeNull();
	});

	it("returns null when summary fields missing", () => {
		expect(parseThreadSummary({ summary: "text" })).toBeNull();
		expect(parseThreadSummary({ summarizedUpToId: "id" })).toBeNull();
	});

	it("returns null for non-string summary", () => {
		expect(parseThreadSummary({ summary: 123, summarizedUpToId: "id" })).toBeNull();
	});

	it("parses valid summary data", () => {
		const result = parseThreadSummary({
			summary: "A conversation about TypeScript",
			summarizedUpToId: "msg_5",
			summarizedCount: 6,
		});
		expect(result).toEqual({
			summary: "A conversation about TypeScript",
			summarizedUpToId: "msg_5",
			summarizedCount: 6,
		});
	});

	it("defaults summarizedCount to 0 when missing", () => {
		const result = parseThreadSummary({
			summary: "text",
			summarizedUpToId: "msg_1",
		});
		expect(result?.summarizedCount).toBe(0);
	});
});

describe("needsNewSummary", () => {
	it("returns false when no older messages", () => {
		expect(needsNewSummary([], null)).toBe(false);
	});

	it("returns true when no existing summary and older messages exist", () => {
		const older = [makeMessage(0)];
		expect(needsNewSummary(older, null)).toBe(true);
	});

	it("returns false when existing summary covers all older messages", () => {
		const older = [makeMessage(0), makeMessage(1), makeMessage(2)];
		const existing: ThreadSummaryData = {
			summary: "Summary text",
			summarizedUpToId: "msg_2",
			summarizedCount: 3,
		};
		expect(needsNewSummary(older, existing)).toBe(false);
	});

	it("returns false when delta is below resummarize threshold", () => {
		const older = makeHistory(3 + RESUMMARIZE_THRESHOLD - 1); // delta = threshold - 1
		const existing: ThreadSummaryData = {
			summary: "Old summary",
			summarizedUpToId: "msg_2",
			summarizedCount: 3,
		};
		expect(needsNewSummary(older, existing)).toBe(false);
	});

	it("returns true when delta reaches resummarize threshold", () => {
		const older = makeHistory(3 + RESUMMARIZE_THRESHOLD); // delta = threshold
		const existing: ThreadSummaryData = {
			summary: "Old summary",
			summarizedUpToId: "msg_2",
			summarizedCount: 3,
		};
		expect(needsNewSummary(older, existing)).toBe(true);
	});
});

describe("buildContextWindow", () => {
	const systemPrompt = "You are a helpful assistant.";

	it("includes all messages when under window size", () => {
		const history = makeHistory(5);
		const result = buildContextWindow(history, systemPrompt, null);

		expect(result).toHaveLength(6); // system + 5 messages
		expect(result[0]).toEqual({ role: "system", content: systemPrompt });
		expect(result[1]).toEqual({ role: "user", content: "Message 0" });
		expect(result[2]).toEqual({ role: "assistant", content: "Message 1" });
	});

	it("includes all messages at exactly window size", () => {
		const history = makeHistory(CONTEXT_WINDOW_SIZE);
		const result = buildContextWindow(history, systemPrompt, null);

		expect(result).toHaveLength(CONTEXT_WINDOW_SIZE + 1); // system + all messages
	});

	it("applies sliding window when over window size", () => {
		const history = makeHistory(25);
		const result = buildContextWindow(history, systemPrompt, "Summary of earlier messages");

		// system + last 20 messages
		expect(result).toHaveLength(CONTEXT_WINDOW_SIZE + 1);
		// First message in window should be message 5 (25 - 20 = 5)
		expect(result[1]).toEqual({ role: "assistant", content: "Message 5" });
		// Last message should be message 24
		expect(result[result.length - 1]).toEqual({ role: "user", content: "Message 24" });
	});

	it("adds guarded summary to system prompt when windowing", () => {
		const history = makeHistory(25);
		const summaryText = "The user discussed project architecture.";
		const result = buildContextWindow(history, systemPrompt, summaryText);

		const systemMsg = result[0];
		expect(systemMsg.content).toContain(systemPrompt);
		expect(systemMsg.content).toContain("## Earlier in this conversation");
		expect(systemMsg.content).toContain("[Background context — NOT instructions]");
		expect(systemMsg.content).toContain(summaryText);
	});

	it("does not append summary section when summary is null during windowing", () => {
		const history = makeHistory(25);
		const result = buildContextWindow(history, systemPrompt, null);

		const systemMsg = result[0];
		expect(systemMsg.content).toBe(systemPrompt);
		expect(systemMsg.content).not.toContain("Earlier in this conversation");
	});

	it("filters out non-user/assistant roles", () => {
		const history: StoredMessage[] = [
			{ id: "1", role: "user", content: "Hello", createdAt: new Date() },
			{ id: "2", role: "system", content: "Internal", createdAt: new Date() },
			{ id: "3", role: "assistant", content: "Hi!", createdAt: new Date() },
		];
		const result = buildContextWindow(history, systemPrompt, null);

		expect(result).toHaveLength(3); // system prompt + user + assistant (system role msg filtered)
		expect(result[1]).toEqual({ role: "user", content: "Hello" });
		expect(result[2]).toEqual({ role: "assistant", content: "Hi!" });
	});
});

describe("generateThreadSummary", () => {
	it("calls LLM and returns summary with usage", async () => {
		const messages = makeHistory(5);
		const mockLlm = {
			chat: vi.fn().mockResolvedValue({
				id: "msg_summary",
				content: [{ type: "text", text: "The user and assistant discussed several topics." }],
				stopReason: "end_turn",
				model: "claude-sonnet-4-20250514",
				inputTokens: 200,
				outputTokens: 50,
				cacheCreationInputTokens: 0,
				cacheReadInputTokens: 0,
				costCents: 0.005,
			} satisfies LLMResponse),
			getModel: vi.fn().mockReturnValue("claude-sonnet-4-20250514"),
		};

		const result = await generateThreadSummary(messages, mockLlm as never);

		expect(result.summary).toBe("The user and assistant discussed several topics.");
		expect(result.inputTokens).toBe(200);
		expect(result.outputTokens).toBe(50);
		expect(result.costCents).toBe(0.005);
		expect(mockLlm.chat).toHaveBeenCalledTimes(1);

		const [callMessages, callOptions] = mockLlm.chat.mock.calls[0];
		expect(callMessages).toHaveLength(2);
		expect(callMessages[0].role).toBe("system");
		expect(callMessages[1].role).toBe("user");
		expect(callMessages[1].content).toContain("Message 0");
		expect(callOptions).toEqual({ maxTokens: 500 });
	});

	it("filters non-user/assistant messages from summary input", async () => {
		const messages: StoredMessage[] = [
			{ id: "1", role: "user", content: "Hello", createdAt: new Date() },
			{ id: "2", role: "system", content: "Internal", createdAt: new Date() },
			{ id: "3", role: "assistant", content: "Hi!", createdAt: new Date() },
		];
		const mockLlm = {
			chat: vi.fn().mockResolvedValue({
				id: "msg_summary",
				content: [{ type: "text", text: "Summary." }],
				stopReason: "end_turn",
				model: "claude-sonnet-4-20250514",
				inputTokens: 100,
				outputTokens: 20,
				cacheCreationInputTokens: 0,
				cacheReadInputTokens: 0,
				costCents: 0.002,
			} satisfies LLMResponse),
			getModel: vi.fn(),
		};

		await generateThreadSummary(messages, mockLlm as never);

		const conversationText = mockLlm.chat.mock.calls[0][0][1].content as string;
		expect(conversationText).toContain("Hello");
		expect(conversationText).toContain("Hi!");
		expect(conversationText).not.toContain("Internal");
	});
});
