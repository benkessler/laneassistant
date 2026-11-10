import { useQuery } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Card, CardHeader } from "../components/ui/card";
import { EmptyState } from "../components/ui/empty-state";
import { getTasks } from "../lib/api";

export function TasksPage() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["tasks"],
		queryFn: getTasks,
	});

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
				<div className="space-y-3">
					{["t1", "t2", "t3"].map((key) => (
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
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				Failed to load tasks: {(error as Error).message}
			</div>
		);
	}

	const tasks = data?.tasks ?? [];

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-slate-900">Scheduled Tasks</h1>

			{tasks.length === 0 ? (
				<Card>
					<EmptyState message="No scheduled tasks configured" />
				</Card>
			) : (
				<Card>
					<CardHeader title={`Tasks (${tasks.length})`} />
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
									<th className="pb-2 pr-4">Name</th>
									<th className="pb-2 pr-4">Schedule</th>
									<th className="pb-2 pr-4">Type</th>
									<th className="pb-2 pr-4">Status</th>
									<th className="pb-2">Created</th>
								</tr>
							</thead>
							<tbody>
								{tasks.map((task) => (
									<tr key={task.id} className="border-b border-slate-50">
										<td className="py-2.5 pr-4">
											<p className="font-medium text-slate-700">{task.name}</p>
											{task.description && (
												<p className="mt-0.5 text-xs text-slate-400">{task.description}</p>
											)}
										</td>
										<td className="py-2.5 pr-4 font-mono text-xs text-slate-600">
											{task.schedule}
										</td>
										<td className="py-2.5 pr-4">
											<Badge className="bg-slate-100 text-slate-600">{task.type}</Badge>
										</td>
										<td className="py-2.5 pr-4">
											<Badge
												className={
													task.enabled
														? "bg-emerald-100 text-emerald-800"
														: "bg-slate-100 text-slate-500"
												}
											>
												{task.enabled ? "Enabled" : "Disabled"}
											</Badge>
										</td>
										<td className="py-2.5 text-xs text-slate-400">{task.createdAgo}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</Card>
			)}
		</div>
	);
}
