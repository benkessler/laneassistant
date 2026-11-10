import { execFile } from "node:child_process";

const MANAGEMENT_API = "https://api.convex.dev";

interface ConvexClientConfig {
	accessToken: string;
	teamId: string;
}

interface ProjectResult {
	projectId: string;
	devUrl: string;
	prodUrl: string;
	devDeployKey: string;
	prodDeployKey: string;
}

interface DeployResult {
	success: boolean;
	output: string;
}

interface QueryResult {
	success: boolean;
	data: unknown;
}

interface DeleteResult {
	success: boolean;
	deletedResources: string[];
}

export class ConvexClient {
	private accessToken: string;
	private teamId: string;

	constructor(config: ConvexClientConfig) {
		this.accessToken = config.accessToken;
		this.teamId = config.teamId;
	}

	async createProject(projectName: string): Promise<ProjectResult> {
		const project = await this.api(`/v1/teams/${this.teamId}/create_project`, {
			projectName,
		});
		const projectId = String(project.projectId);

		const devDeployment = await this.api(`/v1/projects/${projectId}/create_deployment`, {
			type: "dev",
		});
		const prodDeployment = await this.api(`/v1/projects/${projectId}/create_deployment`, {
			type: "prod",
		});

		const devDeployName = String(devDeployment.name);
		const prodDeployName = String(prodDeployment.name);

		const devKeyResult = await this.api(`/v1/deployments/${devDeployName}/create_deploy_key`, {
			name: `${projectName}-dev`,
		});
		const prodKeyResult = await this.api(`/v1/deployments/${prodDeployName}/create_deploy_key`, {
			name: `${projectName}-prod`,
		});

		return {
			projectId,
			devUrl: String(devDeployment.deploymentUrl),
			prodUrl: String(prodDeployment.deploymentUrl),
			devDeployKey: String(devKeyResult.deployKey),
			prodDeployKey: String(prodKeyResult.deployKey),
		};
	}

	async deploy(sandboxPath: string, env: "dev" | "prod", deployKey: string): Promise<DeployResult> {
		await this.exec("bun", ["install"], sandboxPath, "");

		const args = env === "dev" ? ["convex", "dev", "--once"] : ["convex", "deploy"];

		const output = await this.exec("npx", args, sandboxPath, deployKey);
		return { success: true, output };
	}

	async setEnvVars(
		sandboxPath: string,
		deployKey: string,
		vars: Record<string, string>,
	): Promise<void> {
		for (const [key, value] of Object.entries(vars)) {
			await this.exec("npx", ["convex", "env", "set", key, value], sandboxPath, deployKey);
		}
	}

	async query(
		deploymentUrl: string,
		functionName: string,
		args: Record<string, unknown>,
	): Promise<QueryResult> {
		const output = await this.exec(
			"npx",
			["convex", "run", "--url", deploymentUrl, functionName, JSON.stringify(args)],
			process.cwd(),
			"",
		);
		return { success: true, data: JSON.parse(output) };
	}

	async deleteProject(projectName: string): Promise<DeleteResult> {
		const projects = await this.api(`/v1/teams/${this.teamId}/list_projects`, {});
		const projectList = (projects.projects ?? []) as Array<Record<string, unknown>>;
		const project = projectList.find((p) => p.name === projectName);

		const deleted: string[] = [];
		if (project) {
			try {
				await this.api(`/v1/projects/${project.id}/delete`, {});
				deleted.push("convex_project");
			} catch {
				deleted.push("convex_project_delete_failed");
			}
		}
		return { success: true, deletedResources: deleted };
	}

	private async api(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
		const res = await fetch(`${MANAGEMENT_API}${path}`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`Convex API ${path} failed: ${res.status} ${text}`);
		}

		return res.json() as Promise<Record<string, unknown>>;
	}

	private exec(cmd: string, args: string[], cwd: string, deployKey: string): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(
				cmd,
				args,
				{
					cwd,
					env: {
						...process.env,
						...(deployKey ? { CONVEX_DEPLOY_KEY: deployKey } : {}),
					},
				},
				(err, stdout, stderr) => {
					if (err) {
						const message = stderr?.trim() || err.message;
						return reject(new Error(message));
					}
					resolve(stdout);
				},
			);
		});
	}
}
