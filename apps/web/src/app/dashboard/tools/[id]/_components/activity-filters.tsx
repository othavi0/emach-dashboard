"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { cn } from "@emach/ui/lib/utils";
import { CheckIcon } from "lucide-react";
import {
	STOCK_MOVEMENT_REASON_SHORT,
	STOCK_MOVEMENT_REASONS,
} from "@/app/dashboard/stock/_components/stock-movement-schema";
import type { PeriodPreset } from "@/app/dashboard/stock/tool-activity-data";

const PERIOD_OPTIONS: Array<{ label: string; value: PeriodPreset }> = [
	{ value: "today", label: "Hoje" },
	{ value: "7d", label: "7 dias" },
	{ value: "30d", label: "30 dias" },
	{ value: "90d", label: "90 dias" },
	{ value: "all", label: "Tudo" },
];

const REASON_OPTIONS = STOCK_MOVEMENT_REASONS.map((r) => ({
	value: r,
	label: STOCK_MOVEMENT_REASON_SHORT[r],
}));

interface Props {
	branches: Array<{ id: string; name: string }>;
	branchId: string | undefined;
	onBranchChange: (id: string | undefined) => void;
	onPeriodChange: (period: PeriodPreset) => void;
	onReasonToggle: (reason: string) => void;
	period: PeriodPreset;
	reasons: string[];
}

export function ActivityFilters({
	branches,
	branchId,
	onBranchChange,
	onPeriodChange,
	onReasonToggle,
	period,
	reasons,
}: Props) {
	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
			<div className="inline-flex rounded-md border border-border bg-background p-0.5">
				{PERIOD_OPTIONS.map((p) => (
					<button
						className={cn(
							"rounded px-2 py-1 text-xs transition",
							period === p.value
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted"
						)}
						key={p.value}
						onClick={() => onPeriodChange(p.value)}
						type="button"
					>
						{p.label}
					</button>
				))}
			</div>

			<Select
				onValueChange={(v) =>
					onBranchChange(!v || v === "_all_" ? undefined : v)
				}
				value={branchId ?? "_all_"}
			>
				<SelectTrigger className="w-[160px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="_all_">Todas filiais</SelectItem>
					{branches.map((b) => (
						<SelectItem key={b.id} value={b.id}>
							{b.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<div className="flex flex-wrap gap-1.5">
				{REASON_OPTIONS.map((r) => {
					const active = reasons.includes(r.value);
					return (
						<button
							className={cn(
								"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs transition",
								active
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
							)}
							key={r.value}
							onClick={() => onReasonToggle(r.value)}
							type="button"
						>
							{active && <CheckIcon className="mr-1 size-3" />}
							{r.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
