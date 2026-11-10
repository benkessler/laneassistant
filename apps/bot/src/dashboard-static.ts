import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const DEFAULT_DIST_DIR = resolve(import.meta.dirname, "../../web/dist");

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".ico": "image/x-icon",
	".woff2": "font/woff2",
	".txt": "text/plain; charset=utf-8",
};

function isFile(path: string): boolean {
	return existsSync(path) && statSync(path).isFile();
}

/** Resolves a URL path to a file inside root, or null if it would escape root. */
function resolveInside(root: string, pathname: string): string | null {
	const requested = resolve(root, `.${decodeURIComponent(pathname)}`);
	if (requested === root) return root;
	return requested.startsWith(root + sep) ? requested : null;
}

async function serveFile(path: string, cacheControl: string): Promise<Response> {
	return new Response(await readFile(path), {
		headers: {
			"Content-Type": CONTENT_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream",
			"Cache-Control": cacheControl,
		},
	});
}

/**
 * Serves the built admin dashboard (apps/web/dist) from the bot's HTTP server, so a
 * single container hosts Slack webhooks, the dashboard API, and the dashboard UI.
 * Unknown paths fall back to index.html for client-side routing. Returns null when no
 * build exists, or when the request is not a GET for a page or asset.
 */
export function createDashboardStaticHandler(distDir: string = DEFAULT_DIST_DIR) {
	const root = resolve(distDir);
	const indexPath = resolve(root, "index.html");
	const assetsDir = resolve(root, "assets") + sep;

	return async (req: Request): Promise<Response | null> => {
		if (req.method !== "GET" && req.method !== "HEAD") return null;
		if (!existsSync(indexPath)) return null;

		const { pathname } = new URL(req.url, "http://localhost");
		const requested = resolveInside(root, pathname);
		if (!requested) return null;

		if (isFile(requested)) {
			const immutable = requested.startsWith(assetsDir);
			return serveFile(requested, immutable ? "public, max-age=31536000, immutable" : "no-cache");
		}
		if (extname(pathname)) return null;
		return serveFile(indexPath, "no-cache");
	};
}
