import type { LLMToolDefinition, ToolResult } from "@openviktor/shared";
import type { ToolExecutionContext, ToolExecutor } from "../registry.js";
import type { SpacesService } from "./service.js";

export const initAppProjectDefinition: LLMToolDefinition = {
	name: "init_app_project",
	description:
		"Create a new Viktor Spaces app project. Read the viktor_spaces_dev skill first for the full development workflow. Sets up Convex backend (dev+prod), Vercel frontend, and database record. Template uses React 19 + Vite (src/App.tsx), Convex functions in convex/. CRITICAL: The template includes convex/viktorTools.ts with a callTool action — ALWAYS use it for Viktor API calls (AI, search, images). NEVER write custom fetch logic or hardcode URLs. Usage: `await ctx.runAction(api.viktorTools.callTool, { role: 'quick_ai_search', arguments: { search_question: msg } })`.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Unique name for the app project" },
			description: { type: "string", description: "Optional description of the app" },
		},
		required: ["project_name"],
	},
};

export const deployAppDefinition: LLMToolDefinition = {
	name: "deploy_app",
	description: "Deploy a Viktor Spaces app to preview or production environment.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the app project to deploy" },
			environment: {
				type: "string",
				enum: ["preview", "production"],
				description: "Target deployment environment",
			},
			commit_message: {
				type: "string",
				description: "Optional commit message for this deployment",
			},
		},
		required: ["project_name", "environment"],
	},
};

export const listAppsDefinition: LLMToolDefinition = {
	name: "list_apps",
	description: "List all Viktor Spaces app projects in this workspace.",
	input_schema: {
		type: "object",
		properties: {},
	},
};

export const getAppStatusDefinition: LLMToolDefinition = {
	name: "get_app_status",
	description: "Get detailed status and deployment info for a Viktor Spaces app.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the app project" },
		},
		required: ["project_name"],
	},
};

export const queryAppDatabaseDefinition: LLMToolDefinition = {
	name: "query_app_database",
	description: "Query the Convex database of a Viktor Spaces app.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the app project" },
			function_name: {
				type: "string",
				description: "Convex query function name (e.g. 'tasks:list')",
			},
			environment: {
				type: "string",
				enum: ["dev", "prod"],
				description: "Which Convex deployment to query",
			},
			args: {
				type: "object",
				description: "Arguments to pass to the Convex function",
			},
		},
		required: ["project_name", "function_name", "environment"],
	},
};

export const deleteAppProjectDefinition: LLMToolDefinition = {
	name: "delete_app_project",
	description:
		"Delete a Viktor Spaces app project and all associated resources (Convex project, Vercel project, database record).",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the app project to delete" },
		},
		required: ["project_name"],
	},
};

export const spacesToolDefinitions: LLMToolDefinition[] = [
	initAppProjectDefinition,
	deployAppDefinition,
	listAppsDefinition,
	getAppStatusDefinition,
	queryAppDatabaseDefinition,
	deleteAppProjectDefinition,
];

async function wrapCall(fn: () => Promise<unknown>): Promise<ToolResult> {
	const start = Date.now();
	try {
		const output = await fn();
		return { output, durationMs: Date.now() - start };
	} catch (error) {
		return {
			output: null,
			durationMs: Date.now() - start,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export function createSpacesToolExecutors(service: SpacesService): Record<string, ToolExecutor> {
	return {
		init_app_project: (args, ctx) =>
			wrapCall(() =>
				service.initProject(
					ctx.workspaceId,
					args.project_name as string,
					args.description as string | undefined,
				),
			),

		deploy_app: (args, ctx) =>
			wrapCall(() =>
				service.deploy(
					ctx.workspaceId,
					args.project_name as string,
					args.environment as "preview" | "production",
					args.commit_message as string | undefined,
				),
			),

		list_apps: (_args, ctx) => wrapCall(() => service.listSpaces(ctx.workspaceId)),

		get_app_status: (args, ctx) =>
			wrapCall(() => service.getStatus(ctx.workspaceId, args.project_name as string)),

		query_app_database: (args, ctx) =>
			wrapCall(() =>
				service.queryDatabase(
					ctx.workspaceId,
					args.project_name as string,
					args.function_name as string,
					(args.args as Record<string, unknown>) ?? {},
					args.environment as "dev" | "prod",
				),
			),

		delete_app_project: (args, ctx) =>
			wrapCall(() => service.deleteProject(ctx.workspaceId, args.project_name as string)),
	};
}
