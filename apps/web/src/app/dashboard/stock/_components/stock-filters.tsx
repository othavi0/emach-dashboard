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
	path: string;
}

interface StockFiltersProps {
	categories: CategoryOption[];
}

const SORT_OPTIONS = [
	{ label: "Urgência", value: "urgencia" },
	{ label: "Mais nova", value: "mais-nova" },
	{ label: "Nome (A–Z)", value: "nome" },
	{ label: "Maior estoque", value: "maior" },
	{ label: "Menor estoque", value: "menor" },
] as const;

const SORT_LABEL: Record<string, string> = Object.fromEntries(
	SORT_OPTIONS.map((o) => [o.value, o.label])
);

const ALL = "__all__";
const TRACKED = ["search", "q", "categoryId", "ordem"] as const;
const BASE = "/dashboard/stock";

export function StockFilters({ categories }: StockFiltersProps) {
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});
	const currentCategory = searchParams.get("categoryId") ?? ALL;
	const currentOrdem = searchParams.get("ordem") ?? "urgencia";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="stock-q">
					Buscar ferramenta
				</label>
				<Input
					id="stock-q"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nome da ferramenta"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-56">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="stock-category"
				>
					Categoria
				</label>
				<Select
					onValueChange={(v) => setParam("categoryId", v === ALL ? null : v)}
					value={currentCategory}
				>
					<SelectTrigger id="stock-category">
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

			<div className="flex flex-col gap-1 md:w-48">
				<label className="text-muted-foreground text-xs" htmlFor="stock-ordem">
					Ordenar por
				</label>
				<Select
					onValueChange={(v) => setParam("ordem", v === "urgencia" ? null : v)}
					value={currentOrdem}
				>
					<SelectTrigger id="stock-ordem">
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
		</FiltersBar>
	);
}
