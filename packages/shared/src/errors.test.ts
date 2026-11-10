import { describe, expect, it } from "vitest";
import { AppError, ConfigError, LLMError, SlackError, ToolTimeoutError } from "./errors.js";

describe("error classes", () => {
	it("AppError has code and statusCode", () => {
		const err = new AppError("test", "TEST_ERROR", 400);
		expect(err.message).toBe("test");
		expect(err.code).toBe("TEST_ERROR");
		expect(err.statusCode).toBe(400);
		expect(err.name).toBe("AppError");
	});

	it("ConfigError defaults to 500", () => {
		const err = new ConfigError("bad config");
		expect(err.code).toBe("CONFIG_ERROR");
		expect(err.statusCode).toBe(500);
	});

	it("LLMError wraps cause", () => {
		const cause = new Error("upstream");
		const err = new LLMError("llm failed", cause);
		expect(err.code).toBe("LLM_ERROR");
		expect(err.statusCode).toBe(502);
		expect(err.cause).toBe(cause);
	});

	it("ToolTimeoutError includes tool name and timeout", () => {
		const err = new ToolTimeoutError("web_search", 30000);
		expect(err.message).toContain("web_search");
		expect(err.message).toContain("30000");
		expect(err.code).toBe("TOOL_TIMEOUT");
	});

	it("SlackError has correct code", () => {
		const err = new SlackError("slack failed");
		expect(err.code).toBe("SLACK_ERROR");
		expect(err.statusCode).toBe(502);
	});
});
