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

const BASE = "/dashboard/branches";
const TRACKED = ["search", "sort"] as const;

export function BranchesFilters() {
	const { setParam, clearAll, hasActive, searchParams } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});

	const currentSort = searchParams.get("sort") ?? "newest";

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="branches-search"
				>
					Buscar filial
				</label>
				<Input
					id="branches-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Nome da filial"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-44">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="branches-sort"
				>
					Ordenar por
				</label>
				<Select
					onValueChange={(v) => setParam("sort", v === "newest" ? null : v)}
					value={currentSort}
				>
					<SelectTrigger id="branches-sort">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value="newest">Mais recentes</SelectItem>
							<SelectItem value="name">Nome (A-Z)</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</FiltersBar>
	);
}
