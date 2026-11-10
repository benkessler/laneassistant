import type { PrismaClient } from "@openviktor/db";
import { ThreadPhase } from "@openviktor/shared";
import type { Logger } from "@openviktor/shared";

export class StaleThreadDetector {
	private interval: ReturnType<typeof setInterval> | null = null;
	private processing = false;

	constructor(
		private prisma: PrismaClient,
		private logger: Logger,
		private staleTimeoutMs = 86_400_000,
		private checkIntervalMs = 900_000,
	) {}

	start(): void {
		if (this.interval) return;
		this.interval = setInterval(() => {
			if (this.processing) return;
			this.processing = true;
			this.detectAndCleanup()
				.catch((err) => {
					this.logger.error({ err }, "Stale thread detection failed");
				})
				.finally(() => {
					this.processing = false;
				});
		}, this.checkIntervalMs);

		this.logger.info(
			{ checkIntervalMs: this.checkIntervalMs, staleTimeoutMs: this.staleTimeoutMs },
			"Stale thread detector started",
		);
	}

	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
			this.logger.info("Stale thread detector stopped");
		}
	}

	async detectAndCleanup(): Promise<number> {
		const cutoff = new Date(Date.now() - this.staleTimeoutMs);

		const staleThreads = await this.prisma.thread.updateMany({
			where: {
				status: { in: ["ACTIVE", "WAITING"] },
				updatedAt: { lt: cutoff },
			},
			data: { status: "STALE", phase: ThreadPhase.IDLE, lockedBy: null, lockedAt: null },
		});

		if (staleThreads.count > 0) {
			this.logger.info({ count: staleThreads.count }, "Marked stale threads");
		}

		const cancelledRuns = await this.prisma.agentRun.updateMany({
			where: {
				thread: { status: "STALE" },
				status: "RUNNING",
			},
			data: {
				status: "CANCELLED",
				errorMessage: "Thread marked as stale due to inactivity",
				completedAt: new Date(),
			},
		});

		if (cancelledRuns.count > 0) {
			this.logger.info({ count: cancelledRuns.count }, "Cancelled runs on stale threads");
		}

		return staleThreads.count;
	}
}
