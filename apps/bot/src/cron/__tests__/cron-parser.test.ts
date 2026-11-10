import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNextRun, estimateRunsPerDay, isValidCronExpression } from "../cron-parser.js";

describe("isValidCronExpression", () => {
	it("accepts standard 5-field expressions", () => {
		expect(isValidCronExpression("* * * * *")).toBe(true);
		expect(isValidCronExpression("0 9 * * 1")).toBe(true);
		expect(isValidCronExpression("1 8,11,14,17 * * 1-5")).toBe(true);
		expect(isValidCronExpression("*/15 * * * *")).toBe(true);
		expect(isValidCronExpression("0 0 1 1 *")).toBe(true);
	});

	it("rejects invalid expressions", () => {
		expect(isValidCronExpression("not a cron")).toBe(false);
		expect(isValidCronExpression("* * * * * * * *")).toBe(false);
	});
});

describe("calculateNextRun", () => {
	it("calculates next run from a given date", () => {
		const wednesday = new Date("2026-03-11T10:00:00Z");
		const next = calculateNextRun("0 9 * * 1", wednesday);
		expect(next.getUTCDay()).toBe(1);
		expect(next.getUTCHours()).toBe(9);
		expect(next > wednesday).toBe(true);
	});

	it("returns next minute for every-minute cron", () => {
		const now = new Date("2026-03-13T12:00:00Z");
		const next = calculateNextRun("* * * * *", now);
		expect(next.getTime() - now.getTime()).toBe(60_000);
	});

	it("handles heartbeat schedule (4x/day weekdays)", () => {
		const friday = new Date("2026-03-13T07:00:00Z");
		const next = calculateNextRun("1 8,11,14,17 * * 1-5", friday);
		expect(next.getUTCHours()).toBe(8);
		expect(next.getUTCMinutes()).toBe(1);
	});

	it("handles end-of-month edge case", () => {
		const feb28 = new Date("2026-02-28T23:00:00Z");
		const next = calculateNextRun("0 9 1 * *", feb28);
		expect(next.getUTCDate()).toBe(1);
		expect(next.getUTCMonth()).toBe(2);
	});
});

describe("estimateRunsPerDay", () => {
	it("estimates ~1440 runs for every-minute cron", () => {
		const runs = estimateRunsPerDay("* * * * *");
		expect(runs).toBeGreaterThanOrEqual(1439);
		expect(runs).toBeLessThanOrEqual(1440);
	});

	it("estimates ~24 runs for hourly cron", () => {
		const runs = estimateRunsPerDay("0 * * * *");
		expect(runs).toBeGreaterThanOrEqual(23);
		expect(runs).toBeLessThanOrEqual(24);
	});

	describe("heartbeat schedule", () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("estimates 4 on a weekday", () => {
			vi.setSystemTime(new Date("2026-03-11T12:00:00Z")); // Wednesday
			expect(estimateRunsPerDay("1 8,11,14,17 * * 1-5")).toBe(4);
		});

		it("estimates 0 on a weekend", () => {
			vi.setSystemTime(new Date("2026-03-14T12:00:00Z")); // Saturday
			expect(estimateRunsPerDay("1 8,11,14,17 * * 1-5")).toBe(0);
		});
	});

	it("estimates 1 for daily cron", () => {
		expect(estimateRunsPerDay("0 9 * * *")).toBe(1);
	});
});
