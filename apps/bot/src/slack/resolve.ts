import type { PrismaClient } from "@openviktor/db";

export interface SlackClient {
	team: { info: () => Promise<{ team?: { name?: string } }> };
	users: {
		info: (params: { user: string }) => Promise<{ user?: { real_name?: string; name?: string } }>;
	};
	conversations: {
		join: (params: { channel: string }) => Promise<unknown>;
	};
	reactions: {
		add: (params: { channel: string; timestamp: string; name: string }) => Promise<unknown>;
		remove: (params: { channel: string; timestamp: string; name: string }) => Promise<unknown>;
	};
}

export async function resolveWorkspace(
	prisma: PrismaClient,
	client: SlackClient,
	teamId: string,
	botToken: string,
	botUserId: string,
) {
	const existing = await prisma.workspace.findUnique({
		where: { slackTeamId: teamId },
	});
	if (existing) return existing;

	const teamInfo = await client.team.info();
	const teamName = teamInfo.team?.name ?? "Unknown";

	return prisma.workspace.create({
		data: {
			slackTeamId: teamId,
			slackTeamName: teamName,
			slackBotToken: botToken,
			slackBotUserId: botUserId,
		},
	});
}

export async function resolveMember(
	prisma: PrismaClient,
	client: SlackClient,
	workspaceId: string,
	slackUserId: string,
) {
	const existing = await prisma.member.findUnique({
		where: { workspaceId_slackUserId: { workspaceId, slackUserId } },
	});
	if (existing) return existing;

	const userInfo = await client.users.info({ user: slackUserId });
	const displayName = userInfo.user?.real_name ?? userInfo.user?.name ?? null;

	return prisma.member.create({
		data: {
			workspaceId,
			slackUserId,
			displayName,
		},
	});
}

export async function resolveUserMentions(
	text: string,
	prisma: PrismaClient,
	client: SlackClient,
	workspaceId: string,
): Promise<string> {
	const mentionPattern = /<@(U[A-Z0-9]+)(?:\|([^>]*))?>/g;
	const matches = [...text.matchAll(mentionPattern)];
	if (matches.length === 0) return text;

	const uniqueUserIds = [...new Set(matches.map((m) => m[1]))];
	const nameMap = new Map<string, string>();

	for (const userId of uniqueUserIds) {
		try {
			const member = await resolveMember(prisma, client, workspaceId, userId);
			if (member.displayName) {
				nameMap.set(userId, member.displayName);
			}
		} catch {
			// leave raw mention if resolution fails
		}
	}

	return text.replace(mentionPattern, (_match, userId: string, fallbackName?: string) => {
		const resolved = nameMap.get(userId);
		if (resolved) return `@${resolved}`;
		if (fallbackName) return `@${fallbackName}`;
		return `@${userId}`;
	});
}
