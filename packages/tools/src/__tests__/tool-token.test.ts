import { describe, expect, it } from "vitest";
import {
	createWorkspaceToolToken,
	setToolTokenSecret,
	verifyWorkspaceToolToken,
} from "../tool-token.js";

describe("workspace tool tokens", () => {
	it("round-trips the workspace id", () => {
		const token = createWorkspaceToolToken("ws_abc");
		expect(verifyWorkspaceToolToken(token)).toBe("ws_abc");
	});

	it("issues different tokens for different workspaces", () => {
		expect(createWorkspaceToolToken("ws_a")).not.toBe(createWorkspaceToolToken("ws_b"));
	});

	it("rejects the legacy static token", () => {
		expect(verifyWorkspaceToolToken("local")).toBeNull();
	});

	it("rejects a token whose workspace id was swapped", () => {
		const signature = createWorkspaceToolToken("ws_a").split(".").pop();
		expect(verifyWorkspaceToolToken(`ws_b.${signature}`)).toBeNull();
	});

	it("rejects tokens signed with a different secret", () => {
		const token = createWorkspaceToolToken("ws_a");
		setToolTokenSecret("another-secret");
		expect(verifyWorkspaceToolToken(token)).toBeNull();
	});

	it("rejects malformed tokens", () => {
		expect(verifyWorkspaceToolToken("")).toBeNull();
		expect(verifyWorkspaceToolToken(".abc")).toBeNull();
		expect(verifyWorkspaceToolToken("ws_a.short")).toBeNull();
	});
});
