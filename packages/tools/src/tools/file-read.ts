import { readFile, stat } from "node:fs/promises";
import type { LLMToolDefinition } from "@openviktor/shared";
import type { ToolExecutor } from "../registry.js";
import { resolveSafePathStrict } from "../workspace.js";

const MAX_OUTPUT_BYTES = 32_768;

export const fileReadDefinition: LLMToolDefinition = {
	name: "file_read",
	description:
		"Read the contents of a file. Returns line-numbered output. Supports offset and limit for large files.",
	input_schema: {
		type: "object",
		properties: {
			path: {
				type: "string",
				description: "File path relative to the workspace root",
			},
			offset: {
				type: "number",
				description: "Starting line number (1-based, default: 1)",
			},
			limit: {
				type: "number",
				description: "Maximum number of lines to return (default: all)",
			},
		},
		required: ["path"],
	},
};

export const fileReadExecutor: ToolExecutor = async (args, ctx) => {
	const filePath = args.path as string;
	const offset = typeof args.offset === "number" ? Math.max(1, args.offset) : 1;
	const limit = typeof args.limit === "number" ? args.limit : undefined;

	const absPath = await resolveSafePathStrict(ctx.workspaceDir, filePath);

	const fileStat = await stat(absPath);
	if (!fileStat.isFile()) {
		return { output: null, durationMs: 0, error: `Not a file: ${filePath}` };
	}

	const raw = await readFile(absPath, "utf-8");
	const allLines = raw.split("\n");
	const startIdx = offset - 1;
	const sliced =
		limit !== undefined ? allLines.slice(startIdx, startIdx + limit) : allLines.slice(startIdx);

	let result = sliced
		.map((line, i) => `${String(startIdx + i + 1).padStart(6)}\t${line}`)
		.join("\n");

	let truncated = false;
	if (result.length > MAX_OUTPUT_BYTES) {
		result = result.slice(0, MAX_OUTPUT_BYTES);
		truncated = true;
	}

	return {
		output: {
			content: result + (truncated ? "\n... (output truncated)" : ""),
			total_lines: allLines.length,
			lines_shown: sliced.length,
		},
		durationMs: 0,
	};
};
