import { describe, expect, it, vi } from "vitest";
import { resolveUserMentions } from "../resolve.js";

describe("resolveUserMentions", () => {
	function makePrisma() {
		return {
			member: {
				findUnique: vi.fn().mockResolvedValue(null),
				create: vi.fn(),
			},
		};
	}

	function makeClient(users: Record<string, string>) {
		return {
			team: { info: vi.fn() },
			users: {
				info: vi.fn(({ user }: { user: string }) =>
					Promise.resolve({ user: { real_name: users[user] ?? null, name: null } }),
				),
			},
			conversations: { join: vi.fn() },
			reactions: { add: vi.fn(), remove: vi.fn() },
		};
	}

	it("returns text unchanged when no mentions present", async () => {
		const result = await resolveUserMentions(
			"hello world",
			makePrisma() as never,
			makeClient({}) as never,
			"ws_1",
		);
		expect(result).toBe("hello world");
	});

	it("resolves a single user mention", async () => {
		const prisma = makePrisma();
		prisma.member.create.mockImplementation(({ data }: { data: { displayName: string } }) =>
			Promise.resolve({ displayName: data.displayName }),
		);
		const client = makeClient({ UABC123: "Alice" });

		const result = await resolveUserMentions(
			"hey <@UABC123> check this",
			prisma as never,
			client as never,
			"ws_1",
		);
		expect(result).toBe("hey @Alice check this");
	});

	it("resolves multiple different user mentions", async () => {
		const prisma = makePrisma();
		prisma.member.create.mockImplementation(({ data }: { data: { displayName: string } }) =>
			Promise.resolve({ displayName: data.displayName }),
		);
		const client = makeClient({ UABC123: "Alice", UDEF456: "Bob" });

		const result = await resolveUserMentions(
			"<@UABC123> and <@UDEF456> please review",
			prisma as never,
			client as never,
			"ws_1",
		);
		expect(result).toBe("@Alice and @Bob please review");
	});

	it("uses fallback name from mention when resolution fails", async () => {
		const prisma = makePrisma();
		prisma.member.create.mockRejectedValue(new Error("db error"));
		const client = makeClient({});
		client.users.info.mockRejectedValue(new Error("api error"));

		const result = await resolveUserMentions(
			"ask <@UABC123|alice> about it",
			prisma as never,
			client as never,
			"ws_1",
		);
		expect(result).toBe("ask @alice about it");
	});

	it("falls back to user ID when no name available", async () => {
		const prisma = makePrisma();
		prisma.member.create.mockRejectedValue(new Error("db error"));
		const client = makeClient({});
		client.users.info.mockRejectedValue(new Error("api error"));

		const result = await resolveUserMentions(
			"ask <@UABC123> about it",
			prisma as never,
			client as never,
			"ws_1",
		);
		expect(result).toBe("ask @UABC123 about it");
	});

	it("deduplicates resolution for same user mentioned multiple times", async () => {
		const prisma = makePrisma();
		prisma.member.create.mockImplementation(({ data }: { data: { displayName: string } }) =>
			Promise.resolve({ displayName: data.displayName }),
		);
		const client = makeClient({ UABC123: "Alice" });

		const result = await resolveUserMentions(
			"<@UABC123> can you help <@UABC123>",
			prisma as never,
			client as never,
			"ws_1",
		);
		expect(result).toBe("@Alice can you help @Alice");
		// users.info should only be called once despite two mentions
		expect(client.users.info).toHaveBeenCalledTimes(1);
	});
});
