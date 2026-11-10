---
name: scheduled_crons
description: Create, manage, and trigger scheduled cron jobs that run automatically. Use when asked to set up recurring tasks, scheduled reports, or periodic checks.
---

## Cron Job Management

Create automated tasks that run on a schedule. Two types:

### Agent Crons
The agent receives a prompt and responds using its full tool set.

```
create_agent_cron(
    name="weekly-standup-summary",
    schedule="0 9 * * 1",           # Every Monday at 9am UTC
    channel="C0123456",             # Slack channel for output
    prompt="Summarize what the team accomplished last week based on Slack activity.",
)
```

### Script Crons
A Python script runs directly in the sandbox.

```
create_script_cron(
    name="check-uptime",
    schedule="*/30 * * * *",        # Every 30 minutes
    channel="C0123456",
    script_path="crons/check-uptime/scripts/run.py",
)
```

### Schedule Format (POSIX cron)

```
┌────── minute (0-59)
│ ┌──── hour (0-23)
│ │ ┌── day of month (1-31)
│ │ │ ┌ month (1-12)
│ │ │ │ ┌ day of week (0-6, Sun=0)
│ │ │ │ │
* * * * *
```

Common patterns:
- `0 9 * * 1-5` — Weekdays at 9am UTC
- `0 */4 * * *` — Every 4 hours
- `0 9 * * 1` — Mondays at 9am UTC
- `*/15 * * * *` — Every 15 minutes
- `0 0 1 * *` — First of each month

### Tools

| Tool | Description |
|------|-------------|
| `create_agent_cron` | Create a cron that runs an agent with a prompt |
| `create_script_cron` | Create a cron that runs a Python script |
| `delete_cron` | Delete a cron job by name |
| `trigger_cron` | Manually trigger a cron job immediately |

### Script Cron Best Practices

1. Store scripts in `crons/{cron-name}/scripts/`
2. Use the SDK to call tools: `from sdk.tools.default_tools import coworker_send_slack_message`
3. Save state/progress to files in the cron directory
4. Log output to stdout — it's captured automatically
