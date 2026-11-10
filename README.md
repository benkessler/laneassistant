# Lane Assistant

**Lane Growth's AI teammate in Slack.** Lane Assistant joins a Slack workspace, works through the
tools you connect (Gmail, Calendar, HubSpot, Sheets and thousands more), checks in on its own
schedule, and remembers what it learns about the team and the work.

It runs first inside Lane Growth to manage client accounts. The longer-term plan is one Lane
Assistant per client business: each client gets its own Slack workspace connection, its own memory,
its own integrations and its own budget, and nothing is shared between them.

## What it does

- **Answers and acts in Slack** — mention it in a channel or DM it; it replies in-thread, runs tools,
  and asks for approval (Slack buttons) before anything that leaves Slack, such as sending an email
  or changing a CRM record.
- **Checks in on its own** — a heartbeat four times a weekday looks for unanswered questions, stalled
  work and follow-ups; a twice-weekly discovery pass proposes automations.
- **Runs scheduled work** — recurring jobs on cron schedules, each with a cost tier
  (Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5) and an optional cheap pre-check that skips the run
  when there is nothing to do.
- **Remembers** — writes learnings and reusable skills per workspace, and reads them at the start of
  each run.
- **Connects to apps** — Pipedream Connect handles OAuth for ~3,000 apps; custom HTTP APIs can be
  added by describing them.
- **Admin dashboard** — runs, threads, tool calls, costs, budgets, integrations, scheduled tasks,
  and the model each workspace uses.

## Quick start

You need [Bun](https://bun.sh) ≥ 1.2, Docker with Compose, a Slack app created from
[`slack-app-manifest.yml`](slack-app-manifest.yml) with Socket Mode on, and an
[Anthropic API key](https://console.anthropic.com/).

```bash
git clone https://github.com/benkessler/laneassistant.git
cd laneassistant
./scripts/setup.sh
```

Then fill in `.env` (copied from [`.env.example`](.env.example)) and start everything:

```bash
bun run dev
```

The dashboard is at http://localhost:5173 in development (Vite) and at http://localhost:3001 when
the bot serves the built dashboard in production. For a production deployment, see the
[self-hosting guide](docs/self-hosting.md).

## Layout

```
laneassistant/
├── apps/
│   ├── bot/              # Slack bot, agent runtime, scheduler, tool gateway, dashboard API
│   └── web/              # Admin dashboard (React + Vite), served by the bot in production
├── packages/
│   ├── db/               # PostgreSQL schema (Prisma)
│   ├── shared/           # Types, config, logger, errors
│   ├── tools/            # Tool registry and executors
│   └── integrations/     # Pipedream Connect client
├── docker/               # Compose files for local infra and self-hosting
├── infra/                # Optional GCP (Cloud Run) and Modal sandbox deployment
└── docs/                 # Self-hosting guide, dashboard design, background research
```

| Component | Technology |
|-----------|-----------|
| Runtime | Bun, TypeScript (strict) |
| Database | PostgreSQL 16 + Prisma, Redis 7 (optional) |
| Models | Claude Opus 5.5 by default; OpenAI, Gemini and local Ollama models also supported |
| Slack | Bolt SDK — Socket Mode (single workspace) or Events API + OAuth (many workspaces) |
| Quality | Biome, Vitest, Turborepo |

## Development

```bash
bun install
docker compose -f docker/docker-compose.yml up -d    # PostgreSQL + Redis
bun run db:generate
bun run db:migrate
bun run dev
bun run test
bun run lint
bun run typecheck
```

## Security notes

- Agent shell commands run on the host when `TOOL_BACKEND=local`. Switch to `TOOL_BACKEND=modal`
  (isolated sandboxes) before giving the agent access to client data.
- Tool-gateway calls are authorized with a token signed for one workspace, so one client's run
  can never act inside another client's workspace.
- Keep `DANGEROUSLY_SKIP_PERMISSIONS` off; it removes the approval step for external actions.

## Roadmap

| Item | Status |
|------|--------|
| Client records: contacts, deliverables and integrations per client workspace | Planned |
| Lane Growth skills: weekly client report, meeting follow-up, CRM hygiene, client onboarding | Planned |
| Native email tools (today: via a connected Gmail or Outlook integration) | Planned |

## Credits and license

Lane Assistant began as a fork of [OpenViktor](https://github.com/karstengresch/FORK_openviktor)
(MIT, © 2026 Mateusz Jacniacki), an open-source reimplementation of Viktor. The original license is
kept in [LICENSE](LICENSE) as the MIT license requires.
