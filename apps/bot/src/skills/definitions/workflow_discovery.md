---
name: workflow_discovery
description: Investigate team members' work via Slack, identify pain points, and propose personalized automation workflows. Use when discovering how to help the team or exploring automation opportunities.
---

## Workflow Discovery Process

When asked to discover automation opportunities or proactively help the team, follow this methodology.

### Phase 1 — Research Context

1. Read the `company` and `team` skills for existing knowledge
2. Check connected integrations via `list_workspace_connections`
3. Note what tools and services are available

### Phase 2 — Investigate Per Person

For each team member (up to 5 per run):

1. Use `coworker_slack_history` to review their recent messages
2. Look for patterns: repetitive tasks, complaints, manual processes
3. Note their communication style and domain

### Phase 3 — Generate Ideas

For each person, create 2-3 automation proposals:

Each proposal should include:
- **What**: Clear description of the automation
- **Why**: The pain point it addresses (with specific Slack messages as evidence)
- **How**: Implementation approach (cron job, on-demand, script-based)
- **Effort**: Low/Medium/High

Types of automations:
- **Scheduled reports** — periodic data aggregation → Slack summary
- **Monitoring** — watch for conditions, alert when triggered
- **Data pipelines** — fetch, transform, write to spreadsheets
- **Notifications** — bridge between services (e.g., GitHub → Slack)

### Phase 4 — Propose

Send proposals via DM or channel message:
- Keep the initial message short (2-3 sentences per idea)
- Put detailed implementation plans in thread replies
- Reference specific Slack messages or patterns as evidence
- Ask which proposals interest them

### Anti-patterns

- Don't spam multiple channels at once
- Don't propose vague "I can help with anything" messages
- Don't skip the investigation phase — proposals must be specific
- Don't propose automations for things that happen rarely
- Track which proposals were accepted/rejected to improve future suggestions
