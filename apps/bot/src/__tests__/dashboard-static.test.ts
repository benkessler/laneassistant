import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDashboardStaticHandler } from "../dashboard-static.js";

const root = join(tmpdir(), `dashboard-${randomUUID()}`);
const dist = join(root, "dist");

beforeAll(() => {
	mkdirSync(join(dist, "assets"), { recursive: true });
	writeFileSync(join(dist, "index.html"), "<html>app</html>");
	writeFileSync(join(dist, "assets", "app-abc.js"), "console.log(1)");
	writeFileSync(join(root, "secret.txt"), "do not serve");
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function get(path: string) {
	return createDashboardStaticHandler(dist)(new Request(`http://localhost${path}`));
}

describe("dashboard static handler", () => {
	it("serves index.html at the root", async () => {
		const res = await get("/");
		expect(await res?.text()).toBe("<html>app</html>");
		expect(res?.headers.get("Content-Type")).toContain("text/html");
	});

	it("falls back to index.html for client-side routes", async () => {
		const res = await get("/runs/abc123");
		expect(await res?.text()).toBe("<html>app</html>");
	});

	it("serves hashed assets with long-lived caching", async () => {
		const res = await get("/assets/app-abc.js");
		expect(await res?.text()).toBe("console.log(1)");
		expect(res?.headers.get("Content-Type")).toContain("javascript");
		expect(res?.headers.get("Cache-Control")).toContain("immutable");
	});

	it("returns null for missing files with an extension", async () => {
		expect(await get("/missing.js")).toBeNull();
	});

	it("does not serve files outside the dist directory", async () => {
		expect(await get("/../secret.txt")).toBeNull();
		expect(await get("/%2e%2e/secret.txt")).toBeNull();
	});

	it("ignores non-GET requests", async () => {
		const handler = createDashboardStaticHandler(dist);
		expect(await handler(new Request("http://localhost/", { method: "POST" }))).toBeNull();
	});

	it("returns null when no build exists", async () => {
		const handler = createDashboardStaticHandler(join(root, "nope"));
		expect(await handler(new Request("http://localhost/"))).toBeNull();
	});
});
