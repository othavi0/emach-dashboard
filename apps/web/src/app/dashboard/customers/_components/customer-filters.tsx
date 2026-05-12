"use client";

import { Input } from "@emach/ui/components/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@emach/ui/components/select";
import { Toggle } from "@emach/ui/components/toggle";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";
import type { CustomersListFilters } from "../schema";
import { SORT_OPTIONS } from "../schema";

interface CustomerFiltersProps {
	filters: CustomersListFilters;
}

const BASE = "/dashboard/customers";
const TRACKED = [
	"q",
	"status",
	"clientType",
	"createdFrom",
	"createdTo",
	"lastOrderFrom",
	"lastOrderTo",
	"ltvMin",
	"ltvMax",
	"sort",
] as const;

const SORT_LABELS: Record<(typeof SORT_OPTIONS)[number], string> = {
	createdDesc: "Cadastro (mais recente)",
	ltvDesc: "LTV (maior)",
	lastOrderDesc: "Último pedido",
	nameAsc: "Nome (A–Z)",
};

const STATUS_LABELS: Record<string, string> = {
	all: "Todos os status",
	active: "Ativo",
	inactive: "Inativo",
	blocked: "Bloqueado",
};

export function CustomerFilters({ filters }: CustomerFiltersProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const { setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [q, setQ] = useDebouncedParam({ basePath: BASE, key: "q" });
	const [ltvMin, setLtvMin] = useDebouncedParam({
		basePath: BASE,
		key: "ltvMin",
	});
	const [ltvMax, setLtvMax] = useDebouncedParam({
		basePath: BASE,
		key: "ltvMax",
	});

	const currentStatus = searchParams.get("status") ?? "all";
	const currentType = searchParams.get("clientType") ?? "";
	const currentSort =
		(searchParams.get("sort") as (typeof SORT_OPTIONS)[number]) ??
		"createdDesc";

	const setMultiParam = useCallback(
		(key: string, values: string[]) => {
			const next = new URLSearchParams(searchParams.toString());
			if (values.length > 0) {
				next.set(key, values.join(","));
			} else {
				next.delete(key);
			}
			router.replace(
				values.length || next.toString() ? `${BASE}?${next.toString()}` : BASE
			);
		},
		[router, searchParams]
	);

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="customers-q">
					Buscar cliente
				</label>
				<Input
					id="customers-q"
					onChange={(e) => setQ(e.target.value)}
					placeholder="Nome, email ou documento"
					value={q}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="customers-status"
				>
					Status
				</label>
				<Select
					onValueChange={(v) => setParam("status", v === "all" ? null : v)}
					value={currentStatus}
				>
					<SelectTrigger id="customers-status">
						<SelectValue>
							{(v: string) => STATUS_LABELS[v] ?? STATUS_LABELS.all}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="all">Todos os status</SelectItem>
							<SelectItem value="active">Ativo</SelectItem>
							<SelectItem value="inactive">Inativo</SelectItem>
							<SelectItem value="blocked">Bloqueado</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1">
				<span className="text-muted-foreground text-xs">Tipo</span>
				<div className="flex flex-row items-center gap-1">
					{(["b2c", "b2b"] as const).map((t) => {
						const selected = (
							currentType ? currentType.split(",").filter(Boolean) : []
						).includes(t);
						const labels: Record<string, string> = { b2c: "B2C", b2b: "B2B" };
						return (
							<Toggle
								aria-label={t === "b2c" ? "Pessoa Física" : "Pessoa Jurídica"}
								key={t}
								onPressedChange={(pressed) => {
									const current = currentType
										? currentType.split(",").filter(Boolean)
										: [];
									setMultiParam(
										"clientType",
										pressed ? [...current, t] : current.filter((v) => v !== t)
									);
								}}
								pressed={selected}
								size="sm"
								variant="outline"
							>
								{labels[t]}
							</Toggle>
						);
					})}
				</div>
			</div>

			<div className="flex flex-col gap-1 md:w-36">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="customers-created-from"
				>
					Cadastro de
				</label>
				<Input
					defaultValue={filters.createdFrom ?? ""}
					id="customers-created-from"
					onChange={(e) => setParam("createdFrom", e.target.value || null)}
					type="date"
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-36">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="customers-created-to"
				>
					Cadastro até
				</label>
				<Input
					defaultValue={filters.createdTo ?? ""}
					id="customers-created-to"
					onChange={(e) => setParam("createdTo", e.target.value || null)}
					type="date"
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-28">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="customers-ltv-min"
				>
					LTV mín
				</label>
				<Input
					id="customers-ltv-min"
					min={0}
					onChange={(e) => setLtvMin(e.target.value)}
					placeholder="0"
					step={10}
					type="number"
					value={ltvMin}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-28">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="customers-ltv-max"
				>
					LTV máx
				</label>
				<Input
					id="customers-ltv-max"
					min={0}
					onChange={(e) => setLtvMax(e.target.value)}
					placeholder="Sem limite"
					step={10}
					type="number"
					value={ltvMax}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-52">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="customers-sort"
				>
					Ordenar por
				</label>
				<Select
					onValueChange={(v) =>
						setParam("sort", v === "createdDesc" ? null : v)
					}
					value={currentSort}
				>
					<SelectTrigger id="customers-sort">
						<SelectValue>
							{(v: string) =>
								SORT_LABELS[v as (typeof SORT_OPTIONS)[number]] ??
								SORT_LABELS.createdDesc
							}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{SORT_OPTIONS.map((opt) => (
								<SelectItem key={opt} value={opt}>
									{SORT_LABELS[opt]}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</FiltersBar>
	);
}
