"use client";

import { Badge } from "@emach/ui/components/badge";

import type { PromotionStatus } from "../actions";
import { statusLabel } from "./_lib/format";

interface PromotionStatusBadgeProps {
	status: PromotionStatus;
}

export function PromotionStatusBadge({ status }: PromotionStatusBadgeProps) {
	switch (status) {
		case "active":
			return (
				<Badge className="w-fit" variant="success">
					{statusLabel(status)}
				</Badge>
			);
		case "scheduled":
			return (
				<Badge className="w-fit" variant="info">
					{statusLabel(status)}
				</Badge>
			);
		case "expired":
			return (
				<Badge className="w-fit" variant="secondary">
					{statusLabel(status)}
				</Badge>
			);
		default:
			return (
				<Badge className="w-fit" variant="outline">
					{statusLabel(status)}
				</Badge>
			);
	}
}
