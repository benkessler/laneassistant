import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

let secret: string = process.env.TOOL_TOKEN_SECRET || randomBytes(32).toString("hex");

/** Overrides the signing secret. Use only in tests, or when several processes must share tokens. */
export function setToolTokenSecret(value: string): void {
	secret = value;
}

function sign(workspaceId: string): string {
	return createHmac("sha256", secret).update(workspaceId).digest("hex");
}

/**
 * Returns the bearer token that authorizes tool-gateway calls for exactly one workspace.
 * The workspace is carried inside the token, so concurrent runs for different
 * workspaces can never be routed to each other's sandbox.
 */
export function createWorkspaceToolToken(workspaceId: string): string {
	return `${workspaceId}.${sign(workspaceId)}`;
}

/** Returns the workspace a token was issued for, or null if the token is invalid. */
export function verifyWorkspaceToolToken(token: string): string | null {
	const dot = token.lastIndexOf(".");
	if (dot <= 0) return null;
	const workspaceId = token.slice(0, dot);
	const given = Buffer.from(token.slice(dot + 1), "utf8");
	const expected = Buffer.from(sign(workspaceId), "utf8");
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
	return workspaceId;
}
