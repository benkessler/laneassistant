import { type FormEvent, useCallback, useEffect, useState } from "react";
import type { SuperadminData } from "../lib/api";

function timeAgo(iso: string): string {
	const diff = Date.now() - new Date(iso).getTime();
	const mins = Math.floor(diff / 60_000);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

const TOKEN_KEY = "ov_admin_token";

function getToken(): string | null {
	return localStorage.getItem(TOKEN_KEY);
}

async function fetchSuperadmin(): Promise<SuperadminData> {
	const token = getToken();
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;
	const res = await fetch("/api/superadmin", { headers });
	if (!res.ok) throw new Error(`${res.status}`);
	return res.json();
}

async function login(username: string, password: string): Promise<string> {
	const res = await fetch("/api/auth/login", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		credentials: "include",
		body: JSON.stringify({ username, password }),
	});
	const body = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(body.error || "Login failed");
	if (!body.token) throw new Error("No token received");
	localStorage.setItem(TOKEN_KEY, body.token);
	return body.token;
}

export function SuperadminPage() {
	const [state, setState] = useState<"loading" | "login" | "dashboard">("loading");
	const [data, setData] = useState<SuperadminData | null>(null);
	const [loginError, setLoginError] = useState("");
	const [loginLoading, setLoginLoading] = useState(false);

	const loadData = useCallback(async () => {
		try {
			const result = await fetchSuperadmin();
			setData(result);
			setState("dashboard");
		} catch {
			setState("login");
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useEffect(() => {
		if (state !== "dashboard") return;
		const interval = setInterval(async () => {
			try {
				const result = await fetchSuperadmin();
				setData(result);
			} catch {
				/* ignore refresh errors */
			}
		}, 30_000);
		return () => clearInterval(interval);
	}, [state]);

	const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setLoginError("");
		setLoginLoading(true);
		const form = new FormData(e.currentTarget);
		try {
			await login(form.get("username") as string, form.get("password") as string);
			await loadData();
		} catch (err) {
			setLoginError(err instanceof Error ? err.message : "Login failed");
		} finally {
			setLoginLoading(false);
		}
	};

	if (state === "loading") {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50">
				<div className="text-sm text-slate-400">Loading...</div>
			</div>
		);
	}

	if (state === "login") {
		return (
			<div className="flex min-h-screen items-center justify-center bg-slate-50">
				<div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
					<div className="mb-6 text-center">
						<h1 className="text-xl font-bold text-slate-900">Superadmin</h1>
						<p className="mt-1 text-sm text-slate-500">Sign in with admin credentials</p>
					</div>
					<form onSubmit={handleLogin} className="space-y-4">
						<div>
							<label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
								Username
							</label>
							<input
								id="username"
								name="username"
								type="text"
								className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
								required
							/>
						</div>
						<div>
							<label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
								Password
							</label>
							<input
								id="password"
								name="password"
								type="password"
								className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
								required
							/>
						</div>
						{loginError && (
							<div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
								{loginError}
							</div>
						)}
						<button
							type="submit"
							disabled={loginLoading}
							className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
						>
							{loginLoading ? "Signing in..." : "Sign in"}
						</button>
					</form>
				</div>
			</div>
		);
	}

	if (!data) return null;

	const { summary, workspaces } = data;
	const totalMembers = workspaces.reduce((s, w) => s + w.members, 0);

	return (
		<div className="min-h-screen bg-slate-50">
			<nav className="border-b border-slate-200 bg-white px-6 h-14 flex items-center">
				<h1 className="text-sm font-bold tracking-wide text-slate-900">OPENVIKTOR SUPERADMIN</h1>
			</nav>
			<main className="max-w-6xl mx-auto p-6 space-y-6">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<div className="rounded-xl border border-slate-200 bg-white p-5">
						<div className="text-xs font-medium text-slate-500 mb-1">Workspaces</div>
						<div className="text-2xl font-bold text-slate-900">{summary.totalWorkspaces}</div>
						<div className="text-xs text-slate-400">{summary.activeWorkspaces} active</div>
					</div>
					<div className="rounded-xl border border-slate-200 bg-white p-5">
						<div className="text-xs font-medium text-slate-500 mb-1">Runs (24h)</div>
						<div className="text-2xl font-bold text-slate-900">{summary.totalRuns24h}</div>
					</div>
					<div className="rounded-xl border border-slate-200 bg-white p-5">
						<div className="text-xs font-medium text-slate-500 mb-1">Total Members</div>
						<div className="text-2xl font-bold text-slate-900">{totalMembers}</div>
					</div>
				</div>

				<div className="rounded-xl border border-slate-200 bg-white p-5">
					<h3 className="mb-4 text-sm font-semibold text-slate-900">All Workspaces</h3>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-slate-200 text-left text-xs text-slate-500">
									<th className="pb-2 pr-4 font-medium">Workspace</th>
									<th className="pb-2 pr-4 font-medium">Members</th>
									<th className="pb-2 pr-4 font-medium">Runs</th>
									<th className="pb-2 pr-4 font-medium">Threads</th>
									<th className="pb-2 pr-4 font-medium">Runs (24h)</th>
									<th className="pb-2 pr-4 font-medium">Cost (7d)</th>
									<th className="pb-2 pr-4 font-medium">Last Activity</th>
									<th className="pb-2 font-medium">Status</th>
								</tr>
							</thead>
							<tbody>
								{workspaces.map((ws) => (
									<tr key={ws.id} className="border-b border-slate-100">
										<td className="py-2.5 pr-4 font-medium text-slate-900">{ws.slackTeamName}</td>
										<td className="py-2.5 pr-4 text-slate-600">{ws.members}</td>
										<td className="py-2.5 pr-4 text-slate-600">{ws.totalRuns}</td>
										<td className="py-2.5 pr-4 text-slate-600">{ws.totalThreads}</td>
										<td className="py-2.5 pr-4 text-slate-600">{ws.runsLast24h}</td>
										<td className="py-2.5 pr-4 text-slate-600">
											${(ws.costLast7dCents / 100).toFixed(2)}
										</td>
										<td className="py-2.5 pr-4 text-slate-500">
											{ws.lastActivity ? timeAgo(ws.lastActivity) : "—"}
										</td>
										<td className="py-2.5">
											<span
												className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
													ws.isActive
														? "bg-emerald-50 text-emerald-700"
														: "bg-slate-100 text-slate-500"
												}`}
											>
												<span
													className={`h-1.5 w-1.5 rounded-full ${ws.isActive ? "bg-emerald-500" : "bg-slate-400"}`}
												/>
												{ws.isActive ? "Active" : "Inactive"}
											</span>
										</td>
									</tr>
								))}
								{workspaces.length === 0 && (
									<tr>
										<td colSpan={8} className="py-8 text-center text-slate-400">
											No workspaces connected yet.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>
			</main>
		</div>
	);
}
