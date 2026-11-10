import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Card, CardHeader } from "../components/ui/card";
import { getSpaceDetail } from "../lib/api";

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

function deployStatusColor(status: string): string {
	switch (status) {
		case "SUCCESS":
			return "bg-green-100 text-green-700";
		case "PENDING":
		case "BUILDING":
		case "DEPLOYING":
			return "bg-yellow-100 text-yellow-700";
		case "FAILED":
			return "bg-red-100 text-red-700";
		default:
			return "bg-slate-100 text-slate-600";
	}
}

function MetaItem({
	label,
	value,
	href,
}: {
	label: string;
	value: string;
	href?: string;
}) {
	return (
		<div className="rounded-lg border border-slate-200 bg-white p-3">
			<p className="text-xs text-slate-500">{label}</p>
			{href ? (
				<a
					href={href}
					target="_blank"
					rel="noopener noreferrer"
					className="mt-0.5 block truncate text-sm font-medium text-blue-600 hover:underline"
				>
					{value}
				</a>
			) : (
				<p className="mt-0.5 text-sm font-medium text-slate-900">{value}</p>
			)}
		</div>
	);
}

export function SpaceDetailPage() {
	const { name } = useParams<{ name: string }>();
	const {
		data: space,
		isLoading,
		error,
	} = useQuery({
		queryKey: ["space", name],
		queryFn: () => getSpaceDetail(name as string),
		enabled: !!name,
	});

	if (isLoading) {
		return (
			<div className="space-y-4">
				<div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
				<div className="h-40 animate-pulse rounded-xl border border-slate-200 bg-white" />
			</div>
		);
	}

	if (error || !space) {
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				{error ? "Failed to load space details." : "Space not found"}
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<Link
					to="/spaces"
					aria-label="Back to spaces"
					className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
				>
					<ArrowLeft className="h-5 w-5" />
				</Link>
				<h1 className="text-2xl font-bold text-slate-900">{space.name}</h1>
				<Badge className={spaceStatusColor(space.status)}>{space.status}</Badge>
			</div>

			{space.description && <p className="text-sm text-slate-600">{space.description}</p>}

			<div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
				{space.domain && (
					<MetaItem label="Domain" value={space.domain} href={`https://${space.domain}`} />
				)}
				{space.previewUrl && (
					<MetaItem label="Preview URL" value={space.previewUrl} href={space.previewUrl} />
				)}
				{space.productionUrl && (
					<MetaItem label="Production URL" value={space.productionUrl} href={space.productionUrl} />
				)}
				{space.convexUrlDev && (
					<MetaItem label="Convex Dev URL" value={space.convexUrlDev} href={space.convexUrlDev} />
				)}
				{space.convexUrlProd && (
					<MetaItem
						label="Convex Prod URL"
						value={space.convexUrlProd}
						href={space.convexUrlProd}
					/>
				)}
				<MetaItem label="Created" value={format(new Date(space.createdAt), "MMM d, yyyy HH:mm")} />
				{space.lastDeployedAt && (
					<MetaItem
						label="Last Deployed"
						value={format(new Date(space.lastDeployedAt), "MMM d, yyyy HH:mm")}
					/>
				)}
			</div>

			<Card>
				<CardHeader title={`Deployments (${space.deployments.length})`} />
				{space.deployments.length === 0 ? (
					<p className="text-sm text-slate-400">No deployments yet</p>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
									<th className="px-4 py-2">Environment</th>
									<th className="px-3 py-2">Status</th>
									<th className="px-3 py-2">Version</th>
									<th className="px-3 py-2">URL</th>
									<th className="px-3 py-2">Commit</th>
									<th className="px-3 py-2 text-right">Duration</th>
									<th className="px-3 py-2 text-right">Created</th>
								</tr>
							</thead>
							<tbody>
								{space.deployments.map((d) => (
									<tr key={d.id} className="border-b border-slate-50 last:border-0">
										<td className="px-4 py-2 text-slate-700">{d.environment}</td>
										<td className="px-3 py-2">
											<Badge className={deployStatusColor(d.status)}>{d.status}</Badge>
										</td>
										<td className="px-3 py-2 text-slate-600">v{d.version}</td>
										<td className="px-3 py-2">
											{d.url ? (
												<a
													href={d.url}
													target="_blank"
													rel="noopener noreferrer"
													className="text-blue-600 hover:underline"
												>
													{d.url}
												</a>
											) : (
												<span className="text-slate-400">-</span>
											)}
										</td>
										<td className="max-w-xs truncate px-3 py-2 text-slate-600">
											{d.commitMessage ?? "-"}
										</td>
										<td className="px-3 py-2 text-right text-slate-400">
											{d.durationMs != null ? `${(d.durationMs / 1000).toFixed(1)}s` : "-"}
										</td>
										<td className="px-3 py-2 text-right text-slate-400">
											{format(new Date(d.createdAt), "MMM d, HH:mm")}
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
