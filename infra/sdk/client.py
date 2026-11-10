"""HTTP client for the OpenViktor Tool Gateway.

Scripts running in the sandbox can import this module to call any registered
tool through the gateway. No external dependencies required — uses stdlib only.

Usage:
    from sdk.internal.client import get_client

    result = get_client().call("quick_ai_search", search_question="weather today")
    print(result)

Environment variables:
    TOOL_GATEWAY_URL  — Gateway base URL (default: http://localhost:3001)
    TOOL_TOKEN        — Bearer token for authentication
"""

import asyncio
import json
import os
import urllib.error
import urllib.request


class ToolClient:
    """Synchronous + async client for calling tools through the gateway."""

    def __init__(self):
        gateway_url = os.getenv("TOOL_GATEWAY_URL", "http://localhost:3001").rstrip("/")
        if not gateway_url.endswith("/v1/tools"):
            gateway_url = f"{gateway_url}/v1/tools"
        self.call_url = f"{gateway_url}/call"
        self.token = os.getenv("TOOL_TOKEN", "")

    def call(self, role: str, **kwargs):
        """Call a tool synchronously.

        Args:
            role: Tool name (e.g. "bash", "quick_ai_search")
            **kwargs: Tool arguments

        Returns:
            The tool result (dict, list, str, etc.)

        Raises:
            Exception: On gateway or tool errors
        """
        # Strip internal fields that shouldn't be forwarded
        clean_args = {k: v for k, v in kwargs.items() if v is not None}

        data = json.dumps({"role": role, "arguments": clean_args}).encode()
        req = urllib.request.Request(
            self.call_url,
            data=data,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                result = json.loads(resp.read())
                if result.get("error"):
                    raise Exception(f"Tool error: {result['error']}")
                return result.get("result")
        except urllib.error.HTTPError as e:
            body = e.read().decode()
            raise Exception(f"Gateway error: {e.code} - {body}")

    async def acall(self, role: str, **kwargs):
        """Call a tool asynchronously (runs sync call in a thread).

        Same interface as call() but awaitable.
        """
        return await asyncio.to_thread(self.call, role, **kwargs)


_client = ToolClient()


def get_client() -> ToolClient:
    """Get the global ToolClient singleton."""
    return _client
