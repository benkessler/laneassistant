import { existsSync } from "node:fs";
import { mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveSafePath, resolveSafePathStrict } from "../workspace.js";

describe("resolveSafePath", () => {
	const workspaceDir = "/data/workspaces/ws_test";

	it("resolves relative path within workspace", () => {
		const result = resolveSafePath(workspaceDir, "src/index.ts");
		expect(result).toBe("/data/workspaces/ws_test/src/index.ts");
	});

	it("resolves absolute path within workspace", () => {
		const result = resolveSafePath(workspaceDir, "/data/workspaces/ws_test/file.txt");
		expect(result).toBe("/data/workspaces/ws_test/file.txt");
	});

	it("rejects path traversal with ../", () => {
		expect(() => resolveSafePath(workspaceDir, "../other/file")).toThrow("Path escapes workspace");
	});

	it("rejects absolute path outside workspace", () => {
		expect(() => resolveSafePath(workspaceDir, "/etc/passwd")).toThrow("Path escapes workspace");
	});

	it("allows workspace root itself", () => {
		const result = resolveSafePath(workspaceDir, ".");
		expect(result).toBe(workspaceDir);
	});
});

describe("resolveSafePathStrict", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `workspace-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	it("resolves valid file path", async () => {
		const filePath = join(tempDir, "test.txt");
		await writeFile(filePath, "content");

		const result = await resolveSafePathStrict(tempDir, "test.txt");
		expect(result).toBe(filePath);
	});

	it("rejects symlink pointing outside workspace", async () => {
		const linkPath = join(tempDir, "evil_link");
		await symlink("/etc/passwd", linkPath);

		await expect(resolveSafePathStrict(tempDir, "evil_link")).rejects.toThrow(
			"Symlink escapes workspace",
		);
	});

	it("allows symlink within workspace", async () => {
		const targetPath = join(tempDir, "real.txt");
		await writeFile(targetPath, "content");
		const linkPath = join(tempDir, "link.txt");
		await symlink(targetPath, linkPath);

		const result = await resolveSafePathStrict(tempDir, "link.txt");
		expect(result).toBe(linkPath);
	});
});
