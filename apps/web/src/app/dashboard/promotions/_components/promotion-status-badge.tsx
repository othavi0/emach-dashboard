"use client";

import { Badge } from "@emach/ui/components/badge";
import { CalendarX, CheckCircle2, Clock, PauseCircle } from "lucide-react";

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
					<CheckCircle2 aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
		case "scheduled":
			return (
				<Badge className="w-fit" variant="info">
					<Clock aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
		case "expired":
			return (
				<Badge className="w-fit" variant="secondary">
					<CalendarX aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
		default:
			return (
				<Badge className="w-fit" variant="outline">
					<PauseCircle aria-hidden className="mr-1 size-3" />
					{statusLabel(status)}
				</Badge>
			);
	}
}
