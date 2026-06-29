"use client";

import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Button } from "@emach/ui/components/button";
import { useEffect, useState } from "react";
import type { ActiveBranchOption } from "@/app/dashboard/branches/data";
import type { ToolActivityRow } from "@/app/dashboard/stock/tool-activity-data";
import { fetchToolActivityInitAction } from "../_lib/tab-actions";
import { ActivityTabClient } from "./activity-tab-client";

interface InitData {
	branches: ActiveBranchOption[];
	items: ToolActivityRow[];
	nextCursor: string | null;
}

export function ActivityTabLoader({ toolId }: { toolId: string }) {
	const [data, setData] = useState<InitData | null>(null);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let active = true;
		setData(null);
		setError(false);
		fetchToolActivityInitAction(toolId)
			.then((result) => {
				if (active) {
					setData(result);
				}
			})
			.catch(() => {
				if (active) {
					setError(true);
				}
			});
		return () => {
			active = false;
		};
	}, [toolId, attempt]);

	if (error) {
		return (
			<Alert variant="destructive">
				<AlertDescription className="flex items-center justify-between gap-3">
					<span>Não foi possível carregar.</span>
					<Button
						onClick={() => setAttempt((a) => a + 1)}
						size="sm"
						variant="outline"
					>
						Tentar novamente
					</Button>
				</AlertDescription>
			</Alert>
		);
	}

	if (!data) {
		return (
			<div
				aria-busy="true"
				className="h-32 animate-pulse rounded-md bg-muted"
			/>
		);
	}
	return (
		<ActivityTabClient
			branches={data.branches}
			initialCursor={data.nextCursor}
			initialItems={data.items}
			toolId={toolId}
		/>
	);
}
