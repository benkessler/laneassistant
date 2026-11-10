import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { getSpaces } from "../lib/api";

function spaceStatusColor(status: string): string {
	switch (status) {
		case "ACTIVE":
			return "bg-green-100 text-green-700";
		case "INITIALIZING":
		case "DEPLOYING":
			return "bg-yellow-100 text-yellow-700";
		case "FAILED":
			return "bg-red-100 text-red-700";
		case "READY":
			return "bg-blue-100 text-blue-700";
		case "DELETED":
			return "bg-slate-100 text-slate-500";
		default:
			return "bg-slate-100 text-slate-600";
	}
}

export function SpacesPage() {
	const navigate = useNavigate();

	const { data, isLoading, error } = useQuery({
		queryKey: ["spaces"],
		queryFn: getSpaces,
	});

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-bold text-slate-900">Spaces</h1>

			{error && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
					Failed to load spaces. Please try again.
				</div>
			)}

			<div className="rounded-xl border border-slate-200 bg-white shadow-sm">
				{isLoading ? (
					<div className="space-y-3 p-5">
						{["s1", "s2", "s3"].map((key) => (
							<div key={key} className="h-10 animate-pulse rounded bg-slate-100" />
						))}
					</div>
				) : !data || data.spaces.length === 0 ? (
					<EmptyState message="No spaces have been created yet" />
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
									<th className="px-5 py-3">Name</th>
									<th className="px-3 py-3">Status</th>
									<th className="px-3 py-3">Domain</th>
									<th className="px-3 py-3 text-right">Last Deployed</th>
									<th className="px-3 py-3 text-right">Created</th>
								</tr>
							</thead>
							<tbody>
								{data.spaces.map((space) => (
									<tr
										key={space.id}
										tabIndex={0}
										aria-label={`View space ${space.name}`}
										className="cursor-pointer border-b border-slate-50 transition-colors hover:bg-slate-50"
										onClick={() => navigate(`/spaces/${space.name}`)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												navigate(`/spaces/${space.name}`);
											}
										}}
									>
										<td className="px-5 py-3 font-medium text-slate-900">{space.name}</td>
										<td className="px-3 py-3">
											<Badge className={spaceStatusColor(space.status)}>{space.status}</Badge>
										</td>
										<td className="px-3 py-3 text-slate-600">{space.domain ?? "-"}</td>
										<td className="px-3 py-3 text-right text-slate-400">
											{space.lastDeployedAt
												? format(new Date(space.lastDeployedAt), "MMM d, HH:mm")
												: "-"}
										</td>
										<td className="px-3 py-3 text-right text-slate-400">
											{format(new Date(space.createdAt), "MMM d, HH:mm")}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	);
}
