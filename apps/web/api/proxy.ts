export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
	const botUrl = process.env.BOT_API_URL;
	if (!botUrl) {
		return Response.json({ error: "BOT_API_URL not configured" }, { status: 503 });
	}

	if (req.method === "OPTIONS") {
		return new Response(null, {
			status: 204,
			headers: {
				"Access-Control-Allow-Origin": "*",
				"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
				"Access-Control-Allow-Headers": "Content-Type, Authorization, X-Workspace-Id",
				"Access-Control-Max-Age": "86400",
			},
		});
	}

	const url = new URL(req.url);
	const target = new URL(url.pathname + url.search, botUrl);

	const headers = new Headers(req.headers);
	headers.delete("host");

	const res = await fetch(target.toString(), {
		method: req.method,
		headers,
		body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
	});

	const responseHeaders = new Headers(res.headers);
	responseHeaders.set("Access-Control-Allow-Origin", "*");

	return new Response(res.body, {
		status: res.status,
		statusText: res.statusText,
		headers: responseHeaders,
	});
}
