"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";

import { FiltersBar } from "@/components/filters-bar";
import { useFilterState } from "@/lib/use-filter-state";

const STATUS_OPTIONS = [
	{ value: "pending", label: "Pendentes" },
	{ value: "approved", label: "Aprovadas" },
	{ value: "rejected", label: "Rejeitadas" },
	{ value: "spam", label: "Spam" },
] as const;

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
	STATUS_OPTIONS.map((o) => [o.value, o.label])
);

const TRACKED = ["status"] as const;

export function ReviewsFilters() {
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: "/dashboard/reviews",
		trackedKeys: TRACKED,
	});
	const currentStatus = searchParams.get("status") ?? "pending";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-col gap-1 md:w-56">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="reviews-status"
				>
					Status
				</label>
				<Select
					onValueChange={(v) => setParam("status", v)}
					value={currentStatus}
				>
					<SelectTrigger id="reviews-status">
						<SelectValue>
							{(v: string) => STATUS_LABEL[v] ?? "Pendentes"}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{STATUS_OPTIONS.map((o) => (
							<SelectItem key={o.value} value={o.value}>
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>
		</FiltersBar>
	);
}
