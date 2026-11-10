import { action } from "./_generated/server";
import { v } from "convex/values";

/**
 * Example: call Viktor's tools from this Spaces app.
 *
 * Environment variables (set automatically in .env.local):
 *   VIKTOR_SPACES_API_URL     — base URL of the Viktor instance
 *   VIKTOR_SPACES_PROJECT_NAME — this app's project name
 *   VIKTOR_SPACES_PROJECT_SECRET — auth secret for this app
 *
 * Available tools (role field): quick_ai_search, coworker_text2im,
 * coworker_send_slack_message, and any other tool in the Viktor registry.
 */
export const callTool = action({
	args: {
		role: v.string(),
		arguments: v.any(),
	},
	handler: async (_ctx, { role, arguments: toolArgs }) => {
		const apiUrl = process.env.VIKTOR_SPACES_API_URL;
		const projectName = process.env.VIKTOR_SPACES_PROJECT_NAME;
		const projectSecret = process.env.VIKTOR_SPACES_PROJECT_SECRET;

		if (!apiUrl || !projectName || !projectSecret) {
			throw new Error("Viktor Spaces API credentials not configured in environment");
		}

		const res = await fetch(`${apiUrl}/api/viktor-spaces/tools/call`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				project_name: projectName,
				project_secret: projectSecret,
				role,
				arguments: toolArgs,
			}),
		});

		const data = (await res.json()) as { success: boolean; result?: unknown; error?: string };

		if (!data.success) {
			throw new Error(data.error ?? "Viktor API call failed");
		}

		return data.result;
	},
});
