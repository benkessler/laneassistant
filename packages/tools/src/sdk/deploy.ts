/**
 * Deploy the Python SDK to a workspace directory.
 *
 * Checks if sdk/internal/client.py exists; if not, generates the full SDK.
 * Call this during workspace initialization or bot startup.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { LLMToolDefinition } from "@openviktor/shared";
import { getWorkspaceDir } from "../workspace.js";
import { generateSdk } from "./generate.js";

export async function deploySdkToWorkspace(
	workspaceId: string,
	tools: LLMToolDefinition[],
	options?: { force?: boolean },
): Promise<string[]> {
	const workspaceDir = getWorkspaceDir(workspaceId);
	const sdkDir = join(workspaceDir, "sdk");
	const clientPath = join(sdkDir, "internal", "client.py");

	// Skip if already deployed (unless forced)
	if (!options?.force && existsSync(clientPath)) {
		return [];
	}

	return generateSdk({
		tools,
		outputDir: sdkDir,
	});
}
