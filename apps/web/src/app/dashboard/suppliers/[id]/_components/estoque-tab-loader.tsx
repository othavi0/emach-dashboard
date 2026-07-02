"use client";

import { useSearchParams } from "next/navigation";
import { LazyTab } from "@/components/entity/lazy-tab";
import type { InfiniteResult } from "@/lib/infinite";
import { fetchSupplierStockPage } from "../../actions";
import type { SupplierStockToolRow } from "../../data";
import { EstoqueTab } from "./estoque-tab";

export function EstoqueTabLoader({ supplierId }: { supplierId: string }) {
	const params = useSearchParams();
	const search = params.get("q") ?? undefined;

	return (
		<LazyTab
			load={() => fetchSupplierStockPage({ supplierId, search, cursor: null })}
		>
			{(first: InfiniteResult<SupplierStockToolRow>) => (
				<EstoqueTab first={first} search={search} supplierId={supplierId} />
			)}
		</LazyTab>
	);
}
