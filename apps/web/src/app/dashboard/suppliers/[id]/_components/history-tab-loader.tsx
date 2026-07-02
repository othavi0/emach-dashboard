"use client";

import { LazyTab } from "@/components/entity/lazy-tab";
import type { SupplierAuditRow } from "../../data";
import { fetchSupplierHistoryAction } from "../_lib/tab-actions";
import { HistoryTab } from "./history-tab";

export function HistoryTabLoader({ supplierId }: { supplierId: string }) {
	return (
		<LazyTab load={() => fetchSupplierHistoryAction(supplierId)}>
			{(rows: SupplierAuditRow[]) => <HistoryTab rows={rows} />}
		</LazyTab>
	);
}
