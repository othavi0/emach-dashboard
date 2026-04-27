"use client";

import { Input } from "@emach/ui/components/input";

import { FiltersBar } from "@/components/filters-bar";
import { useDebouncedParam, useFilterState } from "@/lib/use-filter-state";

const BASE = "/dashboard/suppliers";
const TRACKED = ["search"] as const;

interface SuppliersFilterProps {
	initialSearch?: string;
}

export function SuppliersFilter(_props: SuppliersFilterProps) {
	const { clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1 md:max-w-md">
				<label
					className="text-muted-foreground text-xs"
					htmlFor="supplier-search"
				>
					Buscar por nome, e-mail ou telefone
				</label>
				<Input
					id="supplier-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Ex: Bosch, contato@email.com"
					value={search}
				/>
			</div>
		</FiltersBar>
	);
}
