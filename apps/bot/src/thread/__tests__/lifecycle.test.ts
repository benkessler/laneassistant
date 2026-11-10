import { ThreadPhase } from "@openviktor/shared";
import { describe, expect, it, vi } from "vitest";
import { isValidTransition, phaseName, transitionPhase } from "../lifecycle.js";

describe("ThreadPhase", () => {
	it("defines all 8 phases plus IDLE", () => {
		expect(ThreadPhase.IDLE).toBe(0);
		expect(ThreadPhase.TRIGGER).toBe(1);
		expect(ThreadPhase.PROMPT_INJECTION).toBe(2);
		expect(ThreadPhase.THREAD_LOCK).toBe(3);
		expect(ThreadPhase.REASONING).toBe(4);
		expect(ThreadPhase.TOOL_LOOP).toBe(5);
		expect(ThreadPhase.DRAFT_GATE).toBe(6);
		expect(ThreadPhase.PROGRESS).toBe(7);
		expect(ThreadPhase.COMPLETION).toBe(8);
	});
});

describe("phaseName", () => {
	it("returns name for known phases", () => {
		expect(phaseName(ThreadPhase.IDLE)).toBe("IDLE");
		expect(phaseName(ThreadPhase.TRIGGER)).toBe("TRIGGER");
		expect(phaseName(ThreadPhase.TOOL_LOOP)).toBe("TOOL_LOOP");
		expect(phaseName(ThreadPhase.COMPLETION)).toBe("COMPLETION");
	});

	it("returns UNKNOWN for invalid phase", () => {
		expect(phaseName(99 as never)).toBe("UNKNOWN(99)");
	});
});

describe("isValidTransition", () => {
	it("allows forward transitions through the happy path", () => {
		expect(isValidTransition(ThreadPhase.IDLE, ThreadPhase.TRIGGER)).toBe(true);
		expect(isValidTransition(ThreadPhase.TRIGGER, ThreadPhase.PROMPT_INJECTION)).toBe(true);
		expect(isValidTransition(ThreadPhase.PROMPT_INJECTION, ThreadPhase.THREAD_LOCK)).toBe(true);
		expect(isValidTransition(ThreadPhase.THREAD_LOCK, ThreadPhase.REASONING)).toBe(true);
		expect(isValidTransition(ThreadPhase.REASONING, ThreadPhase.TOOL_LOOP)).toBe(true);
		expect(isValidTransition(ThreadPhase.TOOL_LOOP, ThreadPhase.REASONING)).toBe(true);
		expect(isValidTransition(ThreadPhase.REASONING, ThreadPhase.COMPLETION)).toBe(true);
		expect(isValidTransition(ThreadPhase.COMPLETION, ThreadPhase.IDLE)).toBe(true);
	});

	it("allows skipping from REASONING to COMPLETION (no tools)", () => {
		expect(isValidTransition(ThreadPhase.REASONING, ThreadPhase.COMPLETION)).toBe(true);
	});

	it("allows TOOL_LOOP → COMPLETION (final tool round)", () => {
		expect(isValidTransition(ThreadPhase.TOOL_LOOP, ThreadPhase.COMPLETION)).toBe(true);
	});

	it("allows DRAFT_GATE → TOOL_LOOP (resume after permission gate)", () => {
		expect(isValidTransition(ThreadPhase.DRAFT_GATE, ThreadPhase.TOOL_LOOP)).toBe(true);
	});

	it("allows DRAFT_GATE → PROGRESS and DRAFT_GATE → COMPLETION", () => {
		expect(isValidTransition(ThreadPhase.DRAFT_GATE, ThreadPhase.PROGRESS)).toBe(true);
		expect(isValidTransition(ThreadPhase.DRAFT_GATE, ThreadPhase.COMPLETION)).toBe(true);
	});

	it("rejects DRAFT_GATE → REASONING (must go via TOOL_LOOP)", () => {
		expect(isValidTransition(ThreadPhase.DRAFT_GATE, ThreadPhase.REASONING)).toBe(false);
	});

	it("rejects invalid transitions", () => {
		expect(isValidTransition(ThreadPhase.IDLE, ThreadPhase.COMPLETION)).toBe(false);
		expect(isValidTransition(ThreadPhase.TRIGGER, ThreadPhase.TOOL_LOOP)).toBe(false);
		expect(isValidTransition(ThreadPhase.COMPLETION, ThreadPhase.REASONING)).toBe(false);
	});
});

describe("transitionPhase", () => {
	it("validates and updates the thread phase with CAS", async () => {
		const prisma = {
			thread: {
				findUniqueOrThrow: vi.fn().mockResolvedValue({ phase: ThreadPhase.THREAD_LOCK }),
				updateMany: vi.fn().mockResolvedValue({ count: 1 }),
			},
		};

		await transitionPhase(prisma as never, "thread_1", ThreadPhase.REASONING);

		expect(prisma.thread.findUniqueOrThrow).toHaveBeenCalledWith({
			where: { id: "thread_1" },
			select: { phase: true },
		});
		expect(prisma.thread.updateMany).toHaveBeenCalledWith({
			where: { id: "thread_1", phase: ThreadPhase.THREAD_LOCK },
			data: { phase: ThreadPhase.REASONING },
		});
	});

	it("throws on invalid transition", async () => {
		const prisma = {
			thread: {
				findUniqueOrThrow: vi.fn().mockResolvedValue({ phase: ThreadPhase.IDLE }),
				updateMany: vi.fn(),
			},
		};

		await expect(
			transitionPhase(prisma as never, "thread_1", ThreadPhase.COMPLETION),
		).rejects.toThrow("Invalid phase transition: IDLE → COMPLETION");

		expect(prisma.thread.updateMany).not.toHaveBeenCalled();
	});

	it("throws on concurrent modification", async () => {
		const prisma = {
			thread: {
				findUniqueOrThrow: vi.fn().mockResolvedValue({ phase: ThreadPhase.THREAD_LOCK }),
				updateMany: vi.fn().mockResolvedValue({ count: 0 }),
			},
		};

		await expect(
			transitionPhase(prisma as never, "thread_1", ThreadPhase.REASONING),
		).rejects.toThrow("Phase transition failed (concurrent modification)");
	});
});
