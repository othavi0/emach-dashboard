"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { cn } from "@emach/ui/lib/utils";
import { BoxIcon, CheckIcon, PackageIcon, UserCogIcon } from "lucide-react";

import type {
	BranchActivityKind,
	BranchActivityPeriod,
} from "../activity-data";

const PERIOD_OPTIONS: Array<{ label: string; value: BranchActivityPeriod }> = [
	{ value: "today", label: "Hoje" },
	{ value: "7d", label: "7 dias" },
	{ value: "30d", label: "30 dias" },
	{ value: "90d", label: "90 dias" },
	{ value: "all", label: "Tudo" },
];

const KIND_OPTIONS: Array<{
	icon: typeof BoxIcon;
	label: string;
	value: BranchActivityKind;
}> = [
	{ value: "stock", label: "Estoque", icon: BoxIcon },
	{ value: "order", label: "Pedidos", icon: PackageIcon },
	{ value: "user", label: "Equipe", icon: UserCogIcon },
];

interface Props {
	kinds: BranchActivityKind[];
	onKindToggle: (kind: BranchActivityKind) => void;
	onPeriodChange: (period: BranchActivityPeriod) => void;
	onToolChange: (id: string | undefined) => void;
	period: BranchActivityPeriod;
	toolId: string | undefined;
	tools: Array<{ id: string; name: string }>;
}

export function BranchActivityFilters({
	kinds,
	onKindToggle,
	onPeriodChange,
	onToolChange,
	period,
	toolId,
	tools,
}: Props) {
	const showToolFilter = kinds.includes("stock") && tools.length > 0;

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

			<div className="flex flex-wrap gap-1.5">
				{KIND_OPTIONS.map((k) => {
					const active = kinds.includes(k.value);
					const Icon = active ? CheckIcon : k.icon;
					return (
						<button
							className={cn(
								"inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs transition",
								active
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
							)}
							key={k.value}
							onClick={() => onKindToggle(k.value)}
							type="button"
						>
							<Icon className="size-3" />
							{k.label}
						</button>
					);
				})}
			</div>

			{showToolFilter ? (
				<Select
					onValueChange={(v) =>
						onToolChange(!v || v === "_all_" ? undefined : v)
					}
					value={toolId ?? "_all_"}
				>
					<SelectTrigger className="ml-auto w-[200px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="_all_">Todas as ferramentas</SelectItem>
						{tools.map((t) => (
							<SelectItem key={t.id} value={t.id}>
								{t.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			) : null}
		</div>
	);
}
