# CLAUDE.md

Lane Assistant is Lane Growth's AI teammate: an autonomous agent that lives in Slack, runs client
work through connected tools, follows up on its own schedule, and remembers what it learns. It runs
first for Lane Growth itself, and later as one isolated Slack workspace per client.

## Project Structure

TypeScript monorepo with Bun workspaces and Turborepo:
- `apps/bot/` — Slack bot, agent runtime, scheduler, tool gateway, dashboard API (main entry point)
- `apps/web/` — Admin dashboard (React + Vite), served by the bot from `apps/web/dist`
- `packages/db/` — PostgreSQL schema with Prisma ORM
- `packages/shared/` — Shared types, config (zod), logger (pino), errors
- `packages/tools/` — Tool registry, executors, per-workspace tool tokens
- `packages/integrations/` — External service clients (Pipedream Connect)
- `docs/research/` — Background research on Viktor, the product this design started from

## Common Commands

```bash
bun install
bun run dev                                       # All dev servers
bun run --filter @laneassistant/bot dev           # Bot only
bun run --filter @laneassistant/web build         # Build the dashboard the bot serves

bun run db:generate                               # Regenerate Prisma client
bun run db:migrate                                # Run migrations (dev)

bun run lint                                      # Biome check
bun run lint:fix
bun run typecheck
bun run test

docker compose -f docker/docker-compose.yml up -d # PostgreSQL + Redis
```

## After Schema Changes

1. `bun run db:generate`
2. `cd packages/db && bunx prisma migrate dev --name describe-change`
3. `bun run typecheck`

## Code Style

- Clean code, no comments that restate the code; doc-strings only for exported or non-obvious APIs
- TypeScript strict mode; Biome handles formatting and linting

## Before Finishing a Change

- `bun run test`, `bun run lint`, and `bun run typecheck` all pass
- New behavior has tests (unit tests next to code or in `__tests__/`)
- `README.md`, `docs/self-hosting.md`, and `.env.example` are updated when setup or config changes

## Invariants — do not break these

- **Workspace isolation.** Each Slack workspace is one client. Tool-gateway calls carry a token
  signed for exactly one workspace (`packages/tools/src/tool-token.ts`); never route by a shared
  or global token. Data reads and writes are always scoped by `workspaceId`.
- **Approval before external actions.** Anything that leaves Slack (email, CRM, calendar, posts to
  external people) goes through the permission gate. Do not default `DANGEROUSLY_SKIP_PERMISSIONS` on.
- **Thinking blocks are replayed unchanged** within a tool loop (`apps/bot/src/agent/providers/anthropic.ts`).
  Current Claude models reject forced `tool_choice`, `budget_tokens`, and disabled thinking.
- **No secrets in sandbox env.** Child processes get `buildSandboxEnv`, never `process.env`.

## Key Patterns

- Slack via Socket Mode in self-hosted mode (no public URL needed); Events API + OAuth in managed mode
- LLM calls go through the provider abstraction (`apps/bot/src/agent/gateway.ts`, `providers/`)
- Model per run: trigger model (cron cost tier) → dashboard Settings choice → `DEFAULT_MODEL`
- All agent work is tracked as `AgentRun` rows in PostgreSQL
- Built-in skills live in `apps/bot/src/skills/definitions/*.md` and are seeded per workspace
- Structured logging with pino; environment config validated with zod at startup
