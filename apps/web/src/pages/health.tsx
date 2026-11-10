import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Database, Globe, Server } from "lucide-react";
import { Card } from "../components/ui/card";
import { StatCard } from "../components/ui/stat-card";
import { getHealth } from "../lib/api";

export function HealthPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["health"],
		queryFn: getHealth,
		refetchInterval: 30_000,
	});

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
					{["h1", "h2", "h3", "h4"].map((key) => (
						<div
							key={key}
							className="h-24 animate-pulse rounded-xl border border-slate-200 bg-white"
						/>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		console.error("Failed to load health status", error);
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				Failed to load health status. Please try again.
			</div>
		);
	}

	if (!data) return null;

	const isHealthy = data.status === "healthy";

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-slate-900">System Status</h1>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<StatCard
					label="Status"
					value={isHealthy ? "Healthy" : "Degraded"}
					icon={Server}
					color={isHealthy ? "emerald" : "red"}
				/>
				<StatCard
					label="Database"
					value={data.database === "connected" ? "Connected" : "Disconnected"}
					icon={Database}
					color={data.database === "connected" ? "emerald" : "red"}
				/>
				<StatCard
					label="Workspaces"
					value={String(data.connectedWorkspaces)}
					subValue="connected"
					icon={Globe}
					color="primary"
				/>
				<StatCard
					label="Deployment"
					value={data.deploymentMode}
					icon={CheckCircle2}
					color="primary"
				/>
			</div>

			<Card>
				<h3 className="mb-3 text-sm font-semibold text-slate-900">System Details</h3>
				<dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<div>
						<dt className="text-xs text-slate-500">Health Status</dt>
						<dd className="mt-0.5 text-sm font-medium text-slate-800">{data.status}</dd>
					</div>
					<div>
						<dt className="text-xs text-slate-500">Deployment Mode</dt>
						<dd className="mt-0.5 text-sm font-medium text-slate-800">{data.deploymentMode}</dd>
					</div>
					<div>
						<dt className="text-xs text-slate-500">Database Connection</dt>
						<dd className="mt-0.5 text-sm font-medium text-slate-800">{data.database}</dd>
					</div>
					<div>
						<dt className="text-xs text-slate-500">Connected Workspaces</dt>
						<dd className="mt-0.5 text-sm font-medium text-slate-800">
							{data.connectedWorkspaces}
						</dd>
					</div>
				</dl>
			</Card>
		</div>
	);
}
