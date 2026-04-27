"use client";

import { Input } from "@emach/ui/components/input";

import { useDebouncedParam } from "@/lib/use-filter-state";

export function BranchSearchInput() {
	const [value, setValue] = useDebouncedParam({
		basePath: "/dashboard/stock/branches",
		key: "search",
	});

	return (
		<div className="flex max-w-md flex-col gap-1">
			<label
				className="text-muted-foreground text-xs"
				htmlFor="branch-stock-search"
			>
				Buscar nesta filial
			</label>
			<Input
				id="branch-stock-search"
				onChange={(e) => setValue(e.target.value)}
				placeholder="Nome ou SKU"
				value={value}
			/>
		</div>
	);
}
