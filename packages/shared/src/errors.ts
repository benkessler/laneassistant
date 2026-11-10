export class AppError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly statusCode = 500,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = "AppError";
	}
}

export class ConfigError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "CONFIG_ERROR", 500, cause);
		this.name = "ConfigError";
	}
}

export class LLMError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "LLM_ERROR", 502, cause);
		this.name = "LLMError";
	}
}

export class ToolTimeoutError extends AppError {
	constructor(toolName: string, timeoutMs: number) {
		super(`Tool "${toolName}" timed out after ${timeoutMs}ms`, "TOOL_TIMEOUT", 504);
		this.name = "ToolTimeoutError";
	}
}

export class ToolExecutionError extends AppError {
	constructor(toolName: string, message: string, cause?: unknown) {
		super(`Tool "${toolName}" failed: ${message}`, "TOOL_EXECUTION_ERROR", 500, cause);
		this.name = "ToolExecutionError";
	}
}

export class SlackError extends AppError {
	constructor(message: string, cause?: unknown) {
		super(message, "SLACK_ERROR", 502, cause);
		this.name = "SlackError";
	}
}

export class ThreadLockedError extends AppError {
	constructor(threadId: string) {
		super(`Thread ${threadId} is locked by another agent run`, "THREAD_LOCKED", 409);
		this.name = "ThreadLockedError";
	}
}

export class ConcurrencyExceededError extends AppError {
	constructor(workspaceId: string, limit: number) {
		super(
			`Workspace ${workspaceId} has reached the maximum of ${limit} concurrent runs`,
			"CONCURRENCY_EXCEEDED",
			429,
		);
		this.name = "ConcurrencyExceededError";
	}
}
