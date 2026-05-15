import { Badge } from "@emach/ui/components/badge";
import { BanIcon, CheckIcon, ClockIcon, XCircleIcon } from "lucide-react";

import { REVIEW_STATUS_LABELS, type ReviewStatus } from "../status-meta";

const STATUS_VARIANTS: Record<
	ReviewStatus,
	"destructive" | "secondary" | "success" | "warning"
> = {
	pending: "warning",
	approved: "success",
	rejected: "destructive",
	spam: "secondary",
};

const STATUS_ICONS: Record<ReviewStatus, typeof ClockIcon> = {
	pending: ClockIcon,
	approved: CheckIcon,
	rejected: XCircleIcon,
	spam: BanIcon,
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
	const Icon = STATUS_ICONS[status];
	return (
		<Badge variant={STATUS_VARIANTS[status]}>
			<Icon aria-hidden="true" />
			{REVIEW_STATUS_LABELS[status]}
		</Badge>
	);
}
