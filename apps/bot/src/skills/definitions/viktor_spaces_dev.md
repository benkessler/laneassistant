---
name: viktor_spaces_dev
description: Build and deploy full-stack mini apps with database and hosting. Use when users want a custom web app, dashboard, or interactive tool.
---

## What Are Viktor Spaces?

Viktor Spaces are full-stack web applications you can create for users. Each app includes:
- A real-time database (Convex) with separate dev and prod environments
- Frontend hosting (Vercel)
- Custom subdomain on the configured SPACES_DOMAIN

Use them when users need a custom tool, dashboard, internal app, or interactive prototype.

Before starting to build a new app, ask the user a few questions in one message if the request is underspecified.

## Project Location

All Viktor Spaces apps live in `/data/workspaces/{workspaceId}/viktor-spaces/{project_name}/`.

When you call `init_app_project`, it clones the template into this folder, creates both dev and prod Convex deployments, and configures Vercel hosting.

## Available Tools

| Tool                 | Purpose                               |
| -------------------- | ------------------------------------- |
| `init_app_project`   | Create a new app with Convex + Vercel |
| `deploy_app`         | Deploy to preview or production       |
| `list_apps`          | List all apps you've created          |
| `get_app_status`     | Get URLs and deployment status        |
| `query_app_database` | Query data from the Convex database   |
| `delete_app_project` | Delete an app and all its resources   |

## What the Template Includes

When you create a new app, it comes pre-configured with:

- **Convex backend** — Real-time database, queries, mutations, actions
- **React 19 + Vite** — Frontend with source files in `src/` (entry point: `src/App.tsx`)
- **Convex functions** in `convex/` directory
- **convex/viktorTools.ts** — Ready-made action for calling Viktor's tools (AI, search, image generation, etc.)
- **Biome** — Linting and formatting

## Development Workflow

1. **Call `init_app_project`** to scaffold the app
2. **Read the template files** — especially `convex/viktorTools.ts` and `src/App.tsx`
3. **Implement features** — backend in `convex/`, frontend in `src/`
4. **Sync and build**: run `bun run sync:build` in the sandbox via bash
5. **Deploy preview**: `deploy_app(project_name, environment="preview")`
6. **Notify user via Slack** with the preview URL from the deploy response
7. **Wait for approval** before deploying to production
8. **Deploy production**: `deploy_app(project_name, environment="production")`

## Calling Viktor's Tools from Your App (CRITICAL)

The template includes `convex/viktorTools.ts` with a `callTool()` action. This lets your app use any Viktor tool at runtime (AI search, image generation, Slack messaging, etc.).

**ALWAYS use the existing `convex/viktorTools.ts` — NEVER write your own fetch logic or hardcode any URLs.**

### Usage from another Convex action:

```typescript
import { action } from "./_generated/server";
import { v } from "convex/values";

export const chat = action({
  args: { message: v.string() },
  handler: async (ctx, { message }) => {
    const result = await ctx.runAction(api.viktorTools.callTool, {
      role: "quick_ai_search",
      arguments: { search_question: message },
    });
    return result;
  },
});
```

### Usage from React frontend:

IMPORTANT: viktorTools.callTool is an ACTION, not a mutation. Always use `useAction`, never `useMutation`.

```typescript
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";

function MyComponent() {
  const callTool = useAction(api.viktorTools.callTool);

  const handleClick = async () => {
    const result = await callTool({
      role: "quick_ai_search",
      arguments: { search_question: "How does React work?" },
    });
    console.log(result);
  };
}
```

### Available tool roles:

- `quick_ai_search` — AI-powered search and Q&A
- `coworker_text2im` — Image generation from text prompts
- `coworker_send_slack_message` — Send messages to Slack channels
- Any other tool registered in the Viktor tool registry

### How it works:

The `callTool()` action reads `VIKTOR_SPACES_API_URL`, `VIKTOR_SPACES_PROJECT_NAME`, and `VIKTOR_SPACES_PROJECT_SECRET` from environment variables (set automatically during `init_app_project`) and POSTs to `{VIKTOR_SPACES_API_URL}/api/viktor-spaces/tools/call`.

**The project_secret is automatically configured — you never need to set it manually.**

## Environment Separation

Each app has two isolated Convex databases:

| Environment | Convex Database | Use Case |
| ----------- | --------------- | -------- |
| Preview     | Dev deployment  | Testing  |
| Production  | Prod deployment | Live     |

Preview and production data are completely isolated.

## Getting App URLs

- `deploy_app()` returns `url` — the deployed app's URL. **Always use this URL, never construct URLs yourself.**
- `list_apps()` returns `preview_url` and `production_url` for each app
- `get_app_status()` returns full details including all URLs

## Debugging

Run these in the app's sandbox directory via bash:

```bash
bun run logs:fetch    # Convex backend logs
bun run check         # Lint errors
```
