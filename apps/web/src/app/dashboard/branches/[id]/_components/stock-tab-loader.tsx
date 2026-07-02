"use client";

import { useSearchParams } from "next/navigation";
import { LazyTab } from "@/components/entity/lazy-tab";
import {
	type BranchStockTabData,
	fetchBranchStockTabAction,
} from "../_lib/tab-actions";
import { StockTab } from "./stock-tab";

interface Props {
	branchId: string;
	branchName: string;
}

export function StockTabLoader({ branchId, branchName }: Props) {
	const params = useSearchParams();
	const categoryId = params.get("categoryId") ?? undefined;
	const search = params.get("search") ?? undefined;
	const sort = params.get("sort") ?? undefined;
	const status = params.get("status") ?? undefined;

	return (
		<LazyTab
			load={() =>
				fetchBranchStockTabAction({
					branchId,
					categoryId,
					search,
					sort,
					status,
				})
			}
			// Filtros vivem na URL (BranchStockFilters → router.replace); sem o
			// reloadKey o fetch congela no primeiro attempt e a lista ignora
			// trocas de filtro após a ativação da tab.
			reloadKey={JSON.stringify({ categoryId, search, sort, status })}
		>
			{(data: BranchStockTabData) => (
				<StockTab branchId={branchId} branchName={branchName} data={data} />
			)}
		</LazyTab>
	);
}
