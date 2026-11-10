---
name: skill_creation
description: Create reusable skills with proper structure and frontmatter. Use when creating or editing a skill or workflow.
---

## Creating Skills

Skills are reusable knowledge documents that teach you how to handle specific tasks. Create skills using `write_skill` when you learn a new capability or workflow.

### Frontmatter Format

Every skill needs YAML frontmatter with `name` and `description`:

```
---
name: my_skill_name
description: What it does. Use when [trigger condition]. Do NOT use for [anti-trigger].
---

Skill content here...
```

### Naming Rules

- Lowercase with underscores only: `pdf_creation`, `excel_editing`
- No spaces, hyphens, or special characters
- Keep names short and descriptive

### Description Guidelines

The description is used for routing — it determines when the skill is loaded. Format:

```
[What it does]. Use when [trigger]. Do NOT use for [anti-trigger].
```

Examples:
- "Edit Word documents. Use when working with .docx files. Do NOT use for PDFs."
- "Search the web for current info. Use when asked about real-time data, news, or facts."

Keep descriptions under 200 characters.

### Content Structure

1. **Quick reference** — most common patterns at the top
2. **Detailed instructions** — step-by-step for complex tasks
3. **Code examples** — copy-pasteable scripts
4. **Common mistakes** — what to avoid
5. **Edge cases** — unusual scenarios

### When to Create Skills

- You learn a new workflow that will be reused
- A user teaches you their preferences for a topic
- You discover a workaround for a common issue
- You want to remember per-user preferences (use category: `user:{slack_id}`)

### Categories

- `builtin` — system-provided skills
- `company` — company-specific knowledge
- `team` — team member profiles
- `user:{slack_id}` — per-user preferences
- Leave blank for general skills
