import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getWorkspaceDir } from "./workspace.js";

function formatTimestamp(ts: string): string {
	return ts.includes(".") ? ts : `${ts}.000000`;
}

function sanitizeText(text: string): string {
	return text.replace(/\n/g, "\\n");
}

function formatLogLine(
	ts: string,
	username: string,
	text: string,
	metadata?: Record<string, string>,
): string {
	const metaTags = metadata
		? Object.entries(metadata)
				.map(([k, v]) => `[${k}:${v}]`)
				.join(" ")
		: "";
	const suffix = metaTags ? ` ${metaTags}` : "";
	return `[${formatTimestamp(ts)}] @${username}: ${sanitizeText(text)}${suffix}\n`;
}

function getMonthlyLogPath(slackDir: string, channelName: string, ts: string): string {
	const epochSec = Number.parseFloat(ts);
	const date = new Date(epochSec * 1000);
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return join(slackDir, channelName, `${year}-${month}.log`);
}

function getThreadLogPath(slackDir: string, channelName: string, threadTs: string): string {
	return join(slackDir, channelName, "threads", `${threadTs}.log`);
}

async function ensureAndAppend(filePath: string, content: string): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	await appendFile(filePath, content, "utf-8");
}

export interface SlackLogEntry {
	workspaceId: string;
	channel: string;
	channelName?: string;
	ts: string;
	threadTs?: string;
	username: string;
	text: string;
	isBotMessage?: boolean;
}

export async function appendSlackLog(entry: SlackLogEntry): Promise<void> {
	const workspaceDir = getWorkspaceDir(entry.workspaceId);
	const slackDir = join(workspaceDir, "slack");
	const channelName = entry.channelName || entry.channel;
	const metadata: Record<string, string> = {};

	if (entry.threadTs && entry.threadTs !== entry.ts) {
		metadata.thread = entry.threadTs;
	}
	if (entry.isBotMessage) {
		metadata.origin = "coworker";
	}

	const line = formatLogLine(entry.ts, entry.username, entry.text, metadata);

	// Write to monthly channel log
	const monthlyPath = getMonthlyLogPath(slackDir, channelName, entry.ts);
	await ensureAndAppend(monthlyPath, line);

	// Write to thread log if in a thread
	if (entry.threadTs) {
		const threadPath = getThreadLogPath(slackDir, channelName, entry.threadTs);
		await ensureAndAppend(threadPath, line);
	}

	// If bot message, also write to sent messages log
	if (entry.isBotMessage) {
		const sentPath = join(slackDir, "all_your_sent_slack_messages.log");
		await ensureAndAppend(sentPath, line);
	}
}
