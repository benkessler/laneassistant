/**
 * Python SDK generator for OpenViktor.
 *
 * Reads tool definitions from the registry and generates Python modules
 * that wrap each tool as an async function calling the tool gateway.
 *
 * Output structure (written to workspace/sdk/):
 *   sdk/
 *     __init__.py
 *     internal/
 *       __init__.py
 *       client.py          ← copied from infra/sdk/client.py
 *     tools/
 *       __init__.py
 *       default_tools.py   ← bash, file_*, glob, grep, etc.
 *       utils_tools.py     ← ai_structured_output, quick_ai_search, etc.
 *       ...
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { LLMToolDefinition } from "@openviktor/shared";

// ---------------------------------------------------------------------------
// Tool → module grouping
// ---------------------------------------------------------------------------

const TOOL_GROUPS: Record<string, string[]> = {
	default_tools: [
		"bash",
		"file_read",
		"file_write",
		"file_edit",
		"glob",
		"grep",
		"view_image",
		"coworker_send_slack_message",
		"coworker_update_slack_message",
		"coworker_slack_history",
		"coworker_slack_react",
		"coworker_delete_slack_message",
		"coworker_upload_to_slack",
		"coworker_download_from_slack",
		"create_thread",
		"send_message_to_thread",
	],
	slack_admin_tools: [
		"coworker_list_slack_channels",
		"coworker_join_slack_channels",
		"coworker_open_slack_conversation",
		"coworker_leave_slack_channels",
		"coworker_list_slack_users",
		"coworker_invite_slack_user_to_team",
		"coworker_get_slack_reactions",
		"coworker_report_issue",
	],
	browser_tools: ["browser_create_session", "browser_download_files", "browser_close_session"],
	github_tools: ["coworker_git", "coworker_github_cli"],
	utils_tools: [
		"file_to_markdown",
		"ai_structured_output",
		"quick_ai_search",
		"coworker_text2im",
		"create_custom_api_integration",
		"workspace_tree",
	],
	docs_tools: ["resolve_library_id", "query_library_docs"],
	scheduled_crons: ["create_agent_cron", "create_script_cron", "delete_cron", "trigger_cron"],
	thread_orchestration_tools: ["list_running_paths", "get_path_info"],
};

/** Reverse lookup: tool name → module name. */
function buildToolToModule(): Map<string, string> {
	const map = new Map<string, string>();
	for (const [mod, tools] of Object.entries(TOOL_GROUPS)) {
		for (const t of tools) {
			map.set(t, mod);
		}
	}
	return map;
}

// ---------------------------------------------------------------------------
// JSON Schema → Python type mapping
// ---------------------------------------------------------------------------

interface SchemaProp {
	type?: string;
	description?: string;
	enum?: unknown[];
	items?: { type?: string };
	default?: unknown;
}

function jsonTypeToPython(prop: SchemaProp): string {
	if (prop.enum && prop.enum.length > 0) {
		const literals = prop.enum.map((v) => JSON.stringify(v)).join(", ");
		return `Literal[${literals}]`;
	}
	switch (prop.type) {
		case "string":
			return "str";
		case "integer":
			return "int";
		case "number":
			return "float";
		case "boolean":
			return "bool";
		case "array": {
			const itemType = prop.items?.type ? jsonTypeToPython({ type: prop.items.type }) : "Any";
			return `list[${itemType}]`;
		}
		case "object":
			return "dict";
		default:
			return "Any";
	}
}

function defaultValuePython(prop: SchemaProp): string | null {
	if (prop.default === undefined || prop.default === null) return null;
	if (typeof prop.default === "string") return JSON.stringify(prop.default);
	if (typeof prop.default === "boolean") return prop.default ? "True" : "False";
	if (typeof prop.default === "number") return String(prop.default);
	return JSON.stringify(prop.default);
}

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

interface ParamInfo {
	name: string;
	pyType: string;
	required: boolean;
	defaultVal: string | null;
	description?: string;
}

function extractParams(schema: Record<string, unknown>): ParamInfo[] {
	const props = (schema.properties ?? {}) as Record<string, SchemaProp>;
	const required = new Set<string>((schema.required as string[]) ?? []);
	const params: ParamInfo[] = [];

	for (const [name, prop] of Object.entries(props)) {
		if (name.startsWith("_")) continue; // skip internal fields
		const isRequired = required.has(name);
		const pyType = jsonTypeToPython(prop);
		const defaultVal = defaultValuePython(prop);

		params.push({
			name,
			pyType: isRequired ? pyType : `${pyType} | None`,
			required: isRequired,
			defaultVal: isRequired ? null : (defaultVal ?? "None"),
			description: prop.description,
		});
	}

	// Sort: required params first, then optional
	params.sort((a, b) => {
		if (a.required && !b.required) return -1;
		if (!a.required && b.required) return 1;
		return 0;
	});

	return params;
}

function generateFunction(def: LLMToolDefinition): string {
	const params = extractParams(def.input_schema as Record<string, unknown>);

	// Function signature
	const sigParts = params.map((p) => {
		if (p.defaultVal !== null) return `${p.name}: ${p.pyType} = ${p.defaultVal}`;
		return `${p.name}: ${p.pyType}`;
	});
	const sig = sigParts.length > 0 ? sigParts.join(", ") : "";

	// Docstring
	const docLines: string[] = [];
	if (def.description) {
		docLines.push(`    """${def.description}`);
	} else {
		docLines.push(`    """Call the ${def.name} tool.`);
	}
	if (params.length > 0) {
		docLines.push("");
		docLines.push("    Args:");
		for (const p of params) {
			const desc = p.description ? `: ${p.description}` : "";
			docLines.push(`        ${p.name}${desc}`);
		}
	}
	docLines.push('    """');

	// Call args
	const callArgs = params.map((p) => `${p.name}=${p.name}`).join(", ");

	const lines = [
		"",
		"",
		`async def ${def.name}(${sig}):`,
		docLines.join("\n"),
		`    return await get_client().acall("${def.name}", ${callArgs})`,
	];

	return lines.join("\n");
}

function generateModule(moduleName: string, tools: LLMToolDefinition[]): string {
	const hasLiteral = tools.some((t) => {
		const props = ((t.input_schema as Record<string, unknown>).properties ?? {}) as Record<
			string,
			SchemaProp
		>;
		return Object.values(props).some((p) => p.enum && p.enum.length > 0);
	});

	const imports: string[] = [
		`"""Auto-generated tool module for ${moduleName}."""`,
		"",
		"from __future__ import annotations",
		"",
	];

	if (hasLiteral) {
		imports.push("from typing import Any, Literal");
	} else {
		imports.push("from typing import Any");
	}

	imports.push("");
	imports.push("from sdk.internal.client import get_client");

	const functions = tools.map(generateFunction);

	return `${imports.join("\n")}${functions.join("\n")}\n`;
}

function generateToolsInit(moduleNames: string[]): string {
	const lines = [
		'"""OpenViktor Tools SDK.',
		"",
		"Auto-generated async Python functions for calling tools through the gateway.",
		"",
		"Available tool groups:",
		...moduleNames.map((m) => `  - ${m}`),
		"",
		"Example:",
		"    from sdk.tools.default_tools import bash",
		"",
		'    result = await bash(command="ls -la")',
		'"""',
		"",
		"__all__ = [",
		...moduleNames.map((m) => `    "${m}",`),
		"]",
		"",
	];
	return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface GenerateSdkOptions {
	/** All tool definitions from the registry. */
	tools: LLMToolDefinition[];
	/** Absolute path to write the SDK to (e.g., /data/workspaces/{id}/sdk). */
	outputDir: string;
	/** Path to client.py template. Resolved from repo root if relative. */
	clientTemplatePath?: string;
}

export async function generateSdk(opts: GenerateSdkOptions): Promise<string[]> {
	const { tools, outputDir } = opts;
	const toolToModule = buildToolToModule();
	const written: string[] = [];

	// Group tools by module
	const modules = new Map<string, LLMToolDefinition[]>();
	const ungrouped: LLMToolDefinition[] = [];

	for (const tool of tools) {
		const mod = toolToModule.get(tool.name);
		if (mod) {
			const existing = modules.get(mod) ?? [];
			existing.push(tool);
			modules.set(mod, existing);
		} else if (tool.name.startsWith("mcp_pd_")) {
			// Pipedream integration tools — group by app slug
			const parts = tool.name.replace("mcp_pd_", "").split("_");
			const appSlug = parts[0];
			const modName = `pd_${appSlug}`;
			const existing = modules.get(modName) ?? [];
			existing.push(tool);
			modules.set(modName, existing);
		} else {
			ungrouped.push(tool);
		}
	}

	// Put ungrouped tools into a catch-all module
	if (ungrouped.length > 0) {
		const existing = modules.get("extra_tools") ?? [];
		existing.push(...ungrouped);
		modules.set("extra_tools", existing);
	}

	// Create directory structure
	const internalDir = join(outputDir, "internal");
	const toolsDir = join(outputDir, "tools");
	await mkdir(internalDir, { recursive: true });
	await mkdir(toolsDir, { recursive: true });

	// Write sdk/__init__.py
	await writeFile(join(outputDir, "__init__.py"), "");
	written.push("sdk/__init__.py");

	// Write sdk/internal/__init__.py
	await writeFile(join(internalDir, "__init__.py"), "");
	written.push("sdk/internal/__init__.py");

	// Write sdk/internal/client.py
	const clientPath =
		opts.clientTemplatePath ?? join(dirname(__filename), "../../..", "infra/sdk/client.py");
	let clientContent: string;
	try {
		clientContent = readFileSync(clientPath, "utf-8");
	} catch {
		// Fallback: try relative to this file's compiled location
		const altPath = join(process.cwd(), "infra/sdk/client.py");
		clientContent = readFileSync(altPath, "utf-8");
	}
	await writeFile(join(internalDir, "client.py"), clientContent);
	written.push("sdk/internal/client.py");

	// Write sdk/tools/__init__.py
	const moduleNames = [...modules.keys()].sort();
	await writeFile(join(toolsDir, "__init__.py"), generateToolsInit(moduleNames));
	written.push("sdk/tools/__init__.py");

	// Write each module
	for (const [modName, modTools] of modules) {
		const content = generateModule(modName, modTools);
		await writeFile(join(toolsDir, `${modName}.py`), content);
		written.push(`sdk/tools/${modName}.py`);
	}

	return written;
}

// Allow running as a script for testing
const __filename = new URL(import.meta.url).pathname;
