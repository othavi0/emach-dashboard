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

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

interface CategoryOption {
	depth: number;
	id: string;
	name: string;
}

interface BranchStockFiltersProps {
	basePath: string;
	categories: CategoryOption[];
}

const SORT_OPTIONS = [
	{ label: "Urgência", value: "urgency" },
	{ label: "Nome A–Z", value: "name" },
	{ label: "Menor estoque", value: "stock-low" },
	{ label: "Maior estoque", value: "stock-high" },
] as const;

const SORT_LABEL: Record<string, string> = Object.fromEntries(
	SORT_OPTIONS.map((o) => [o.value, o.label])
);

type StatusValue = "all" | "critical" | "ok" | "reorder";

const STATUS_OPTIONS: Array<{ label: string; value: StatusValue }> = [
	{ label: "Todos", value: "all" },
	{ label: "Crítico", value: "critical" },
	{ label: "Repor", value: "reorder" },
	{ label: "OK", value: "ok" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
	STATUS_OPTIONS.map((o) => [o.value, o.label])
);

const ALL = "__all__";
const TRACKED = ["search", "status", "sort", "categoryId"] as const;

export function BranchStockFilters({
	basePath,
	categories,
}: BranchStockFiltersProps) {
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath,
		key: "search",
	});
	const currentStatus = (searchParams.get("status") ?? "all") as StatusValue;
	const currentSort = searchParams.get("sort") ?? "urgency";
	const currentCategory = searchParams.get("categoryId") ?? ALL;

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			{/* Busca */}
			<div className="flex min-w-[140px] flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="bs-search">
					Buscar ferramenta
				</label>
				<Input
					id="bs-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nome ou SKU"
					value={search}
				/>
			</div>

			{/* Status */}
			<div className="flex flex-col gap-1 md:w-36">
				<label className="text-muted-foreground text-xs" htmlFor="bs-status">
					Status
				</label>
				<Select
					onValueChange={(v) => setParam("status", v === "all" ? null : v)}
					value={currentStatus}
				>
					<SelectTrigger id="bs-status">
						<SelectValue>
							{(v: string) => STATUS_LABEL[v] ?? "Todos"}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{STATUS_OPTIONS.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{/* Sort */}
			<div className="flex flex-col gap-1 md:w-44">
				<label className="text-muted-foreground text-xs" htmlFor="bs-sort">
					Ordenar por
				</label>
				<Select
					onValueChange={(v) => setParam("sort", v === "urgency" ? null : v)}
					value={currentSort}
				>
					<SelectTrigger id="bs-sort">
						<SelectValue>
							{(v: string) => SORT_LABEL[v] ?? "Urgência"}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{SORT_OPTIONS.map((o) => (
								<SelectItem key={o.value} value={o.value}>
									{o.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			{/* Categoria (oculto se não há categorias) */}
			{categories.length > 0 && (
				<div className="flex flex-col gap-1 md:w-52">
					<label
						className="text-muted-foreground text-xs"
						htmlFor="bs-category"
					>
						Categoria
					</label>
					<Select
						onValueChange={(v) => setParam("categoryId", v === ALL ? null : v)}
						value={currentCategory}
					>
						<SelectTrigger id="bs-category">
							<SelectValue>
								{(v: string) => {
									if (v === ALL) {
										return "Todas";
									}
									return categories.find((c) => c.id === v)?.name ?? "Todas";
								}}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value={ALL}>Todas</SelectItem>
								{categories.map((c) => (
									<SelectItem key={c.id} value={c.id}>
										{"— ".repeat(c.depth)}
										{c.name}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}
		</FiltersBar>
	);
}
