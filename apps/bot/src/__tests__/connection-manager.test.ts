import { encrypt } from "@openviktor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	ConnectionManager,
	type EventHandler,
	EventsApiConnection,
	type InteractionHandler,
} from "../slack/connection-manager.js";

const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
	debug: vi.fn(),
	fatal: vi.fn(),
	trace: vi.fn(),
	child: vi.fn().mockReturnThis(),
	level: "info" as const,
	silent: vi.fn(),
	isLevelEnabled: vi.fn(),
} as never;

const mockPrisma = {
	workspace: {
		findMany: vi.fn().mockResolvedValue([]),
		findUnique: vi.fn(),
	},
} as never;

const ENCRYPTION_KEY = "a".repeat(64);

const baseManagedConfig = {
	DEPLOYMENT_MODE: "managed" as const,
	SLACK_SIGNING_SECRET: "test-secret",
	SLACK_CLIENT_ID: "client-id",
	SLACK_CLIENT_SECRET: "client-secret",
	SLACK_STATE_SECRET: "state-secret",
	BASE_URL: "https://app.example.com",
	ENCRYPTION_KEY,
	ANTHROPIC_API_KEY: "sk-ant-test",
	DATABASE_URL: "postgresql://localhost/test",
	NODE_ENV: "test" as const,
} as never;

describe("ConnectionManager", () => {
	let onEvent: EventHandler;
	let onInteraction: InteractionHandler;

	beforeEach(() => {
		vi.clearAllMocks();
		onEvent = vi.fn();
		onInteraction = vi.fn();
	});

	it("starts with zero connections", () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});
		expect(manager.connectedCount).toBe(0);
		expect(manager.getAll()).toHaveLength(0);
	});

	it("connects an EventsApiConnection in managed mode", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		const workspace = {
			id: "ws-1",
			slackTeamId: "T123",
			slackBotToken: encrypt("xoxb-test", ENCRYPTION_KEY),
			slackBotUserId: "U123",
		};

		const conn = await manager.connect(workspace);
		expect(conn).toBeInstanceOf(EventsApiConnection);
		expect(conn.isConnected()).toBe(true);
		expect(conn.workspaceId).toBe("ws-1");
		expect(conn.teamId).toBe("T123");
		expect(manager.connectedCount).toBe(1);
	});

	it("decrypts bot token in managed mode before creating WebClient", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		const plaintextToken = "xoxb-decryption-test";
		const encryptedToken = encrypt(plaintextToken, ENCRYPTION_KEY);

		const conn = await manager.connect({
			id: "ws-1",
			slackTeamId: "T123",
			slackBotToken: encryptedToken,
			slackBotUserId: "U123",
		});

		expect(conn.getClient().token).toBe(plaintextToken);
	});

	it("connects multiple workspaces with different encrypted tokens", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		const token1 = "xoxb-workspace-one";
		const token2 = "xoxb-workspace-two";

		await manager.connect({
			id: "ws-1",
			slackTeamId: "T1",
			slackBotToken: encrypt(token1, ENCRYPTION_KEY),
			slackBotUserId: "U1",
		});
		await manager.connect({
			id: "ws-2",
			slackTeamId: "T2",
			slackBotToken: encrypt(token2, ENCRYPTION_KEY),
			slackBotUserId: "U2",
		});

		expect(manager.connectedCount).toBe(2);
		expect(manager.getConnection("ws-1")?.getClient().token).toBe(token1);
		expect(manager.getConnection("ws-2")?.getClient().token).toBe(token2);
	});

	it("looks up connection by team ID", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		await manager.connect({
			id: "ws-1",
			slackTeamId: "T123",
			slackBotToken: encrypt("xoxb-test", ENCRYPTION_KEY),
			slackBotUserId: "U123",
		});

		const conn = manager.getConnectionByTeamId("T123");
		expect(conn).toBeDefined();
		expect(conn?.workspaceId).toBe("ws-1");

		expect(manager.getConnectionByTeamId("T999")).toBeUndefined();
	});

	it("disconnects a workspace", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		await manager.connect({
			id: "ws-1",
			slackTeamId: "T123",
			slackBotToken: encrypt("xoxb-test", ENCRYPTION_KEY),
			slackBotUserId: "U123",
		});

		expect(manager.connectedCount).toBe(1);
		await manager.disconnect("ws-1");
		expect(manager.connectedCount).toBe(0);
		expect(manager.getConnection("ws-1")).toBeUndefined();
	});

	it("disconnects all workspaces", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		await manager.connect({
			id: "ws-1",
			slackTeamId: "T1",
			slackBotToken: encrypt("xoxb-1", ENCRYPTION_KEY),
			slackBotUserId: "U1",
		});
		await manager.connect({
			id: "ws-2",
			slackTeamId: "T2",
			slackBotToken: encrypt("xoxb-2", ENCRYPTION_KEY),
			slackBotUserId: "U2",
		});

		expect(manager.connectedCount).toBe(2);
		await manager.disconnectAll();
		expect(manager.connectedCount).toBe(0);
	});

	it("replaces existing connection on re-connect", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		const ws = {
			id: "ws-1",
			slackTeamId: "T123",
			slackBotToken: encrypt("xoxb-old", ENCRYPTION_KEY),
			slackBotUserId: "U123",
		};

		await manager.connect(ws);
		const conn1 = manager.getConnection("ws-1");

		await manager.connect({ ...ws, slackBotToken: encrypt("xoxb-new", ENCRYPTION_KEY) });
		const conn2 = manager.getConnection("ws-1");

		expect(conn1).not.toBe(conn2);
		expect(manager.connectedCount).toBe(1);
	});

	it("handles corrupted token gracefully (falls back to raw value)", async () => {
		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		const conn = await manager.connect({
			id: "ws-1",
			slackTeamId: "T123",
			slackBotToken: "not-a-valid-encrypted-token",
			slackBotUserId: "U123",
		});

		expect(conn.getClient().token).toBe("not-a-valid-encrypted-token");
	});

	it("throws if ENCRYPTION_KEY is missing in managed mode", async () => {
		const configNoKey = {
			...(baseManagedConfig as Record<string, unknown>),
			ENCRYPTION_KEY: undefined,
		} as never;

		const manager = new ConnectionManager({
			config: configNoKey,
			prisma: mockPrisma,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		await expect(
			manager.connect({
				id: "ws-1",
				slackTeamId: "T123",
				slackBotToken: "encrypted-blob",
				slackBotUserId: "U123",
			}),
		).rejects.toThrow("ENCRYPTION_KEY is required in managed mode");
	});

	it("connectAll decrypts tokens from database", async () => {
		const encryptedToken = encrypt("xoxb-from-db", ENCRYPTION_KEY);
		const prismaWithWorkspaces = {
			workspace: {
				findMany: vi.fn().mockResolvedValue([
					{
						id: "ws-db-1",
						slackTeamId: "T_DB",
						slackBotToken: encryptedToken,
						slackBotUserId: "U_DB",
						isActive: true,
					},
				]),
				findUnique: vi.fn(),
			},
		} as never;

		const manager = new ConnectionManager({
			config: baseManagedConfig,
			prisma: prismaWithWorkspaces,
			logger: mockLogger,
			onEvent,
			onInteraction,
		});

		await manager.connectAll();

		expect(manager.connectedCount).toBe(1);
		const conn = manager.getConnectionByTeamId("T_DB");
		expect(conn).toBeDefined();
		expect(conn?.getClient().token).toBe("xoxb-from-db");
	});
});

describe("EventsApiConnection", () => {
	it("provides WebClient via getClient()", () => {
		const conn = new EventsApiConnection("ws-1", "T123", "xoxb-test", "U123", mockLogger);
		const client = conn.getClient();
		expect(client).toBeDefined();
		expect(client.token).toBe("xoxb-test");
	});

	it("tracks connected state", async () => {
		const conn = new EventsApiConnection("ws-1", "T123", "xoxb-test", "U123", mockLogger);
		expect(conn.isConnected()).toBe(false);
		await conn.start();
		expect(conn.isConnected()).toBe(true);
		await conn.stop();
		expect(conn.isConnected()).toBe(false);
	});

	it("updates token", () => {
		const conn = new EventsApiConnection("ws-1", "T123", "xoxb-old", "U123", mockLogger);
		expect(conn.getClient().token).toBe("xoxb-old");
		conn.updateToken("xoxb-new");
		expect(conn.getClient().token).toBe("xoxb-new");
	});
});
