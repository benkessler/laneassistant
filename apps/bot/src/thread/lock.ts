import type { PrismaClient } from "@openviktor/db";
import { ThreadPhase } from "@openviktor/shared";
import type { Logger } from "@openviktor/shared";

export class ThreadLock {
	constructor(
		private prisma: PrismaClient,
		private logger: Logger,
		private lockTimeoutMs = 300_000,
	) {}

	async acquire(threadId: string, runId: string): Promise<boolean> {
		const expiry = new Date(Date.now() - this.lockTimeoutMs);

		const result = await this.prisma.thread.updateMany({
			where: {
				id: threadId,
				OR: [{ lockedBy: null }, { lockedAt: { lt: expiry } }],
			},
			data: {
				lockedBy: runId,
				lockedAt: new Date(),
				phase: ThreadPhase.THREAD_LOCK,
			},
		});

		const acquired = result.count > 0;
		if (!acquired) {
			this.logger.warn({ threadId, runId }, "Thread lock not acquired — already locked");
		} else {
			this.logger.debug({ threadId, runId }, "Thread lock acquired");
		}

		return acquired;
	}

	async release(threadId: string, runId: string): Promise<void> {
		await this.prisma.thread.updateMany({
			where: { id: threadId, lockedBy: runId },
			data: { lockedBy: null, lockedAt: null },
		});
		this.logger.debug({ threadId, runId }, "Thread lock released");
	}

	async isLocked(threadId: string): Promise<boolean> {
		const thread = await this.prisma.thread.findUnique({
			where: { id: threadId },
			select: { lockedBy: true, lockedAt: true },
		});
		if (!thread?.lockedBy) return false;
		if (!thread.lockedAt) return false;

		const expired = thread.lockedAt.getTime() < Date.now() - this.lockTimeoutMs;
		return !expired;
	}
}
