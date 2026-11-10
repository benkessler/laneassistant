import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { getMe } from "../lib/api";

export function SignInPage() {
	const navigate = useNavigate();
	const [error, setError] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: getMe, retry: false });

	if (isLoading) return null;
	if (me) return <Navigate to="/dashboard" replace />;

	async function handleSubmit(e: FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError("");
		setSubmitting(true);
		const form = new FormData(e.currentTarget);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({
					username: form.get("username"),
					password: form.get("password"),
				}),
			});
			if (!res.ok) {
				setError(res.status === 401 ? "Invalid username or password" : "Sign-in failed");
				return;
			}
			navigate("/dashboard");
		} catch {
			setError("Could not reach the server");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-[#fafcfd] px-4">
			<div className="w-full max-w-sm rounded-xl border border-[#d6eaef] bg-white p-8 shadow-sm">
				<div className="mb-6 text-center">
					<h1 className="text-xl font-bold text-[#111]">Lane Assistant</h1>
					<p className="mt-1 text-sm text-[#6b7080]">Sign in to the admin dashboard</p>
				</div>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label htmlFor="username" className="mb-1 block text-sm font-medium text-[#333]">
							Username
						</label>
						<input
							id="username"
							name="username"
							type="text"
							autoComplete="username"
							className="w-full rounded-lg border border-[#d6eaef] px-3 py-2 text-sm focus:border-[#1e6a8a] focus:outline-none"
							required
						/>
					</div>
					<div>
						<label htmlFor="password" className="mb-1 block text-sm font-medium text-[#333]">
							Password
						</label>
						<input
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							className="w-full rounded-lg border border-[#d6eaef] px-3 py-2 text-sm focus:border-[#1e6a8a] focus:outline-none"
							required
						/>
					</div>
					{error && (
						<div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
					)}
					<button
						type="submit"
						disabled={submitting}
						className="w-full rounded-lg bg-[#1e6a8a] px-4 py-2 text-sm font-medium text-white hover:bg-[#185870] disabled:opacity-50"
					>
						{submitting ? "Signing in..." : "Sign in"}
					</button>
				</form>
				<div className="mt-6 border-t border-[#d6eaef] pt-4 text-center">
					<a href="/slack/oauth/install" className="text-sm text-[#1e6a8a] hover:underline">
						Sign in with Slack
					</a>
				</div>
			</div>
		</div>
	);
}
