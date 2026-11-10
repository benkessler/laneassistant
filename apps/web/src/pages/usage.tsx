import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { getUsage } from "../lib/api";
import { formatCost, formatTokens } from "../lib/utils";

export function UsagePage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["usage"],
		queryFn: getUsage,
	});

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
				<div className="grid grid-cols-4 gap-4">
					{["u1", "u2", "u3", "u4"].map((key) => (
						<div
							key={key}
							className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white"
						/>
					))}
				</div>
			</div>
		);
	}

	if (error) {
		console.error("Failed to load usage", error);
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				Failed to load usage. Please try again.
			</div>
		);
	}

	if (!data) return null;

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-slate-900">Usage</h1>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{data.stats.map((stat) => (
					<div
						key={stat.label}
						className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
					>
						<p className="text-sm text-slate-500">{stat.label}</p>
						<p className="mt-1 text-2xl font-bold text-slate-900">{stat.value}</p>
					</div>
				))}
			</div>

			<Card>
				<CardHeader title="Daily Cost (One-off vs Scheduled)" />
				{data.chartData.length > 0 ? (
					<ResponsiveContainer width="100%" height={280}>
						<BarChart data={data.chartData}>
							<CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
							<XAxis dataKey="day" tick={{ fontSize: 11 }} />
							<YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v.toFixed(0)}`} />
							<Tooltip
								formatter={(value: number, name: string) => [
									`$${value.toFixed(2)}`,
									name === "oneOff" ? "One-off" : "Scheduled",
								]}
							/>
							<Bar
								dataKey="oneOff"
								stackId="cost"
								fill="#6366f1"
								radius={[0, 0, 0, 0]}
								name="oneOff"
							/>
							<Bar
								dataKey="scheduled"
								stackId="cost"
								fill="#818cf8"
								radius={[4, 4, 0, 0]}
								name="scheduled"
							/>
						</BarChart>
					</ResponsiveContainer>
				) : (
					<EmptyState message="No usage data for this month" />
				)}
			</Card>

			<Card>
				<CardHeader title="Top Threads by Cost" />
				{data.threads.length > 0 ? (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
									<th className="pb-2 pr-4">Thread</th>
									<th className="pb-2 pr-4">Created</th>
									<th className="pb-2 pr-4 text-right">Cost</th>
									<th className="pb-2 text-right">Tokens</th>
								</tr>
							</thead>
							<tbody>
								{data.threads.map((thread, i) => (
									<tr key={`${thread.title}-${i}`} className="border-b border-slate-50">
										<td className="py-2.5 pr-4 text-slate-700">{thread.title}</td>
										<td className="py-2.5 pr-4 text-slate-400">{thread.created}</td>
										<td className="py-2.5 pr-4 text-right text-slate-600">
											{formatCost(thread.cost)}
										</td>
										<td className="py-2.5 text-right font-mono text-xs text-slate-500">
											{formatTokens(thread.inputTokens + thread.outputTokens)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : (
					<EmptyState message="No thread cost data" />
				)}
			</Card>
		</div>
	);
}
