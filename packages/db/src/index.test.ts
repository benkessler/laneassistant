import { describe, expect, it } from "vitest";

describe("@openviktor/db", () => {
	it("exports prisma client module", async () => {
		// Verify the module can be imported without errors
		// Full database tests will use testcontainers in integration tests
		const mod = await import("./index.js");
		expect(mod).toBeDefined();
	});
});
