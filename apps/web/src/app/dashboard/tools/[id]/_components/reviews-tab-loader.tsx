"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { ToolReviewSummary } from "../_lib/reviews-data";
import { fetchToolReviewsAction } from "../_lib/tab-actions";
import { ToolReviewsSection } from "./tool-reviews-section";

export function ReviewsTabLoader({ toolId }: { toolId: string }) {
	return (
		<LazyTab load={() => fetchToolReviewsAction(toolId)}>
			{(summary: ToolReviewSummary) => (
				<ToolReviewsSection summary={summary} toolId={toolId} />
			)}
		</LazyTab>
	);
}
