import { beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryConcurrencyLimiter } from "../concurrency.js";

function makeLogger() {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		fatal: vi.fn(),
		trace: vi.fn(),
		child: vi.fn(),
		level: "info",
	};
}

describe("InMemoryConcurrencyLimiter", () => {
	let limiter: InMemoryConcurrencyLimiter;
	let logger: ReturnType<typeof makeLogger>;

	beforeEach(() => {
		logger = makeLogger();
		limiter = new InMemoryConcurrencyLimiter(3, logger as never);
	});

	it("acquires slots up to the limit", async () => {
		expect(await limiter.acquire("ws1", "run1")).toBe(true);
		expect(await limiter.acquire("ws1", "run2")).toBe(true);
		expect(await limiter.acquire("ws1", "run3")).toBe(true);
		expect(await limiter.activeCount("ws1")).toBe(3);
	});

	it("rejects when limit is reached", async () => {
		await limiter.acquire("ws1", "run1");
		await limiter.acquire("ws1", "run2");
		await limiter.acquire("ws1", "run3");

		expect(await limiter.acquire("ws1", "run4")).toBe(false);
		expect(await limiter.activeCount("ws1")).toBe(3);
	});

	it("allows acquisition after release", async () => {
		await limiter.acquire("ws1", "run1");
		await limiter.acquire("ws1", "run2");
		await limiter.acquire("ws1", "run3");

		await limiter.release("ws1", "run2");
		expect(await limiter.activeCount("ws1")).toBe(2);

		expect(await limiter.acquire("ws1", "run4")).toBe(true);
		expect(await limiter.activeCount("ws1")).toBe(3);
	});

	it("isolates workspaces", async () => {
		await limiter.acquire("ws1", "run1");
		await limiter.acquire("ws1", "run2");
		await limiter.acquire("ws1", "run3");

		expect(await limiter.acquire("ws2", "run1")).toBe(true);
		expect(await limiter.activeCount("ws1")).toBe(3);
		expect(await limiter.activeCount("ws2")).toBe(1);
	});

	it("returns 0 for unknown workspace", async () => {
		expect(await limiter.activeCount("unknown")).toBe(0);
	});

	it("release is idempotent", async () => {
		await limiter.acquire("ws1", "run1");
		await limiter.release("ws1", "run1");
		await limiter.release("ws1", "run1"); // second release is no-op
		expect(await limiter.activeCount("ws1")).toBe(0);
	});

	it("clears all slots on shutdown", async () => {
		await limiter.acquire("ws1", "run1");
		await limiter.acquire("ws2", "run2");
		await limiter.shutdown();
		expect(await limiter.activeCount("ws1")).toBe(0);
		expect(await limiter.activeCount("ws2")).toBe(0);
	});

	it("saturates capacity immediately when spawning 20 runs with limit 3", async () => {
		const limit = 3;
		const testLimiter = new InMemoryConcurrencyLimiter(limit, logger as never);
		const ws = "ws_stress";

		const results: boolean[] = [];
		for (let i = 0; i < 20; i++) {
			results.push(await testLimiter.acquire(ws, `run_${i}`));
		}

		const acquired = results.filter(Boolean).length;
		const rejected = results.filter((r) => !r).length;

		expect(acquired).toBe(3);
		expect(rejected).toBe(17);
		expect(await testLimiter.activeCount(ws)).toBe(3);
	});

	it("processes all 20 runs when released sequentially", async () => {
		const limit = 3;
		const testLimiter = new InMemoryConcurrencyLimiter(limit, logger as never);
		const ws = "ws_sequential";
		let completed = 0;

		const pending: string[] = [];
		for (let i = 0; i < 20; i++) {
			pending.push(`run_${i}`);
		}

		while (pending.length > 0 || (await testLimiter.activeCount(ws)) > 0) {
			const batch: string[] = [];
			while (pending.length > 0) {
				const runId = pending[0];
				const acquired = await testLimiter.acquire(ws, runId);
				if (!acquired) break;
				pending.shift();
				batch.push(runId);
			}

			const active = await testLimiter.activeCount(ws);
			expect(active).toBeLessThanOrEqual(limit);

			for (const runId of batch) {
				await testLimiter.release(ws, runId);
				completed++;
			}
		}

		expect(completed).toBe(20);
	});
});
