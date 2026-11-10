import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = resolve(currentDir, "../template");

describe("Spaces app template", () => {
	it("contains required files", () => {
		expect(existsSync(resolve(TEMPLATE_DIR, "package.json"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "vite.config.ts"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "tsconfig.json"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "index.html"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "biome.json"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "convex/schema.ts"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "src/main.tsx"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "src/App.tsx"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, ".env.example"))).toBe(true);
	});
});
