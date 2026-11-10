import { ThreadPhase } from "@openviktor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThreadLock } from "../lock.js";

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

describe("ThreadLock", () => {
	let lock: ThreadLock;
	let prisma: {
		thread: {
			updateMany: ReturnType<typeof vi.fn>;
			findUnique: ReturnType<typeof vi.fn>;
		};
	};

	beforeEach(() => {
		prisma = {
			thread: {
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
				findUnique: vi.fn(),
			},
		};
		lock = new ThreadLock(prisma as never, makeLogger() as never, 300_000);
	});

	describe("acquire", () => {
		it("acquires lock when thread is unlocked", async () => {
			const result = await lock.acquire("thread_1", "run_1");
			expect(result).toBe(true);
			expect(prisma.thread.updateMany).toHaveBeenCalledWith({
				where: {
					id: "thread_1",
					OR: [{ lockedBy: null }, { lockedAt: { lt: expect.any(Date) } }],
				},
				data: {
					lockedBy: "run_1",
					lockedAt: expect.any(Date),
					phase: ThreadPhase.THREAD_LOCK,
				},
			});
		});

		it("fails to acquire when thread is locked by another run", async () => {
			prisma.thread.updateMany.mockResolvedValue({ count: 0 });
			const result = await lock.acquire("thread_1", "run_2");
			expect(result).toBe(false);
		});
	});

	describe("release", () => {
		it("releases the lock for the owning run", async () => {
			await lock.release("thread_1", "run_1");
			expect(prisma.thread.updateMany).toHaveBeenCalledWith({
				where: { id: "thread_1", lockedBy: "run_1" },
				data: { lockedBy: null, lockedAt: null },
			});
		});
	});

	describe("isLocked", () => {
		it("returns false when no lock is held", async () => {
			prisma.thread.findUnique.mockResolvedValue({ lockedBy: null, lockedAt: null });
			expect(await lock.isLocked("thread_1")).toBe(false);
		});

		it("returns true when lock is active", async () => {
			prisma.thread.findUnique.mockResolvedValue({
				lockedBy: "run_1",
				lockedAt: new Date(),
			});
			expect(await lock.isLocked("thread_1")).toBe(true);
		});

		it("returns false when lock is expired", async () => {
			prisma.thread.findUnique.mockResolvedValue({
				lockedBy: "run_1",
				lockedAt: new Date(Date.now() - 400_000), // past the 300s timeout
			});
			expect(await lock.isLocked("thread_1")).toBe(false);
		});

		it("returns false when thread not found", async () => {
			prisma.thread.findUnique.mockResolvedValue(null);
			expect(await lock.isLocked("nonexistent")).toBe(false);
		});
	});
});
