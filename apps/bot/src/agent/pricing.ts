interface ModelPricing {
	inputPerMTok: number;
	outputPerMTok: number;
	cacheWritePerMTok: number;
	cacheReadPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
	"claude-opus-4": {
		inputPerMTok: 5,
		outputPerMTok: 25,
		cacheWritePerMTok: 6.25,
		cacheReadPerMTok: 0.5,
	},
	"claude-sonnet-4": {
		inputPerMTok: 3,
		outputPerMTok: 15,
		cacheWritePerMTok: 3.75,
		cacheReadPerMTok: 0.3,
	},
	"claude-haiku-4": {
		inputPerMTok: 1,
		outputPerMTok: 5,
		cacheWritePerMTok: 1.25,
		cacheReadPerMTok: 0.1,
	},
	"gemini-3.1-pro": {
		inputPerMTok: 2,
		outputPerMTok: 12,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gemini-2.5-flash": {
		inputPerMTok: 0.15,
		outputPerMTok: 0.6,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gemini-2.5-pro": {
		inputPerMTok: 1.25,
		outputPerMTok: 10,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gemini-2.0-flash": {
		inputPerMTok: 0.1,
		outputPerMTok: 0.4,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gemini-1.5-flash": {
		inputPerMTok: 0.075,
		outputPerMTok: 0.3,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gpt-4.1": {
		inputPerMTok: 2,
		outputPerMTok: 8,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gpt-4o": {
		inputPerMTok: 2.5,
		outputPerMTok: 10,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
	"gpt-4o-mini": {
		inputPerMTok: 0.15,
		outputPerMTok: 0.6,
		cacheWritePerMTok: 0,
		cacheReadPerMTok: 0,
	},
};

const ZERO_PRICING: ModelPricing = {
	inputPerMTok: 0,
	outputPerMTok: 0,
	cacheWritePerMTok: 0,
	cacheReadPerMTok: 0,
};

const SORTED_PRICING = Object.entries(PRICING).sort(([a], [b]) => b.length - a.length);

function findPricing(model: string): ModelPricing {
	if (model.startsWith("ollama/")) return ZERO_PRICING;
	for (const [prefix, pricing] of SORTED_PRICING) {
		if (model.startsWith(prefix)) return pricing;
	}
	if (model.startsWith("gemini-")) return PRICING["gemini-2.0-flash"];
	if (model.startsWith("gpt-")) return PRICING["gpt-4o"];
	return PRICING["claude-sonnet-4"];
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
}

export function calculateCostCents(model: string, usage: TokenUsage): number {
	const pricing = findPricing(model);

	const costDollars =
		(usage.inputTokens / 1_000_000) * pricing.inputPerMTok +
		(usage.outputTokens / 1_000_000) * pricing.outputPerMTok +
		(usage.cacheCreationInputTokens / 1_000_000) * pricing.cacheWritePerMTok +
		(usage.cacheReadInputTokens / 1_000_000) * pricing.cacheReadPerMTok;

	return Math.round(costDollars * 100 * 10_000) / 10_000;
}
