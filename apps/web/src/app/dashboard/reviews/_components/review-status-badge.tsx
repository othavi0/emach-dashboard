import { Badge } from "@emach/ui/components/badge";

import { REVIEW_STATUS_LABELS, type ReviewStatus } from "../data";

const STATUS_VARIANTS: Record<
	ReviewStatus,
	"default" | "destructive" | "outline" | "secondary"
> = {
	pending: "outline",
	approved: "default",
	rejected: "secondary",
	spam: "destructive",
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
	return (
		<Badge variant={STATUS_VARIANTS[status]}>
			{REVIEW_STATUS_LABELS[status]}
		</Badge>
	);
}
