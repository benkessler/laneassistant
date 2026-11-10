import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader } from "../components/ui/card";
import { getSettings, updateModel } from "../lib/api";

const MODELS = [
	{ id: "claude-opus-4-6", label: "Claude Opus 4.6" },
	{ id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
	{ id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

export function SettingsPage() {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({
		queryKey: ["settings"],
		queryFn: getSettings,
	});

	const [selectedModel, setSelectedModel] = useState<string | null>(null);

	const mutation = useMutation({
		mutationFn: (model: string) => updateModel(model),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
		onError: () => setSelectedModel(null),
	});

	const currentModel = selectedModel ?? data?.defaultModel ?? "";

	if (isLoading) {
		return (
			<div className="space-y-6">
				<div className="h-8 w-32 animate-pulse rounded bg-slate-200" />
				<div className="h-48 animate-pulse rounded-xl border border-slate-200 bg-white" />
			</div>
		);
	}

	if (error) {
		console.error("Failed to load settings", error);
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
				Failed to load settings. Please try again.
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold text-slate-900">Settings</h1>
				<Link
					to="/settings/team"
					className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
				>
					Team Members
				</Link>
			</div>

			<Card>
				<CardHeader title="Default Model" />
				<div className="space-y-3">
					{MODELS.map((m) => (
						<label
							key={m.id}
							className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
						>
							<input
								type="radio"
								name="model"
								value={m.id}
								checked={currentModel === m.id}
								onChange={() => {
									setSelectedModel(m.id);
									mutation.mutate(m.id);
								}}
								className="text-primary-600 focus:ring-primary-500"
							/>
							<div>
								<p className="text-sm font-medium text-slate-800">{m.label}</p>
								<p className="font-mono text-xs text-slate-400">{m.id}</p>
							</div>
						</label>
					))}
				</div>
				{mutation.isSuccess && (
					<p className="mt-3 text-sm text-emerald-600">Model updated successfully.</p>
				)}
			</Card>
		</div>
	);
}
