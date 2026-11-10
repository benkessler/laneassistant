# OpenViktor Admin Dashboard — Design System

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Vercel / CDN   │     │  Serverless API   │     │   Bot Service    │
│  (static SPA)   │────▶│  Gateway (thin)   │────▶│  (Bun + Prisma)  │
│  React + Vite   │     │  /api/* proxy     │     │  dashboard-api   │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

**Key constraints:**
- The web dashboard never connects to the database directly
- All data flows through the bot service's dashboard API (`dashboard-api.ts`)
- The SPA is a static build, deployable to Vercel or any CDN
- Auth: API key or Slack OAuth token passed through the gateway

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + Vite 6 |
| Routing | react-router-dom v6 |
| Data fetching | TanStack Query v5 |
| Styling | Tailwind CSS v4 |
| Charts | Recharts v2 |
| Icons | lucide-react |
| Utilities | clsx + tailwind-merge, date-fns |
| Testing | Vitest + Testing Library |

## Design Tokens

### Colors

Primary palette (Indigo):
```
primary-50:  #eef2ff    primary-500: #6366f1
primary-100: #e0e7ff    primary-600: #4f46e5
primary-200: #c7d2fe    primary-700: #4338ca
primary-300: #a5b4fc    primary-800: #3730a3
primary-400: #818cf8    primary-900: #312e81
```

Semantic colors (via Tailwind defaults):
- Success: `emerald-100/800` (bg/text)
- Warning: `amber-100/800`
- Error: `red-100/800`
- Info: `blue-100/800`
- Neutral: `slate-100/600`

### Typography

- Font: `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`
- Page title: `text-2xl font-bold text-slate-900`
- Card title: `text-sm font-semibold text-slate-900`
- Section label: `text-xs font-semibold text-slate-500`
- Body: `text-sm text-slate-600`
- Muted: `text-xs text-slate-400`
- Mono (IDs, code): `font-mono text-xs text-slate-500`

### Spacing & Layout

- Sidebar: fixed `w-60`, white bg, border-right
- Main content: `bg-slate-50 p-6`
- Page sections: `space-y-6`
- Grid gaps: `gap-4`
- Card padding: `p-5`
- Card border: `rounded-xl border border-slate-200 shadow-sm`

## Component Library

### Card
Container with white bg, rounded corners, subtle shadow.
- `Card` — wrapper: `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`
- `CardHeader` — title + optional action slot

### StatCard
Metric display with icon, label, value, optional sub-value.
Colors: `primary`, `emerald`, `amber`, `red` — icon bg uses `{color}-50`, icon uses `{color}-600`.

### Badge
Inline status pill: `rounded-full px-2 py-0.5 text-xs font-medium`.
Status mappings:
- COMPLETED → `bg-emerald-100 text-emerald-800`
- RUNNING → `bg-blue-100 text-blue-800`
- QUEUED → `bg-amber-100 text-amber-800`
- FAILED → `bg-red-100 text-red-800`
- CANCELLED → `bg-slate-100 text-slate-800`

### EmptyState
Centered `Inbox` icon + message for zero-data states.

### Loading Skeleton
Animated pulse placeholders matching card dimensions: `animate-pulse rounded-xl border border-slate-200 bg-white`.

### AppLayout
Sidebar + content shell. Sidebar nav items use `NavLink` with active state: `bg-primary-50 text-primary-700`.

### Tables
Minimal style — no full borders. Header: `border-b border-slate-100 text-xs font-medium text-slate-500`. Rows: `border-b border-slate-50`, hover: `hover:bg-slate-50`. Clickable rows use `cursor-pointer`.

## Utility Functions

| Function | Purpose |
|----------|---------|
| `cn(...inputs)` | Merge Tailwind classes (clsx + twMerge) |
| `formatCost(cents)` | Cents → `$X.XX` |
| `formatDuration(ms)` | ms → human readable (`1.2s`, `3.4m`) |
| `formatTokens(n)` | Token count → `1.2k`, `3.45M` |
| `statusColor(status)` | AgentRun status → badge class |
| `threadStatusColor(status)` | Thread status → badge class |

## Pages

| Route | Description |
|-------|-------------|
| `/` | Health / system status |
| `/overview` | Dashboard with aggregate stats, cost by model, runs by day |
| `/runs`, `/runs/:id` | Agent run list + detail view with messages and tool calls |
| `/threads` | Thread list with status and run counts |
| `/tools` | Tool call statistics — total calls, success rate, avg duration |
| `/knowledge` | Learnings and skills accumulated by the agent |
| `/integrations` | Connected apps grid with connect/disconnect flows |
| `/tasks` | Cron jobs — schedule, description, enabled/disabled toggle |
| `/usage` | Monthly cost stats, daily cost chart, top threads by cost |
| `/team` | Workspace members |
| `/settings` | Model selector, workspace configuration |
