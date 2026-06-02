export type { ReviewStatus } from "@emach/db/schema/reviews";

import type { ReviewStatus } from "@emach/db/schema/reviews";

export const REVIEW_TABS = [
	{ key: "pending", label: "Pendentes", status: "pending" },
	{ key: "approved", label: "Aprovadas", status: "approved" },
	{ key: "rejected", label: "Rejeitadas", status: "rejected" },
	{ key: "spam", label: "Spam", status: "spam" },
] as const satisfies readonly {
	key: string;
	label: string;
	status: ReviewStatus;
}[];

export type ReviewTabKey = (typeof REVIEW_TABS)[number]["key"];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
	pending: "Pendente",
	approved: "Aprovada",
	rejected: "Rejeitada",
	spam: "Spam",
};
