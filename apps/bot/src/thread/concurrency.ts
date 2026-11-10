import type { Logger } from "@openviktor/shared";

export interface ConcurrencyLimiter {
	acquire(workspaceId: string, runId: string): Promise<boolean>;
	release(workspaceId: string, runId: string): Promise<void>;
	activeCount(workspaceId: string): Promise<number>;
	shutdown(): Promise<void>;
}

export class InMemoryConcurrencyLimiter implements ConcurrencyLimiter {
	private slots = new Map<string, Map<string, number>>();

	constructor(
		private maxConcurrent: number,
		private logger: Logger,
		private ttlMs = 600_000,
	) {}

	private evictStale(active: Map<string, number>): void {
		const now = Date.now();
		for (const [runId, ts] of active) {
			if (now - ts > this.ttlMs) {
				active.delete(runId);
				this.logger.warn({ runId }, "Evicted stale concurrency slot");
			}
		}
	}

	async acquire(workspaceId: string, runId: string): Promise<boolean> {
		let active = this.slots.get(workspaceId);
		if (!active) {
			active = new Map();
			this.slots.set(workspaceId, active);
		}
		this.evictStale(active);
		if (active.size >= this.maxConcurrent) {
			this.logger.warn(
				{ workspaceId, runId, active: active.size, max: this.maxConcurrent },
				"Concurrency limit reached",
			);
			return false;
		}
		active.set(runId, Date.now());
		this.logger.debug({ workspaceId, runId, active: active.size }, "Concurrency slot acquired");
		return true;
	}

	async release(workspaceId: string, runId: string): Promise<void> {
		const active = this.slots.get(workspaceId);
		if (active) {
			active.delete(runId);
			if (active.size === 0) this.slots.delete(workspaceId);
		}
		this.logger.debug(
			{ workspaceId, runId, active: active?.size ?? 0 },
			"Concurrency slot released",
		);
	}

	async activeCount(workspaceId: string): Promise<number> {
		const active = this.slots.get(workspaceId);
		if (!active) return 0;
		this.evictStale(active);
		return active.size;
	}

	async shutdown(): Promise<void> {
		this.slots.clear();
	}
}

export class RedisConcurrencyLimiter implements ConcurrencyLimiter {
	private redis: import("ioredis").default;

	constructor(
		redis: import("ioredis").default,
		private maxConcurrent: number,
		private ttlMs: number,
		private logger: Logger,
	) {
		this.redis = redis;
	}

	private key(workspaceId: string): string {
		return `openviktor:concurrency:${workspaceId}`;
	}

	async acquire(workspaceId: string, runId: string): Promise<boolean> {
		const key = this.key(workspaceId);
		const now = Date.now();

		const script = `
			local key = KEYS[1]
			local max = tonumber(ARGV[1])
			local runId = ARGV[2]
			local now = tonumber(ARGV[3])
			local ttl = tonumber(ARGV[4])
			redis.call('ZREMRANGEBYSCORE', key, '-inf', now - ttl)
			if redis.call('ZCARD', key) < max then
				redis.call('ZADD', key, now, runId)
				redis.call('PEXPIRE', key, ttl)
				return 1
			end
			return 0
		`;

		const result = await this.redis.eval(
			script,
			1,
			key,
			this.maxConcurrent,
			runId,
			now,
			this.ttlMs,
		);

		const acquired = result === 1;
		if (!acquired) {
			this.logger.warn(
				{ workspaceId, runId, max: this.maxConcurrent },
				"Concurrency limit reached (Redis)",
			);
		} else {
			this.logger.debug({ workspaceId, runId }, "Concurrency slot acquired (Redis)");
		}
		return acquired;
	}

	async release(workspaceId: string, runId: string): Promise<void> {
		await this.redis.zrem(this.key(workspaceId), runId);
		this.logger.debug({ workspaceId, runId }, "Concurrency slot released (Redis)");
	}

	async activeCount(workspaceId: string): Promise<number> {
		const now = Date.now();
		await this.redis.zremrangebyscore(this.key(workspaceId), "-inf", now - this.ttlMs);
		return await this.redis.zcard(this.key(workspaceId));
	}

	async shutdown(): Promise<void> {
		await this.redis.quit();
	}
}

export async function createConcurrencyLimiter(
	maxConcurrent: number,
	logger: Logger,
	redisUrl?: string,
	ttlMs = 600_000,
): Promise<ConcurrencyLimiter> {
	if (redisUrl) {
		const { default: Redis } = await import("ioredis");
		const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
		logger.info(
			{ redisUrl: redisUrl.replace(/\/\/.*@/, "//***@") },
			"Using Redis concurrency limiter",
		);
		return new RedisConcurrencyLimiter(redis, maxConcurrent, ttlMs, logger);
	}

	logger.info("Using in-memory concurrency limiter (single instance only)");
	return new InMemoryConcurrencyLimiter(maxConcurrent, logger);
}
