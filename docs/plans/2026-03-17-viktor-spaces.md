# Viktor Spaces Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the agent the ability to create, develop, and deploy full-stack web apps (Convex + React + Vercel) from within Slack conversations, with optional runtime callbacks so deployed apps can use Viktor's tools.

**Architecture:** Spaces is implemented as a set of 6 agent tools in `packages/tools/` backed by new Prisma models. The tools call external APIs (Convex CLI, Vercel API, Resend) to manage app lifecycle. A callback API on the existing gateway server lets deployed apps proxy tool calls back through Viktor. An app template repo is cloned during init.

**Tech Stack:** TypeScript, Prisma, Convex CLI, Vercel API, Resend SDK, Bun

---

## Phase 1: Database Schema + Shared Types

**Verifiable outcome:** `bun run db:generate` succeeds, `bun run typecheck` passes, new models visible in Prisma Studio.

### Task 1.1: Add Space-related enums and models to Prisma schema

**Files:**
- Modify: `packages/db/prisma/schema.prisma`

**Step 1: Add the new models to the schema**

Add after the `// ─── Integrations ──────────────────────────────────────` section, before PermissionRequest:

```prisma
// ─── Spaces ─────────────────────────────────────────────

model Space {
  id            String        @id @default(cuid())
  workspaceId   String        @map("workspace_id")
  name          String
  description   String?
  status        SpaceStatus   @default(INITIALIZING)
  sandboxPath   String        @map("sandbox_path")
  domain        String?       @unique
  previewUrl    String?       @map("preview_url")
  productionUrl String?       @map("production_url")
  convexUrlDev  String?       @map("convex_url_dev")
  convexUrlProd String?       @map("convex_url_prod")
  projectSecret String        @map("project_secret")
  lastDeployedAt DateTime?    @map("last_deployed_at")
  createdAt     DateTime      @default(now()) @map("created_at")
  updatedAt     DateTime      @updatedAt @map("updated_at")

  workspace   Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  deployments SpaceDeployment[]
  variables   SpaceVariable[]

  @@unique([workspaceId, name])
  @@index([workspaceId, status])
  @@map("spaces")
}

enum SpaceStatus {
  INITIALIZING
  READY
  DEPLOYING
  ACTIVE
  FAILED
  DELETED
}

model SpaceDeployment {
  id          String              @id @default(cuid())
  spaceId     String              @map("space_id")
  environment SpaceEnvironment
  version     Int                 @default(1)
  status      SpaceDeployStatus   @default(PENDING)
  url         String?
  vercelUrl   String?             @map("vercel_url")
  convexDeployment String?        @map("convex_deployment")
  commitMessage String?           @map("commit_message")
  buildLog    String?             @map("build_log")
  durationMs  Int?                @map("duration_ms")
  createdAt   DateTime            @default(now()) @map("created_at")

  space Space @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@index([spaceId, createdAt])
  @@map("space_deployments")
}

enum SpaceEnvironment {
  PREVIEW
  PRODUCTION
}

enum SpaceDeployStatus {
  PENDING
  BUILDING
  DEPLOYING
  SUCCESS
  FAILED
}

model SpaceVariable {
  id        String   @id @default(cuid())
  spaceId   String   @map("space_id")
  key       String
  value     String
  isSecret  Boolean  @default(false) @map("is_secret")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  space Space @relation(fields: [spaceId], references: [id], onDelete: Cascade)

  @@unique([spaceId, key])
  @@map("space_variables")
}
```

**Step 2: Add the `spaces` relation to the Workspace model**

In the `Workspace` model's relation list, add:

```prisma
  spaces              Space[]
```

**Step 3: Run Prisma generate to verify schema is valid**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run db:generate`
Expected: "Generated Prisma Client" with no errors

**Step 4: Create migration**

Run: `cd /home/mbilski/repos/humalike/openviktor/packages/db && bunx prisma migrate dev --name add-spaces-models`
Expected: Migration created and applied successfully

**Step 5: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat(db): add Space, SpaceDeployment, SpaceVariable models"
```

---

### Task 1.2: Add Spaces-related shared types

**Files:**
- Modify: `packages/shared/src/types.ts`

**Step 1: Add types at the end of the file**

```typescript
export type SpaceStatus = "INITIALIZING" | "READY" | "DEPLOYING" | "ACTIVE" | "FAILED" | "DELETED";

export type SpaceEnvironment = "PREVIEW" | "PRODUCTION";

export type SpaceDeployStatus = "PENDING" | "BUILDING" | "DEPLOYING" | "SUCCESS" | "FAILED";
```

**Step 2: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/shared/src/types.ts
git commit -m "feat(shared): add Spaces type definitions"
```

---

### Task 1.3: Add Spaces config vars

**Files:**
- Modify: `packages/shared/src/config.ts`

**Step 1: Add env vars to the schema**

Add inside the `envSchema` object, after the Pipedream section:

```typescript
		// Spaces
		CONVEX_DEPLOY_KEY: z.string().optional(),
		VERCEL_TOKEN: z.string().optional(),
		VERCEL_ORG_ID: z.string().optional(),
		SPACES_DOMAIN: z.string().default("viktor.space"),
		RESEND_API_KEY: z.string().optional(),
```

**Step 2: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/shared/src/config.ts
git commit -m "feat(shared): add Spaces env config vars"
```

---

## Phase 2: Spaces Service Layer

**Verifiable outcome:** Unit tests pass for the Spaces service that wraps Convex CLI, Vercel API, and Resend. The service can be instantiated and its methods type-check.

### Task 2.1: Create Convex client wrapper

**Files:**
- Create: `packages/tools/src/spaces/convex-client.ts`
- Create: `packages/tools/src/spaces/__tests__/convex-client.test.ts`

**Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexClient } from "../convex-client.js";

const mockExecAsync = vi.fn();
vi.mock("node:child_process", () => ({
	execFile: (...args: unknown[]) => mockExecAsync(...args),
}));

describe("ConvexClient", () => {
	let client: ConvexClient;

	beforeEach(() => {
		client = new ConvexClient({ deployKey: "convex-deploy-key-123" });
		mockExecAsync.mockReset();
	});

	it("creates a new project and returns deployment URLs", async () => {
		mockExecAsync
			.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
				cb(null, { stdout: JSON.stringify({ deploymentName: "uncommon-dotterel-337", url: "https://uncommon-dotterel-337.convex.cloud" }) }),
			)
			.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
				cb(null, { stdout: JSON.stringify({ deploymentName: "third-corgi-353", url: "https://third-corgi-353.convex.cloud" }) }),
			);

		const result = await client.createProject("test-app", "/tmp/test-app");
		expect(result.devUrl).toContain("convex.cloud");
		expect(result.prodUrl).toContain("convex.cloud");
	});

	it("deploys functions to a deployment", async () => {
		mockExecAsync.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
			cb(null, { stdout: "Deployed successfully" }),
		);

		const result = await client.deploy("test-app", "/tmp/test-app", "dev");
		expect(result.success).toBe(true);
	});

	it("queries a deployment database", async () => {
		mockExecAsync.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: Function) =>
			cb(null, { stdout: JSON.stringify([{ _id: "1", title: "test" }]) }),
		);

		const result = await client.query("https://uncommon-dotterel-337.convex.cloud", "tasks:list", {});
		expect(result.success).toBe(true);
		expect(result.data).toHaveLength(1);
	});

	it("deletes project deployments", async () => {
		mockExecAsync
			.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(null, { stdout: "OK" }))
			.mockImplementationOnce((_cmd: string, _args: string[], _opts: unknown, cb: Function) => cb(null, { stdout: "OK" }));

		const result = await client.deleteProject("test-app");
		expect(result.success).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/convex-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`packages/tools/src/spaces/convex-client.ts`:

```typescript
import { execFile } from "node:child_process";

interface ConvexClientConfig {
	deployKey: string;
}

interface ProjectResult {
	devUrl: string;
	prodUrl: string;
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
	private deployKey: string;

	constructor(config: ConvexClientConfig) {
		this.deployKey = config.deployKey;
	}

	async createProject(projectName: string, sandboxPath: string): Promise<ProjectResult> {
		const devResult = await this.exec(
			"npx", ["convex", "deploy", "--cmd", "create", "--project", projectName, "--env", "dev"],
			sandboxPath,
		);
		const prodResult = await this.exec(
			"npx", ["convex", "deploy", "--cmd", "create", "--project", projectName, "--env", "prod"],
			sandboxPath,
		);

		const dev = JSON.parse(devResult);
		const prod = JSON.parse(prodResult);

		return { devUrl: dev.url, prodUrl: prod.url };
	}

	async deploy(projectName: string, sandboxPath: string, env: "dev" | "prod"): Promise<DeployResult> {
		const output = await this.exec(
			"npx", ["convex", "deploy", "--project", projectName, "--env", env],
			sandboxPath,
		);
		return { success: true, output };
	}

	async query(deploymentUrl: string, functionName: string, args: Record<string, unknown>): Promise<QueryResult> {
		const output = await this.exec(
			"npx", ["convex", "run", "--url", deploymentUrl, functionName, JSON.stringify(args)],
			process.cwd(),
		);
		return { success: true, data: JSON.parse(output) };
	}

	async deleteProject(projectName: string): Promise<DeleteResult> {
		const deleted: string[] = [];
		await this.exec("npx", ["convex", "deploy", "--cmd", "delete", "--project", projectName, "--env", "dev"], process.cwd());
		deleted.push("convex_dev");
		await this.exec("npx", ["convex", "deploy", "--cmd", "delete", "--project", projectName, "--env", "prod"], process.cwd());
		deleted.push("convex_prod");
		return { success: true, deletedResources: deleted };
	}

	private exec(cmd: string, args: string[], cwd: string): Promise<string> {
		return new Promise((resolve, reject) => {
			execFile(cmd, args, { cwd, env: { ...process.env, CONVEX_DEPLOY_KEY: this.deployKey } }, (err, result) => {
				if (err) return reject(err);
				resolve((result as unknown as { stdout: string }).stdout);
			});
		});
	}
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/convex-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/spaces/
git commit -m "feat(tools): add ConvexClient wrapper for Spaces"
```

---

### Task 2.2: Create Vercel client wrapper

**Files:**
- Create: `packages/tools/src/spaces/vercel-client.ts`
- Create: `packages/tools/src/spaces/__tests__/vercel-client.test.ts`

**Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VercelClient } from "../vercel-client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("VercelClient", () => {
	let client: VercelClient;

	beforeEach(() => {
		client = new VercelClient({ token: "vercel-token", orgId: "org_123", domain: "viktor.space" });
		mockFetch.mockReset();
	});

	it("creates a new project", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "prj_123", name: "test-app" }),
		});

		const result = await client.createProject("test-app");
		expect(result.projectId).toBe("prj_123");
	});

	it("deploys to preview", async () => {
		mockFetch.mockResolvedValueOnce({
			ok: true,
			json: async () => ({ id: "dpl_123", url: "test-app-abc123.vercel.app", readyState: "READY" }),
		});

		const result = await client.deploy("prj_123", "/tmp/test-app", "preview");
		expect(result.url).toContain("vercel.app");
	});

	it("deletes a project", async () => {
		mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

		const result = await client.deleteProject("prj_123");
		expect(result.success).toBe(true);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/vercel-client.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

`packages/tools/src/spaces/vercel-client.ts`:

```typescript
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
	deploymentId: string;
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
		return { projectId: res.id, name: res.name };
	}

	async deploy(projectId: string, buildDir: string, environment: "preview" | "production"): Promise<DeployResult> {
		const res = await this.request("POST", "/v13/deployments", {
			name: projectId,
			target: environment,
			projectId,
		});
		return { deploymentId: res.id, url: res.url };
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

	private async request(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
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
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/vercel-client.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/spaces/
git commit -m "feat(tools): add VercelClient wrapper for Spaces"
```

---

### Task 2.3: Create Spaces service (orchestrates Convex + Vercel + Prisma)

**Files:**
- Create: `packages/tools/src/spaces/service.ts`
- Create: `packages/tools/src/spaces/__tests__/service.test.ts`

**Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpacesService } from "../service.js";

const mockPrisma = {
	space: {
		create: vi.fn(),
		findUnique: vi.fn(),
		findMany: vi.fn(),
		update: vi.fn(),
	},
	spaceDeployment: {
		create: vi.fn(),
		update: vi.fn(),
	},
	spaceVariable: {
		createMany: vi.fn(),
	},
};

const mockConvex = {
	createProject: vi.fn(),
	deploy: vi.fn(),
	query: vi.fn(),
	deleteProject: vi.fn(),
};

const mockVercel = {
	createProject: vi.fn(),
	deploy: vi.fn(),
	setDomain: vi.fn(),
	deleteProject: vi.fn(),
};

describe("SpacesService", () => {
	let service: SpacesService;

	beforeEach(() => {
		vi.clearAllMocks();
		service = new SpacesService({
			prisma: mockPrisma as any,
			convex: mockConvex as any,
			vercel: mockVercel as any,
			spacesDir: "/data/workspaces",
		});
	});

	it("initializes a new space project", async () => {
		mockConvex.createProject.mockResolvedValue({
			devUrl: "https://dev.convex.cloud",
			prodUrl: "https://prod.convex.cloud",
		});
		mockVercel.createProject.mockResolvedValue({ projectId: "prj_123", name: "app-test" });
		mockVercel.setDomain.mockResolvedValue("test-abc123.viktor.space");
		mockPrisma.space.create.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/data/workspaces/ws1/viktor-spaces/test",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
			projectSecret: "secret_abc",
		});

		const result = await service.initProject("ws1", "test", "A test app");
		expect(result.success).toBe(true);
		expect(result.convexUrlDev).toContain("convex.cloud");
		expect(mockPrisma.space.create).toHaveBeenCalledOnce();
	});

	it("deploys a space to preview", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/tmp/test",
			convexUrlDev: "https://dev.convex.cloud",
		});
		mockConvex.deploy.mockResolvedValue({ success: true, output: "OK" });
		mockVercel.deploy.mockResolvedValue({ deploymentId: "dpl_1", url: "test-123.vercel.app" });
		mockPrisma.spaceDeployment.create.mockResolvedValue({ id: "dep_1" });
		mockPrisma.spaceDeployment.update.mockResolvedValue({});
		mockPrisma.space.update.mockResolvedValue({});

		const result = await service.deploy("ws1", "test", "preview", "initial deploy");
		expect(result.success).toBe(true);
		expect(result.url).toContain("vercel.app");
	});

	it("lists spaces for a workspace", async () => {
		mockPrisma.space.findMany.mockResolvedValue([
			{ id: "space_1", name: "test", status: "ACTIVE", previewUrl: "https://preview.test", productionUrl: null },
		]);

		const result = await service.listSpaces("ws1");
		expect(result.apps).toHaveLength(1);
		expect(result.apps[0].name).toBe("test");
	});

	it("gets space status", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			status: "ACTIVE",
			sandboxPath: "/tmp/test",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
			previewUrl: "https://preview.test",
			productionUrl: "https://prod.test",
			lastDeployedAt: new Date("2026-03-12"),
		});

		const result = await service.getStatus("ws1", "test");
		expect(result.status).toBe("ACTIVE");
		expect(result.productionUrl).toBe("https://prod.test");
	});

	it("queries a space database", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
		});
		mockConvex.query.mockResolvedValue({ success: true, data: [{ _id: "1" }] });

		const result = await service.queryDatabase("ws1", "test", "tasks:list", {}, "dev");
		expect(result.success).toBe(true);
		expect(result.data).toHaveLength(1);
	});

	it("deletes a space and its resources", async () => {
		mockPrisma.space.findUnique.mockResolvedValue({
			id: "space_1",
			name: "test",
			sandboxPath: "/tmp/test",
		});
		mockConvex.deleteProject.mockResolvedValue({ success: true, deletedResources: ["convex_dev", "convex_prod"] });
		mockVercel.deleteProject.mockResolvedValue({ success: true });
		mockPrisma.space.update.mockResolvedValue({});

		const result = await service.deleteProject("ws1", "test");
		expect(result.success).toBe(true);
		expect(result.deletedResources).toContain("convex_dev");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/service.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

`packages/tools/src/spaces/service.ts`:

```typescript
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@openviktor/db";
import type { ConvexClient } from "./convex-client.js";
import type { VercelClient } from "./vercel-client.js";

interface SpacesServiceConfig {
	prisma: PrismaClient;
	convex: ConvexClient;
	vercel: VercelClient;
	spacesDir: string;
}

interface InitResult {
	success: boolean;
	projectName: string;
	sandboxPath: string;
	convexUrlDev: string;
	convexUrlProd: string;
	error?: string;
}

interface DeployResultOutput {
	success: boolean;
	environment: string;
	url: string;
	vercelUrl?: string;
	convexDeployment?: string;
	error?: string;
}

interface ListResult {
	apps: Array<{
		name: string;
		status: string;
		previewUrl: string | null;
		productionUrl: string | null;
	}>;
}

interface StatusResult {
	projectName: string;
	status: string;
	sandboxPath: string;
	convexUrlDev: string | null;
	convexUrlProd: string | null;
	previewUrl: string | null;
	productionUrl: string | null;
	lastDeployedAt: string | null;
}

interface QueryResultOutput {
	success: boolean;
	data: unknown;
	error?: string;
}

interface DeleteResultOutput {
	success: boolean;
	projectName: string;
	deletedResources: string[];
	error?: string;
}

function generateHexId(): string {
	return randomBytes(4).toString("hex");
}

function generateProjectSecret(): string {
	return `secret_${randomBytes(24).toString("hex")}`;
}

export class SpacesService {
	private prisma: PrismaClient;
	private convex: ConvexClient;
	private vercel: VercelClient;
	private spacesDir: string;

	constructor(config: SpacesServiceConfig) {
		this.prisma = config.prisma;
		this.convex = config.convex;
		this.vercel = config.vercel;
		this.spacesDir = config.spacesDir;
	}

	async initProject(workspaceId: string, name: string, description?: string): Promise<InitResult> {
		const sandboxPath = `${this.spacesDir}/${workspaceId}/viktor-spaces/${name}`;
		const hexId = generateHexId();
		const projectSecret = generateProjectSecret();

		const convexResult = await this.convex.createProject(name, sandboxPath);
		const vercelResult = await this.vercel.createProject(name);
		const domain = await this.vercel.setDomain(vercelResult.projectId, hexId, name);

		const space = await this.prisma.space.create({
			data: {
				workspaceId,
				name,
				description: description ?? null,
				status: "READY",
				sandboxPath,
				domain,
				previewUrl: `https://preview-${name}-${hexId}.viktor.space`,
				convexUrlDev: convexResult.devUrl,
				convexUrlProd: convexResult.prodUrl,
				projectSecret,
			},
		});

		return {
			success: true,
			projectName: name,
			sandboxPath: space.sandboxPath,
			convexUrlDev: convexResult.devUrl,
			convexUrlProd: convexResult.prodUrl,
		};
	}

	async deploy(workspaceId: string, name: string, environment: "preview" | "production", commitMessage?: string): Promise<DeployResultOutput> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) return { success: false, environment, url: "", error: `Space not found: ${name}` };

		const deployment = await this.prisma.spaceDeployment.create({
			data: {
				spaceId: space.id,
				environment: environment === "preview" ? "PREVIEW" : "PRODUCTION",
				status: "BUILDING",
				commitMessage,
			},
		});

		const start = Date.now();
		const convexEnv = environment === "preview" ? "dev" : "prod";
		await this.convex.deploy(name, space.sandboxPath, convexEnv);

		const vercelResult = await this.vercel.deploy(name, space.sandboxPath, environment);

		await this.prisma.spaceDeployment.update({
			where: { id: deployment.id },
			data: {
				status: "SUCCESS",
				url: vercelResult.url,
				vercelUrl: vercelResult.url,
				durationMs: Date.now() - start,
			},
		});

		const updateData: Record<string, unknown> = { lastDeployedAt: new Date(), status: "ACTIVE" };
		if (environment === "production") updateData.productionUrl = `https://${space.domain}`;
		else updateData.previewUrl = vercelResult.url;

		await this.prisma.space.update({
			where: { id: space.id },
			data: updateData,
		});

		return {
			success: true,
			environment,
			url: environment === "production" ? `https://${space.domain}` : vercelResult.url,
			vercelUrl: vercelResult.url,
		};
	}

	async listSpaces(workspaceId: string): Promise<ListResult> {
		const spaces = await this.prisma.space.findMany({
			where: { workspaceId, status: { not: "DELETED" } },
			orderBy: { createdAt: "asc" },
		});

		return {
			apps: spaces.map((s) => ({
				name: s.name,
				status: s.status,
				previewUrl: s.previewUrl,
				productionUrl: s.productionUrl,
			})),
		};
	}

	async getStatus(workspaceId: string, name: string): Promise<StatusResult> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) throw new Error(`Space not found: ${name}`);

		return {
			projectName: space.name,
			status: space.status,
			sandboxPath: space.sandboxPath,
			convexUrlDev: space.convexUrlDev,
			convexUrlProd: space.convexUrlProd,
			previewUrl: space.previewUrl,
			productionUrl: space.productionUrl,
			lastDeployedAt: space.lastDeployedAt?.toISOString() ?? null,
		};
	}

	async queryDatabase(workspaceId: string, name: string, functionName: string, args: Record<string, unknown>, environment: "dev" | "prod"): Promise<QueryResultOutput> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) return { success: false, data: null, error: `Space not found: ${name}` };

		const url = environment === "dev" ? space.convexUrlDev : space.convexUrlProd;
		if (!url) return { success: false, data: null, error: `No ${environment} deployment URL found` };

		return this.convex.query(url, functionName, args);
	}

	async deleteProject(workspaceId: string, name: string): Promise<DeleteResultOutput> {
		const space = await this.prisma.space.findUnique({
			where: { workspaceId_name: { workspaceId, name } },
		});
		if (!space) return { success: false, projectName: name, deletedResources: [], error: `Space not found: ${name}` };

		const deleted: string[] = [];

		const convexResult = await this.convex.deleteProject(name);
		deleted.push(...convexResult.deletedResources);

		await this.vercel.deleteProject(name);
		deleted.push("vercel_project");

		await this.prisma.space.update({
			where: { id: space.id },
			data: { status: "DELETED" },
		});
		deleted.push("database_record");

		return { success: true, projectName: name, deletedResources: deleted };
	}

	async findBySecret(projectName: string, projectSecret: string): Promise<{ workspaceId: string; spaceId: string } | null> {
		const space = await this.prisma.space.findFirst({
			where: { name: projectName, projectSecret, status: { not: "DELETED" } },
		});
		if (!space) return null;
		return { workspaceId: space.workspaceId, spaceId: space.id };
	}
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/service.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/spaces/
git commit -m "feat(tools): add SpacesService orchestrator"
```

---

## Phase 3: Agent Tools (6 SDK tools)

**Verifiable outcome:** All 6 tools register in the ToolRegistry, their definitions type-check, executor unit tests pass with mocked SpacesService.

### Task 3.1: Create Spaces tool definitions and executors

**Files:**
- Create: `packages/tools/src/spaces/tools.ts`
- Create: `packages/tools/src/spaces/__tests__/tools.test.ts`

**Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExecutionContext } from "../../registry.js";
import { createSpacesToolExecutors, spacesToolDefinitions } from "../tools.js";

const mockService = {
	initProject: vi.fn(),
	deploy: vi.fn(),
	listSpaces: vi.fn(),
	getStatus: vi.fn(),
	queryDatabase: vi.fn(),
	deleteProject: vi.fn(),
};

function makeCtx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
	return {
		workspaceId: "ws_test",
		workspaceDir: "/data/workspaces/ws_test",
		timeoutMs: 60_000,
		...overrides,
	};
}

describe("Spaces tool definitions", () => {
	it("exports 6 tool definitions", () => {
		expect(spacesToolDefinitions).toHaveLength(6);
		const names = spacesToolDefinitions.map((d) => d.name);
		expect(names).toContain("init_app_project");
		expect(names).toContain("deploy_app");
		expect(names).toContain("list_apps");
		expect(names).toContain("get_app_status");
		expect(names).toContain("query_app_database");
		expect(names).toContain("delete_app_project");
	});

	it("all definitions have required fields", () => {
		for (const def of spacesToolDefinitions) {
			expect(def.name).toBeTruthy();
			expect(def.description).toBeTruthy();
			expect(def.input_schema).toBeDefined();
		}
	});
});

describe("Spaces tool executors", () => {
	let executors: ReturnType<typeof createSpacesToolExecutors>;

	beforeEach(() => {
		vi.clearAllMocks();
		executors = createSpacesToolExecutors(mockService as any);
	});

	it("init_app_project calls service and returns result", async () => {
		mockService.initProject.mockResolvedValue({
			success: true,
			projectName: "my-app",
			sandboxPath: "/data/workspaces/ws_test/viktor-spaces/my-app",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
		});

		const result = await executors.init_app_project(
			{ project_name: "my-app", description: "Test app" },
			makeCtx(),
		);
		expect(result.error).toBeUndefined();
		expect((result.output as any).success).toBe(true);
		expect(mockService.initProject).toHaveBeenCalledWith("ws_test", "my-app", "Test app");
	});

	it("deploy_app calls service with correct environment", async () => {
		mockService.deploy.mockResolvedValue({
			success: true,
			environment: "production",
			url: "https://my-app-abc.viktor.space",
		});

		const result = await executors.deploy_app(
			{ project_name: "my-app", environment: "production", commit_message: "v1" },
			makeCtx(),
		);
		expect(result.error).toBeUndefined();
		expect((result.output as any).url).toContain("viktor.space");
	});

	it("list_apps returns workspace apps", async () => {
		mockService.listSpaces.mockResolvedValue({
			apps: [{ name: "my-app", status: "ACTIVE", previewUrl: null, productionUrl: "https://my-app.viktor.space" }],
		});

		const result = await executors.list_apps({}, makeCtx());
		expect((result.output as any).apps).toHaveLength(1);
	});

	it("get_app_status returns space details", async () => {
		mockService.getStatus.mockResolvedValue({
			projectName: "my-app",
			status: "ACTIVE",
			sandboxPath: "/tmp/my-app",
			convexUrlDev: "https://dev.convex.cloud",
			convexUrlProd: "https://prod.convex.cloud",
			previewUrl: null,
			productionUrl: "https://my-app.viktor.space",
			lastDeployedAt: "2026-03-12T00:00:00.000Z",
		});

		const result = await executors.get_app_status({ project_name: "my-app" }, makeCtx());
		expect((result.output as any).status).toBe("ACTIVE");
	});

	it("query_app_database passes through to service", async () => {
		mockService.queryDatabase.mockResolvedValue({ success: true, data: [{ _id: "1" }] });

		const result = await executors.query_app_database(
			{ project_name: "my-app", function_name: "tasks:list", args: {}, environment: "dev" },
			makeCtx(),
		);
		expect((result.output as any).data).toHaveLength(1);
	});

	it("delete_app_project removes space", async () => {
		mockService.deleteProject.mockResolvedValue({
			success: true,
			projectName: "my-app",
			deletedResources: ["convex_dev", "convex_prod", "vercel_project"],
		});

		const result = await executors.delete_app_project({ project_name: "my-app" }, makeCtx());
		expect((result.output as any).deletedResources).toHaveLength(3);
	});

	it("returns error when service throws", async () => {
		mockService.initProject.mockRejectedValue(new Error("Convex API down"));

		const result = await executors.init_app_project(
			{ project_name: "my-app" },
			makeCtx(),
		);
		expect(result.error).toContain("Convex API down");
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/tools.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

`packages/tools/src/spaces/tools.ts`:

```typescript
import type { LLMToolDefinition, ToolResult } from "@openviktor/shared";
import type { ToolExecutionContext, ToolExecutor } from "../registry.js";
import type { SpacesService } from "./service.js";

export const initAppProjectDefinition: LLMToolDefinition = {
	name: "init_app_project",
	description:
		"Create a new Spaces app with Convex backend and Vercel frontend hosting. Scaffolds a full-stack template with React 19, Tailwind, shadcn/ui, and email auth. Takes ~30 seconds.",
	input_schema: {
		type: "object",
		properties: {
			project_name: {
				type: "string",
				description: "Lowercase, alphanumeric with hyphens. Used in domain: {name}-{id}.viktor.space",
			},
			description: {
				type: "string",
				description: "Short description of what the app does",
			},
		},
		required: ["project_name"],
	},
};

export const deployAppDefinition: LLMToolDefinition = {
	name: "deploy_app",
	description:
		"Deploy a Spaces app to preview (dev database) or production (prod database). Pushes Convex functions and builds frontend.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the Spaces app to deploy" },
			environment: {
				type: "string",
				enum: ["preview", "production"],
				description: "Target environment",
			},
			commit_message: { type: "string", description: "Deploy description (auto-generated if omitted)" },
		},
		required: ["project_name", "environment"],
	},
};

export const listAppsDefinition: LLMToolDefinition = {
	name: "list_apps",
	description: "List all Spaces apps in this workspace with their URLs and status.",
	input_schema: { type: "object", properties: {} },
};

export const getAppStatusDefinition: LLMToolDefinition = {
	name: "get_app_status",
	description: "Get detailed status of a Spaces app including URLs, database endpoints, and last deploy time.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the Spaces app" },
		},
		required: ["project_name"],
	},
};

export const queryAppDatabaseDefinition: LLMToolDefinition = {
	name: "query_app_database",
	description: "Run a Convex query or mutation against a Spaces app's dev or prod database.",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the Spaces app" },
			function_name: { type: "string", description: 'Convex function to call (e.g. "tasks:list")' },
			args: { type: "object", description: "Arguments to pass to the function" },
			environment: {
				type: "string",
				enum: ["dev", "prod"],
				description: "Which database to query",
			},
		},
		required: ["project_name", "function_name", "environment"],
	},
};

export const deleteAppProjectDefinition: LLMToolDefinition = {
	name: "delete_app_project",
	description: "Delete a Spaces app and all its resources (Convex deployments, Vercel project, database records).",
	input_schema: {
		type: "object",
		properties: {
			project_name: { type: "string", description: "Name of the Spaces app to delete" },
		},
		required: ["project_name"],
	},
};

export const spacesToolDefinitions: LLMToolDefinition[] = [
	initAppProjectDefinition,
	deployAppDefinition,
	listAppsDefinition,
	getAppStatusDefinition,
	queryAppDatabaseDefinition,
	deleteAppProjectDefinition,
];

export function createSpacesToolExecutors(
	service: SpacesService,
): Record<string, ToolExecutor> {
	async function wrapCall(
		fn: () => Promise<unknown>,
	): Promise<ToolResult> {
		const start = Date.now();
		try {
			const output = await fn();
			return { output, durationMs: Date.now() - start };
		} catch (error) {
			return {
				output: null,
				durationMs: Date.now() - start,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	return {
		init_app_project: (args, ctx) =>
			wrapCall(() => service.initProject(ctx.workspaceId, args.project_name as string, args.description as string | undefined)),

		deploy_app: (args, ctx) =>
			wrapCall(() => service.deploy(ctx.workspaceId, args.project_name as string, args.environment as "preview" | "production", args.commit_message as string | undefined)),

		list_apps: (_args, ctx) =>
			wrapCall(() => service.listSpaces(ctx.workspaceId)),

		get_app_status: (args, ctx) =>
			wrapCall(() => service.getStatus(ctx.workspaceId, args.project_name as string)),

		query_app_database: (args, ctx) =>
			wrapCall(() => service.queryDatabase(ctx.workspaceId, args.project_name as string, args.function_name as string, (args.args as Record<string, unknown>) ?? {}, args.environment as "dev" | "prod")),

		delete_app_project: (args, ctx) =>
			wrapCall(() => service.deleteProject(ctx.workspaceId, args.project_name as string)),
	};
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/tools.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/tools/src/spaces/
git commit -m "feat(tools): add 6 Spaces SDK tool definitions and executors"
```

---

### Task 3.2: Register Spaces tools in the native registry

**Files:**
- Modify: `packages/tools/src/tools/index.ts`
- Create: `packages/tools/src/spaces/index.ts`

**Step 1: Create barrel export**

`packages/tools/src/spaces/index.ts`:

```typescript
export { ConvexClient } from "./convex-client.js";
export { VercelClient } from "./vercel-client.js";
export { SpacesService } from "./service.js";
export {
	spacesToolDefinitions,
	createSpacesToolExecutors,
	initAppProjectDefinition,
	deployAppDefinition,
	listAppsDefinition,
	getAppStatusDefinition,
	queryAppDatabaseDefinition,
	deleteAppProjectDefinition,
} from "./tools.js";
```

**Step 2: Add `registerSpacesTools` function to `packages/tools/src/tools/index.ts`**

Add import at top:

```typescript
import {
	type SpacesService,
	createSpacesToolExecutors,
	spacesToolDefinitions,
} from "../spaces/index.js";
```

Add function at bottom (after `registerThreadOrchestrationTools`):

```typescript
export function registerSpacesTools(
	registry: ToolRegistry,
	service: SpacesService,
): void {
	const executors = createSpacesToolExecutors(service);
	const local = { localOnly: true };
	for (const definition of spacesToolDefinitions) {
		registry.register(definition.name, definition, executors[definition.name], local);
	}
}
```

**Step 3: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add packages/tools/src/spaces/index.ts packages/tools/src/tools/index.ts
git commit -m "feat(tools): register Spaces tools in native registry"
```

---

### Task 3.3: Wire Spaces tools into bot startup

**Files:**
- Modify: `apps/bot/src/index.ts`

**Step 1: Add imports**

```typescript
import { ConvexClient, SpacesService, VercelClient } from "@openviktor/tools/spaces";
import { registerSpacesTools } from "@openviktor/tools";
```

Note: You may need to update the `@openviktor/tools` package exports in `packages/tools/src/index.ts` or `packages/tools/package.json` to expose the spaces subpath. Check the existing export patterns first.

**Step 2: Initialize Spaces service after registry creation (near where cron tools are registered)**

Add after the existing tool registration block:

```typescript
	if (config.CONVEX_DEPLOY_KEY && config.VERCEL_TOKEN) {
		const convexClient = new ConvexClient({ deployKey: config.CONVEX_DEPLOY_KEY });
		const vercelClient = new VercelClient({
			token: config.VERCEL_TOKEN,
			orgId: config.VERCEL_ORG_ID ?? "",
			domain: config.SPACES_DOMAIN,
		});
		const spacesService = new SpacesService({
			prisma,
			convex: convexClient,
			vercel: vercelClient,
			spacesDir: "/data/workspaces",
		});
		registerSpacesTools(registry, spacesService);
		logger.info("Spaces tools registered");
	}
```

**Step 3: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 4: Verify tools appear in registry**

Start the bot with `CONVEX_DEPLOY_KEY` and `VERCEL_TOKEN` set (can be dummy values for now). Check the startup log for "Spaces tools registered" and the tool list including `init_app_project`.

**Step 5: Commit**

```bash
git add apps/bot/src/index.ts packages/tools/src/index.ts
git commit -m "feat(bot): wire Spaces tools into bot startup"
```

---

## Phase 4: Spaces Callback API

**Verifiable outcome:** `POST /api/viktor-spaces/tools/call` with a valid project secret proxies to the tool registry and returns results. `POST /api/viktor-spaces/send-email` sends emails via Resend. Both reject invalid secrets.

### Task 4.1: Create Spaces API route handler

**Files:**
- Create: `apps/bot/src/spaces/api.ts`
- Create: `apps/bot/src/spaces/__tests__/api.test.ts`

**Step 1: Write the failing test**

```typescript
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSpacesApi } from "../api.js";

const mockService = {
	findBySecret: vi.fn(),
};

const mockRegistry = {
	resolve: vi.fn(),
	execute: vi.fn(),
	isLocalOnly: vi.fn().mockReturnValue(true),
};

const mockLogger = {
	info: vi.fn(),
	warn: vi.fn(),
	error: vi.fn(),
};

describe("Spaces API", () => {
	let api: ReturnType<typeof createSpacesApi>;

	beforeEach(() => {
		vi.clearAllMocks();
		api = createSpacesApi({
			spacesService: mockService as any,
			registry: mockRegistry as any,
			logger: mockLogger as any,
			defaultTimeoutMs: 60_000,
		});
	});

	it("rejects requests with missing project_secret", async () => {
		const req = new Request("http://localhost/api/viktor-spaces/tools/call", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ project_name: "test", role: "quick_ai_search", arguments: {} }),
		});

		const res = await api.fetch(req);
		expect(res.status).toBe(401);
	});

	it("rejects requests with invalid secret", async () => {
		mockService.findBySecret.mockResolvedValue(null);

		const req = new Request("http://localhost/api/viktor-spaces/tools/call", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ project_name: "test", project_secret: "bad", role: "quick_ai_search", arguments: {} }),
		});

		const res = await api.fetch(req);
		expect(res.status).toBe(403);
	});

	it("proxies valid tool calls to the registry", async () => {
		mockService.findBySecret.mockResolvedValue({ workspaceId: "ws_1", spaceId: "sp_1" });
		mockRegistry.resolve.mockReturnValue("quick_ai_search");
		mockRegistry.execute.mockResolvedValue({ output: { answer: "42" }, durationMs: 100 });

		const req = new Request("http://localhost/api/viktor-spaces/tools/call", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				project_name: "test",
				project_secret: "secret_valid",
				role: "quick_ai_search",
				arguments: { search_question: "test" },
			}),
		});

		const res = await api.fetch(req);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.success).toBe(true);
		expect(body.result.answer).toBe("42");
	});

	it("returns 404 for unknown tools", async () => {
		mockService.findBySecret.mockResolvedValue({ workspaceId: "ws_1", spaceId: "sp_1" });
		mockRegistry.resolve.mockReturnValue(undefined);

		const req = new Request("http://localhost/api/viktor-spaces/tools/call", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				project_name: "test",
				project_secret: "secret_valid",
				role: "nonexistent",
				arguments: {},
			}),
		});

		const res = await api.fetch(req);
		expect(res.status).toBe(404);
	});

	it("returns 404 for unmatched paths", async () => {
		const req = new Request("http://localhost/api/viktor-spaces/unknown", { method: "POST" });
		const res = await api.fetch(req);
		expect(res.status).toBe(404);
	});
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run apps/bot/src/spaces/__tests__/api.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

`apps/bot/src/spaces/api.ts`:

```typescript
import type { Logger } from "@openviktor/shared";
import type { ToolRegistry } from "@openviktor/tools";
import { ensureWorkspace } from "@openviktor/tools";
import type { SpacesService } from "@openviktor/tools/spaces";

interface SpacesApiDeps {
	spacesService: SpacesService;
	registry: ToolRegistry;
	logger: Logger;
	defaultTimeoutMs: number;
	resendApiKey?: string;
}

interface SpacesToolRequest {
	project_name: string;
	project_secret: string;
	role: string;
	arguments: Record<string, unknown>;
}

interface SpacesEmailRequest {
	project_name: string;
	project_secret: string;
	to_email: string;
	subject: string;
	html_content: string;
	text_content?: string;
	email_type?: string;
}

export function createSpacesApi(deps: SpacesApiDeps): { fetch: (req: Request) => Promise<Response> } {
	const { spacesService, registry, logger, defaultTimeoutMs } = deps;

	async function authenticateRequest(body: { project_name?: string; project_secret?: string }): Promise<{ workspaceId: string; spaceId: string } | Response> {
		if (!body.project_name || !body.project_secret) {
			return Response.json({ success: false, error: "Missing project_name or project_secret" }, { status: 401 });
		}

		const result = await spacesService.findBySecret(body.project_name, body.project_secret);
		if (!result) {
			return Response.json({ success: false, error: "Invalid project credentials" }, { status: 403 });
		}

		return result;
	}

	async function handleToolCall(req: Request): Promise<Response> {
		let body: SpacesToolRequest;
		try {
			body = await req.json() as SpacesToolRequest;
		} catch {
			return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
		}

		const auth = await authenticateRequest(body);
		if (auth instanceof Response) return auth;

		const resolvedKey = registry.resolve(body.role, auth.workspaceId);
		if (!resolvedKey) {
			return Response.json({ success: false, error: `Unknown tool: ${body.role}` }, { status: 404 });
		}

		const workspaceDir = await ensureWorkspace(auth.workspaceId);
		const ctx = { workspaceId: auth.workspaceId, workspaceDir, timeoutMs: defaultTimeoutMs };

		logger.info({ tool: body.role, projectName: body.project_name }, "Spaces API tool call");
		const result = await registry.execute(resolvedKey, body.arguments ?? {}, ctx);

		if (result.error) {
			return Response.json({ success: false, error: result.error });
		}

		return Response.json({ success: true, result: result.output });
	}

	async function handleSendEmail(req: Request): Promise<Response> {
		if (!deps.resendApiKey) {
			return Response.json({ success: false, error: "Email service not configured" }, { status: 503 });
		}

		let body: SpacesEmailRequest;
		try {
			body = await req.json() as SpacesEmailRequest;
		} catch {
			return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
		}

		const auth = await authenticateRequest(body);
		if (auth instanceof Response) return auth;

		const res = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${deps.resendApiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				from: `${body.project_name}@notifications.viktor.space`,
				to: body.to_email,
				subject: body.subject,
				html: body.html_content,
				text: body.text_content,
			}),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			logger.warn({ projectName: body.project_name, error: err }, "Spaces email send failed");
			return Response.json({ success: false, error: "Email delivery failed" });
		}

		logger.info({ projectName: body.project_name, to: body.to_email }, "Spaces email sent");
		return Response.json({ success: true });
	}

	return {
		fetch: async (req: Request): Promise<Response> => {
			const url = new URL(req.url, "http://localhost");

			if (req.method !== "POST") {
				return Response.json({ error: "Method not allowed" }, { status: 405 });
			}

			if (url.pathname === "/api/viktor-spaces/tools/call") {
				return handleToolCall(req);
			}

			if (url.pathname === "/api/viktor-spaces/send-email") {
				return handleSendEmail(req);
			}

			return Response.json({ error: "Not found" }, { status: 404 });
		},
	};
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run apps/bot/src/spaces/__tests__/api.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/bot/src/spaces/
git commit -m "feat(bot): add Spaces callback API for deployed apps"
```

---

### Task 4.2: Mount Spaces API routes in gateway server

**Files:**
- Modify: `apps/bot/src/index.ts`

**Step 1: Import and create Spaces API**

Add import:

```typescript
import { createSpacesApi } from "./spaces/api.js";
```

After the `spacesService` initialization block (from Task 3.3), create the API:

```typescript
		const spacesApi = createSpacesApi({
			spacesService,
			registry,
			logger: createLogger("spaces-api"),
			defaultTimeoutMs: config.TOOL_TIMEOUT_MS,
			resendApiKey: config.RESEND_API_KEY,
		});
```

**Step 2: Mount routes in `Bun.serve` fetch handler**

In the `Bun.serve` fetch handler, add before the `// Dashboard API` block:

```typescript
			// Spaces callback API (deployed apps → Viktor)
			if (url.pathname.startsWith("/api/viktor-spaces/") && spacesApi) {
				const response = await spacesApi.fetch(req);
				for (const [key, value] of Object.entries(corsHeaders)) {
					response.headers.set(key, value);
				}
				return response;
			}
```

Note: The `spacesApi` variable needs to be declared outside the `if (config.CONVEX_DEPLOY_KEY)` block scope, initialized as `undefined` and conditionally assigned. Adjust the scoping accordingly.

**Step 3: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/bot/src/index.ts
git commit -m "feat(bot): mount Spaces callback API routes on gateway"
```

---

## Phase 5: App Template + Init Flow

**Verifiable outcome:** `init_app_project` tool creates a working Convex + React app template in the workspace sandbox directory, with the correct env vars and project structure. The template can be verified by checking the generated file tree.

### Task 5.1: Create the app template

**Files:**
- Create: `packages/tools/src/spaces/template/` directory tree

This task creates the minimal app template that gets copied during `init_app_project`. The template should include:

- `package.json` with Convex, React 19, Vite 7, Tailwind v4, shadcn/ui deps
- `convex/schema.ts` with a basic users table
- `convex/auth.ts` with email/OTP auth setup
- `src/main.tsx` entry point
- `src/App.tsx` basic app shell
- `vite.config.ts`
- `biome.json`
- `tsconfig.json`
- `scripts/test.ts` Playwright test runner
- `.env.example` showing required vars

**Step 1: Create the template files**

This is a large task — create each file following the Convex + React patterns from the Viktor reference docs. The key constraint is that the template must work with `bun install && bun run sync && bun run build` after env vars are set.

**Step 2: Write a test that verifies the template copies correctly**

```typescript
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const TEMPLATE_DIR = resolve(import.meta.dirname, "../../spaces/template");

describe("Spaces app template", () => {
	it("contains required files", () => {
		expect(existsSync(resolve(TEMPLATE_DIR, "package.json"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "vite.config.ts"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "tsconfig.json"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "convex/schema.ts"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "src/main.tsx"))).toBe(true);
		expect(existsSync(resolve(TEMPLATE_DIR, "src/App.tsx"))).toBe(true);
	});
});
```

**Step 3: Run test**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/template.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/tools/src/spaces/template/
git commit -m "feat(tools): add Spaces app template (Convex + React + shadcn)"
```

---

### Task 5.2: Add template copy logic to SpacesService.initProject

**Files:**
- Modify: `packages/tools/src/spaces/service.ts`

**Step 1: Add template copy to initProject**

At the start of `initProject`, after creating `sandboxPath`, copy the template:

```typescript
import { cpSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

// Inside initProject, before Convex/Vercel API calls:
const templateDir = resolve(dirname(import.meta.url.replace("file://", "")), "./template");
mkdirSync(sandboxPath, { recursive: true });
cpSync(templateDir, sandboxPath, { recursive: true });
```

**Step 2: Write env vars into the copied template**

After copying, write the Spaces-specific env vars:

```typescript
import { writeFileSync } from "node:fs";

writeFileSync(
	`${sandboxPath}/.env.local`,
	[
		`VITE_CONVEX_URL=${convexResult.devUrl}`,
		`CONVEX_DEPLOY_KEY=${/* passed through config */}`,
		`VIKTOR_SPACES_API_URL=${/* base URL from config */}`,
		`VIKTOR_SPACES_PROJECT_NAME=${name}`,
		`VIKTOR_SPACES_PROJECT_SECRET=${projectSecret}`,
	].join("\n"),
);
```

**Step 3: Run existing service tests**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/service.test.ts`
Expected: PASS (mocked — no actual file ops)

**Step 4: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 5: Commit**

```bash
git add packages/tools/src/spaces/service.ts
git commit -m "feat(tools): copy app template and inject env vars during init"
```

---

## Phase 6: Dashboard UI

**Verifiable outcome:** The admin dashboard shows a `/spaces` page listing all Spaces apps with status, URLs, and deploy history. Clicking a space shows its details.

### Task 6.1: Add Spaces dashboard API endpoints

**Files:**
- Modify: `apps/bot/src/tool-gateway/dashboard-api.ts`

**Step 1: Add Spaces endpoints**

Add routes for:
- `GET /api/spaces` — list spaces for the workspace
- `GET /api/spaces/:name` — get space details + recent deployments
- `GET /api/spaces/:name/deployments` — list deployment history

Follow the existing pattern in `dashboard-api.ts` for auth, error handling, and response format.

**Step 2: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/bot/src/tool-gateway/dashboard-api.ts
git commit -m "feat(bot): add Spaces dashboard API endpoints"
```

---

### Task 6.2: Add Spaces page to web dashboard

**Files:**
- Create: `apps/web/src/pages/Spaces.tsx`
- Create: `apps/web/src/pages/SpaceDetail.tsx`
- Modify: `apps/web/src/App.tsx` (add routes)
- Modify: `apps/web/src/components/AppLayout.tsx` (add nav item)
- Modify: `apps/web/src/lib/api.ts` (add API functions)

**Step 1: Add API functions**

In `apps/web/src/lib/api.ts`, add:

```typescript
export async function fetchSpaces(): Promise<Space[]> { ... }
export async function fetchSpace(name: string): Promise<SpaceDetail> { ... }
export async function fetchSpaceDeployments(name: string): Promise<Deployment[]> { ... }
```

**Step 2: Create Spaces list page**

Follow the existing page patterns (e.g., `Runs.tsx`, `Threads.tsx`) — table layout with status badges, clickable rows.

**Step 3: Create Space detail page**

Show: name, status, URLs (clickable), Convex endpoints, env vars (masked), deployment history table.

**Step 4: Add routes and navigation**

In `App.tsx` add `<Route path="/spaces" element={<Spaces />} />` and `<Route path="/spaces/:name" element={<SpaceDetail />} />`.

In `AppLayout.tsx` add the nav item with a Globe or Box icon.

**Step 5: Run typecheck and lint**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck && bun run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/web/src/
git commit -m "feat(web): add Spaces dashboard pages"
```

---

## Phase 7: Integration Testing + Docs

**Verifiable outcome:** Full end-to-end flow works: agent calls `init_app_project` → template is created → `deploy_app` pushes to Convex/Vercel → app is accessible → callback API works → dashboard shows the space.

### Task 7.1: Add integration test for Spaces lifecycle

**Files:**
- Create: `packages/tools/src/spaces/__tests__/integration.test.ts`

Write a test that exercises the full lifecycle with mocked external services:

```typescript
describe("Spaces lifecycle (integration)", () => {
	it("init → deploy preview → deploy production → query → delete", async () => {
		// 1. init_app_project
		// 2. verify files exist in sandbox
		// 3. deploy to preview
		// 4. deploy to production
		// 5. query database
		// 6. get status (verify URLs)
		// 7. list apps (verify appears)
		// 8. delete
		// 9. list apps (verify gone)
	});
});
```

**Step 1: Write the test with all assertions**

**Step 2: Run test**

Run: `cd /home/mbilski/repos/humalike/openviktor && bunx vitest run packages/tools/src/spaces/__tests__/integration.test.ts`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/tools/src/spaces/__tests__/integration.test.ts
git commit -m "test(tools): add Spaces lifecycle integration test"
```

---

### Task 7.2: Add Viktor reference doc

**Files:**
- Create: `docs/viktor-reference/spaces.md`

Copy the reverse-engineered doc from `/home/mbilski/repos/humalike/viktor-reverse-engineering/docs/spaces.md` and add a header noting which parts are implemented vs planned.

**Step 1: Copy and annotate**

**Step 2: Commit**

```bash
git add docs/viktor-reference/spaces.md
git commit -m "docs: add Spaces reference documentation"
```

---

### Task 7.3: Update .env.example and README

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Step 1: Add Spaces env vars to .env.example**

```bash
# Spaces (optional — enables app hosting)
CONVEX_DEPLOY_KEY=
VERCEL_TOKEN=
VERCEL_ORG_ID=
SPACES_DOMAIN=viktor.space
RESEND_API_KEY=
```

**Step 2: Update README phase table**

Add Spaces to the feature/phase table.

**Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "docs: add Spaces config to .env.example and README"
```

---

### Task 7.4: Run full quality checks

**Step 1: Run all tests**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run test`
Expected: All tests pass

**Step 2: Run lint**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run lint`
Expected: No errors

**Step 3: Run typecheck**

Run: `cd /home/mbilski/repos/humalike/openviktor && bun run typecheck`
Expected: No errors

---

## Phase Summary

| Phase | What you can verify | Dependencies |
|-------|-------------------|--------------|
| **1: Schema + Types** | `bun run db:generate` + `bun run typecheck` pass, models in Prisma Studio | None |
| **2: Service Layer** | Unit tests pass for ConvexClient, VercelClient, SpacesService | Phase 1 |
| **3: Agent Tools** | 6 tools registered, tool executor tests pass, bot starts with tools listed | Phase 2 |
| **4: Callback API** | `/api/viktor-spaces/tools/call` proxies tools, rejects bad secrets | Phase 3 |
| **5: App Template** | `init_app_project` creates correct file tree in sandbox | Phase 3 |
| **6: Dashboard** | `/spaces` page shows apps, detail page shows deployments | Phase 1, 4 |
| **7: Integration + Docs** | Full lifecycle test passes, docs updated, all quality checks green | All |
