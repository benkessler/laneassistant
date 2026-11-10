import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { StatCard } from "../components/ui/stat-card";
import { getTeam } from "../lib/api";

export function TeamPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["team"],
		queryFn: getTeam,
	});

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
				<div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
			</div>
		);
	}

	if (error) {
		console.error("Failed to load team", error);
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				Failed to load team. Please try again.
			</div>
		);
	}

	if (!data) return null;

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					to="/settings"
					aria-label="Back to settings"
					className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<h1 className="text-2xl font-bold text-slate-900">Team</h1>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<StatCard label="Team" value={data.teamName} icon={Users} color="primary" />
				<StatCard
					label="Members"
					value={String(data.seatCount)}
					subValue="seats"
					icon={Users}
					color="emerald"
				/>
			</div>

			<Card>
				<CardHeader title={`Members (${data.members.length})`} />
				{data.members.length === 0 ? (
					<EmptyState message="No members found" />
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
									<th className="pb-2 pr-4">Name</th>
									<th className="pb-2 pr-4">Slack ID</th>
									<th className="pb-2">Initials</th>
								</tr>
							</thead>
							<tbody>
								{data.members.map((m) => (
									<tr key={m.id} className="border-b border-slate-50">
										<td className="py-2.5 pr-4 text-slate-700">{m.displayName}</td>
										<td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
											{m.slackUserId}
										</td>
										<td className="py-2.5">
											<span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-100 text-xs font-medium text-primary-700">
												{m.initials}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</Card>
		</div>
	);
}
