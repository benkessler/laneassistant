import { describe, expect, it } from "vitest";
import { type TokenUsage, calculateCostCents } from "../pricing.js";

function usage(overrides: Partial<TokenUsage> = {}): TokenUsage {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationInputTokens: 0,
		cacheReadInputTokens: 0,
		...overrides,
	};
}

describe("calculateCostCents", () => {
	it("calculates cost for Sonnet (input + output)", () => {
		const cost = calculateCostCents(
			"claude-sonnet-4-20250514",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		// $3 input + $15 output = $18 = 1800 cents
		expect(cost).toBe(1800);
	});

	it("calculates cost for Opus", () => {
		const cost = calculateCostCents(
			"claude-opus-4-20250514",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		// $5 input + $25 output = $30 = 3000 cents
		expect(cost).toBe(3000);
	});

	it("calculates cost for Haiku", () => {
		const cost = calculateCostCents(
			"claude-haiku-4-5-20251001",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		// $1 input + $5 output = $6 = 600 cents
		expect(cost).toBe(600);
	});

	it("accounts for cache creation tokens", () => {
		const cost = calculateCostCents(
			"claude-sonnet-4-20250514",
			usage({
				inputTokens: 1_000_000,
				outputTokens: 0,
				cacheCreationInputTokens: 500_000,
			}),
		);
		// Regular input: 1M * $3/MTok = $3
		// Cache creation: 500K * $3.75/MTok = $1.875
		// Total = $4.875 = 487.5 cents
		expect(cost).toBe(487.5);
	});

	it("accounts for cache read tokens", () => {
		const cost = calculateCostCents(
			"claude-sonnet-4-20250514",
			usage({
				inputTokens: 1_000_000,
				outputTokens: 0,
				cacheReadInputTokens: 400_000,
			}),
		);
		// Input: 1M * $3/MTok = $3.00
		// Cache read: 400K * $0.30/MTok = $0.12
		// Total = $3.12 = 312 cents
		expect(cost).toBe(312);
	});

	it("returns 0 for zero tokens", () => {
		expect(calculateCostCents("claude-sonnet-4-20250514", usage())).toBe(0);
	});

	it("handles small token counts without floating point issues", () => {
		const cost = calculateCostCents(
			"claude-sonnet-4-20250514",
			usage({ inputTokens: 100, outputTokens: 50 }),
		);
		// 100 * $3/MTok + 50 * $15/MTok = $0.0003 + $0.00075 = $0.00105 = 0.105 cents
		expect(cost).toBe(0.105);
	});

	it("falls back to Sonnet pricing for unknown models", () => {
		const cost = calculateCostCents(
			"claude-unknown-model",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		expect(cost).toBe(1800);
	});

	it("returns zero cost for ollama models", () => {
		const cost = calculateCostCents(
			"ollama/llama3.2",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		expect(cost).toBe(0);
	});

	it("returns zero cost for any ollama model variant", () => {
		const cost = calculateCostCents(
			"ollama/deepseek-r1:7b",
			usage({ inputTokens: 500_000, outputTokens: 200_000 }),
		);
		expect(cost).toBe(0);
	});

	it("calculates cost for GPT-4o", () => {
		const cost = calculateCostCents(
			"gpt-4o-2024-08-06",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		// $2.50 input + $10 output = $12.50 = 1250 cents
		expect(cost).toBe(1250);
	});

	it("calculates cost for GPT-4o-mini", () => {
		const cost = calculateCostCents(
			"gpt-4o-mini",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		// $0.15 input + $0.60 output = $0.75 = 75 cents
		expect(cost).toBe(75);
	});

	it("calculates cost for GPT-4.1", () => {
		const cost = calculateCostCents(
			"gpt-4.1-2025-04-14",
			usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }),
		);
		// $2 input + $8 output = $10 = 1000 cents
		expect(cost).toBe(1000);
	});
});
