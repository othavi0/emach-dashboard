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
			// Mesmo racional do stock-tab-loader de branches: ?q= vive na URL e o
			// fetch congelaria no primeiro attempt sem o reloadKey.
			reloadKey={search ?? ""}
		>
			{(first: InfiniteResult<SupplierStockToolRow>) => (
				<EstoqueTab first={first} search={search} supplierId={supplierId} />
			)}
		</LazyTab>
	);
}
