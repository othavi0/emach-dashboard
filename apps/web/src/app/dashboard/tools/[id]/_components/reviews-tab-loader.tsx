"use client";

import { useEffect, useState } from "react";
import type { ToolReviewSummary } from "../_lib/reviews-data";
import { fetchToolReviewsAction } from "../_lib/tab-actions";
import { ToolReviewsSection } from "./tool-reviews-section";

export function ReviewsTabLoader({ toolId }: { toolId: string }) {
	const [summary, setSummary] = useState<ToolReviewSummary | null>(null);

	useEffect(() => {
		let active = true;
		fetchToolReviewsAction(toolId).then((data) => {
			if (active) {
				setSummary(data);
			}
		});
		return () => {
			active = false;
		};
	}, [toolId]);

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
