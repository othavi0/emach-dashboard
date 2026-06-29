"use client";

import { Alert, AlertDescription } from "@emach/ui/components/alert";
import { Button } from "@emach/ui/components/button";
import { useEffect, useState } from "react";
import type { ToolReviewSummary } from "../_lib/reviews-data";
import { fetchToolReviewsAction } from "../_lib/tab-actions";
import { ToolReviewsSection } from "./tool-reviews-section";

export function ReviewsTabLoader({ toolId }: { toolId: string }) {
	const [summary, setSummary] = useState<ToolReviewSummary | null>(null);
	const [error, setError] = useState(false);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let active = true;
		setSummary(null);
		setError(false);
		fetchToolReviewsAction(toolId)
			.then((data) => {
				if (active) {
					setSummary(data);
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

	if (!summary) {
		return (
			<div
				aria-busy="true"
				className="h-32 animate-pulse rounded-md bg-muted"
			/>
		);
	}
	return <ToolReviewsSection summary={summary} toolId={toolId} />;
}
