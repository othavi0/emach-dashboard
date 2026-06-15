"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { cn } from "@emach/ui/lib/utils";
import { CheckIcon, XIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import type { ActiveSupplierOption } from "@/lib/suppliers";

import type { LedgerFilters, PeriodPreset } from "../../movements-data";

const PERIOD_OPTIONS: Array<{ label: string; value: PeriodPreset }> = [
	{ value: "today", label: "Hoje" },
	{ value: "7d", label: "7 dias" },
	{ value: "30d", label: "30 dias" },
	{ value: "90d", label: "90 dias" },
	{ value: "all", label: "Tudo" },
];

const REASON_OPTIONS: Array<{ label: string; value: string }> = [
	{ value: "entrada_compra", label: "Entrada" },
	{ value: "saida_venda", label: "Saída" },
	{ value: "ajuste_inventario", label: "Ajuste" },
	{ value: "perda", label: "Perda" },
	{ value: "outro", label: "Outro" },
];

interface LedgerFiltersProps {
	branches: Array<{ id: string; name: string }>;
	filters: LedgerFilters;
	suppliers: ActiveSupplierOption[];
}

export function LedgerFiltersBar({
	branches,
	filters,
	suppliers,
}: LedgerFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();

	const push = useCallback(
		(updates: Record<string, string | undefined>) => {
			const params = new URLSearchParams(searchParams.toString());
			for (const [key, value] of Object.entries(updates)) {
				if (value === undefined || value === "") {
					params.delete(key);
				} else {
					params.set(key, value);
				}
			}
			router.push(`?${params.toString()}`);
		},
		[router, searchParams]
	);

	const handlePeriodChange = (period: PeriodPreset) => {
		// 7d é o default (sem query param); os demais viram ?period=.
		push({ period: period === "7d" ? undefined : period });
	};

	const handleBranchChange = (value: string | null) => {
		push({ branchId: !value || value === "_all_" ? undefined : value });
	};

	const handleSupplierChange = (value: string | null) => {
		push({ supplierId: !value || value === "_all_" ? undefined : value });
	};

	const handleReasonToggle = (reason: string) => {
		const current: string[] = filters.reasons ?? [];
		const next = current.includes(reason)
			? current.filter((r: string) => r !== reason)
			: [...current, reason];
		push({ reason: next.length > 0 ? next.join(",") : undefined });
	};

	const hasActiveFilters =
		filters.branchId ||
		filters.supplierId ||
		(filters.reasons && filters.reasons.length > 0) ||
		filters.period !== "7d";

	const clearFilters = () => {
		router.push("?");
	};

	return (
		<div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
			<div className="inline-flex rounded-md border border-border bg-background p-0.5">
				{PERIOD_OPTIONS.map((p) => (
					<button
						className={cn(
							"rounded px-2 py-1 text-xs transition",
							filters.period === p.value
								? "bg-primary text-primary-foreground"
								: "text-muted-foreground hover:bg-muted"
						)}
						key={p.value}
						onClick={() => handlePeriodChange(p.value)}
						type="button"
					>
						{p.label}
					</button>
				))}
			</div>

			<Select
				onValueChange={handleBranchChange}
				value={filters.branchId ?? "_all_"}
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

			<Select
				onValueChange={handleSupplierChange}
				value={filters.supplierId ?? "_all_"}
			>
				<SelectTrigger className="w-[180px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="_all_">Todos fornecedores</SelectItem>
					{suppliers.map((s) => (
						<SelectItem key={s.id} value={s.id}>
							{s.name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			<div className="flex flex-wrap gap-1.5">
				{REASON_OPTIONS.map((r) => {
					const active = (filters.reasons ?? []).includes(r.value);
					return (
						<button
							className={cn(
								"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs transition",
								active
									? "border-primary bg-primary/10 text-primary"
									: "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
							)}
							key={r.value}
							onClick={() => handleReasonToggle(r.value)}
							type="button"
						>
							{active && <CheckIcon className="mr-1 size-3" />}
							{r.label}
						</button>
					);
				})}
			</div>

			{hasActiveFilters ? (
				<button
					className="ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-muted-foreground text-xs transition hover:bg-muted"
					onClick={clearFilters}
					type="button"
				>
					<XIcon className="size-3" />
					Limpar filtros
				</button>
			) : null}
		</div>
	);
}
