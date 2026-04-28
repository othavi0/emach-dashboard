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

const ALL = "all";
const BASE = "/dashboard/promotions";
const TRACKED = ["search", "type"] as const;

interface PromotionsFiltersProps {
	initialSearch?: string;
	initialType?: string;
}

export function PromotionsFilters(_props: PromotionsFiltersProps) {
	const { searchParams, setParam, clearAll, hasActive } = useFilterState({
		basePath: BASE,
		trackedKeys: TRACKED,
	});
	const [search, setSearch] = useDebouncedParam({
		basePath: BASE,
		key: "search",
	});
	const currentType = searchParams.get("type") ?? ALL;

	return (
		<FiltersBar hasActive={hasActive} onClear={clearAll}>
			<div className="flex flex-1 flex-col gap-1">
				<label className="text-muted-foreground text-xs" htmlFor="promo-search">
					Buscar por título
				</label>
				<Input
					id="promo-search"
					onChange={(e) => setSearch(e.target.value)}
					placeholder="Ex: desconto verão"
					value={search}
				/>
			</div>

			<div className="flex flex-col gap-1 md:w-48">
				<label className="text-muted-foreground text-xs" htmlFor="promo-type">
					Tipo
				</label>
				<Select
					onValueChange={(v) => setParam("type", v === ALL ? null : v)}
					value={currentType}
				>
					<SelectTrigger id="promo-type">
						<SelectValue>
							{(v: string) => {
								if (v === "promotion") {
									return "Promoção";
								}
								if (v === "promocode") {
									return "Código";
								}
								return "Todos";
							}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectItem value={ALL}>Todos</SelectItem>
							<SelectItem value="promotion">Promoção</SelectItem>
							<SelectItem value="promocode">Código</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>
		</FiltersBar>
	);
}
