import { execFile } from "node:child_process";

interface VercelClientConfig {
	token: string;
	orgId: string;
	domain: string;
}

interface CreateProjectResult {
	projectId: string;
	name: string;
}

interface DeployResult {
	url: string;
}

interface DeleteResult {
	success: boolean;
}

export class VercelClient {
	private token: string;
	private orgId: string;
	private domain: string;

	constructor(config: VercelClientConfig) {
		this.token = config.token;
		this.orgId = config.orgId;
		this.domain = config.domain;
	}

	async createProject(name: string): Promise<CreateProjectResult> {
		const res = await this.request("POST", "/v10/projects", {
			name: `app-${name}`,
			framework: "vite",
		});
		return { projectId: res.id as string, name: res.name as string };
	}

	async deploy(buildDir: string, environment: "preview" | "production"): Promise<DeployResult> {
		const distDir = `${buildDir}/dist`;
		const args = [
			"vercel",
			"deploy",
			distDir,
			"--yes",
			"--token",
			this.token,
			...(this.orgId ? ["--scope", this.orgId] : []),
			...(environment === "production" ? ["--prod"] : []),
		];

		const output = await this.exec("npx", args, buildDir);
		const url = output.trim().split("\n").pop() ?? "";

		return { url };
	}

	async setDomain(projectId: string, hexId: string, projectName: string): Promise<string> {
		const domain = `${projectName}-${hexId}.${this.domain}`;
		await this.request("POST", `/v10/projects/${projectId}/domains`, { name: domain });
		return domain;
	}

	async deleteProject(projectId: string): Promise<DeleteResult> {
		await this.request("DELETE", `/v10/projects/${projectId}`);
		return { success: true };
	}

	private async request(
		method: string,
		path: string,
		body?: unknown,
	): Promise<Record<string, unknown>> {
		const res = await fetch(`https://api.vercel.com${path}`, {
			method,
			headers: {
				Authorization: `Bearer ${this.token}`,
				"Content-Type": "application/json",
				...(this.orgId ? { "x-vercel-team-id": this.orgId } : {}),
			},
			...(body ? { body: JSON.stringify(body) } : {}),
		});

		if (!res.ok) {
			const text = await res.json().catch(() => ({}));
			throw new Error(`Vercel API ${method} ${path} failed: ${res.status} ${JSON.stringify(text)}`);
		}

		return res.json() as Promise<Record<string, unknown>>;
	}

	private exec(cmd: string, args: string[], cwd: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const env = { ...process.env };
			env.VERCEL_ORG_ID = undefined;
			env.VERCEL_PROJECT_ID = undefined;
			execFile(cmd, args, { cwd, env }, (err, stdout, stderr) => {
				if (err) {
					const message = stderr?.trim() || err.message;
					return reject(new Error(message));
				}
				resolve(stdout);
			});
		});
	}
}
