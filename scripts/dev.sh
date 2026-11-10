#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== OpenViktor Dev ==="
echo ""

# ─── .env ───────────────────────────────────────────────
if [ ! -f ".env" ]; then
  if [ -f "docker/.env.example" ]; then
    cp docker/.env.example .env
    echo "Created .env from docker/.env.example"
    echo ""
    echo "  Edit .env with your credentials before continuing:"
    echo "    - SLACK_BOT_TOKEN"
    echo "    - SLACK_APP_TOKEN"
    echo "    - SLACK_SIGNING_SECRET"
    echo "    - ANTHROPIC_API_KEY (or set DEFAULT_MODEL=ollama/<model> for local LLM)"
    echo ""
    exit 1
  fi
  echo "Error: .env file not found and no template available."
  exit 1
fi

# ─── Start ──────────────────────────────────────────────
echo "Building and starting all services..."
echo "Bot runs inside Docker with --watch for live reload."
echo ""

exec docker compose -f docker/docker-compose.yml --profile dev up --build bot-dev
