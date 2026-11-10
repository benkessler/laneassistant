import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaleThreadDetector } from "../stale.js";

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

describe("StaleThreadDetector", () => {
	let detector: StaleThreadDetector;
	let prisma: {
		thread: { updateMany: ReturnType<typeof vi.fn> };
		agentRun: { updateMany: ReturnType<typeof vi.fn> };
	};

	beforeEach(() => {
		vi.useFakeTimers();
		prisma = {
			thread: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
			agentRun: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
		};
		detector = new StaleThreadDetector(
			prisma as never,
			makeLogger() as never,
			86_400_000, // 24 hours
			60_000, // 1 minute for testing
		);
	});

	afterEach(() => {
		detector.stop();
		vi.useRealTimers();
	});

	it("marks threads as stale when they exceed the timeout", async () => {
		prisma.thread.updateMany.mockResolvedValue({ count: 5 });

		const count = await detector.detectAndCleanup();

		expect(count).toBe(5);
		expect(prisma.thread.updateMany).toHaveBeenCalledWith({
			where: {
				status: { in: ["ACTIVE", "WAITING"] },
				updatedAt: { lt: expect.any(Date) },
			},
			data: { status: "STALE", phase: 0, lockedBy: null, lockedAt: null },
		});
	});

	it("cancels RUNNING agent runs on stale threads", async () => {
		prisma.thread.updateMany.mockResolvedValue({ count: 2 });
		prisma.agentRun.updateMany.mockResolvedValue({ count: 1 });

		await detector.detectAndCleanup();

		expect(prisma.agentRun.updateMany).toHaveBeenCalledWith({
			where: {
				thread: { status: "STALE" },
				status: "RUNNING",
			},
			data: {
				status: "CANCELLED",
				errorMessage: "Thread marked as stale due to inactivity",
				completedAt: expect.any(Date),
			},
		});
	});

	it("returns 0 when no threads are stale", async () => {
		const count = await detector.detectAndCleanup();
		expect(count).toBe(0);
	});

	it("runs periodically when started", async () => {
		prisma.thread.updateMany.mockResolvedValue({ count: 0 });

		detector.start();

		await vi.advanceTimersByTimeAsync(60_000);
		expect(prisma.thread.updateMany).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(prisma.thread.updateMany).toHaveBeenCalledTimes(2);
	});

	it("stops the interval when stop is called", async () => {
		prisma.thread.updateMany.mockResolvedValue({ count: 0 });

		detector.start();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(prisma.thread.updateMany).toHaveBeenCalledTimes(1);

		detector.stop();
		await vi.advanceTimersByTimeAsync(120_000);
		expect(prisma.thread.updateMany).toHaveBeenCalledTimes(1); // no more calls
	});

	it("handles errors in detectAndCleanup gracefully", async () => {
		prisma.thread.updateMany.mockRejectedValue(new Error("DB error"));
		const logger = makeLogger();
		const errorDetector = new StaleThreadDetector(
			prisma as never,
			logger as never,
			86_400_000,
			60_000,
		);

		errorDetector.start();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(logger.error).toHaveBeenCalledWith(
			expect.objectContaining({ err: expect.any(Error) }),
			"Stale thread detection failed",
		);

		errorDetector.stop();
	});
});
