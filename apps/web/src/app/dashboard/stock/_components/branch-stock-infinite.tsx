"use client";

import { Input } from "@emach/ui/components/input";
import { useRef, useState } from "react";
import { InfiniteSentinel } from "@/components/infinite-sentinel";
import { notify } from "@/lib/notify";
import type { ActiveSupplierOption } from "@/lib/suppliers";
import { useInfiniteList } from "@/lib/use-infinite-list";
import {
	fetchBranchStockPageAction,
	lookupVariantByBarcodeAction,
} from "../actions";
import type {
	BranchStockFiltersInput,
	BranchStockRow,
} from "../branch-stock-data";
import { BranchStockCardGrid } from "./branch-stock-card-grid";
import { BranchStockEditSheet } from "./branch-stock-edit-sheet";

interface BranchStockInfiniteProps {
	branchId: string;
	branchName: string;
	canMutate: boolean;
	filters: BranchStockFiltersInput;
	initial: BranchStockRow[];
	initialCursor: string | null;
	suppliers: ActiveSupplierOption[];
}

export function BranchStockInfinite({
	initial,
	initialCursor,
	filters,
	branchId,
	branchName,
	canMutate,
	suppliers,
}: BranchStockInfiniteProps) {
	const [selectedRow, setSelectedRow] = useState<BranchStockRow | null>(null);
	const [scannerValue, setScannerValue] = useState("");
	const scannerRef = useRef<HTMLInputElement>(null);

	const resetKey = JSON.stringify(filters);
	const { items, hasMore, loadMore, pending, error } = useInfiniteList({
		initialItems: initial,
		initialCursor,
		fetchPage: (cursor) => fetchBranchStockPageAction({ filters, cursor }),
		resetKey,
	});

	async function handleScannerKeyDown(
		e: React.KeyboardEvent<HTMLInputElement>
	) {
		if (e.key !== "Enter") {
			return;
		}
		const value = scannerValue.trim();
		if (!value) {
			return;
		}

		// 1. Procurar no cache local primeiro
		const cached = items.find((item) => item.barcode === value);
		if (cached) {
			setSelectedRow(cached);
			setScannerValue("");
			scannerRef.current?.focus();
			return;
		}

		// 2. Fallback: buscar via server action com branch-scope
		const result = await lookupVariantByBarcodeAction(value, branchId);
		if (result.ok && result.data) {
			setSelectedRow(result.data);
		} else {
			notify.warning("Código não encontrado");
		}
		setScannerValue("");
		scannerRef.current?.focus();
	}

	return (
		<div aria-live="polite">
			<div className="mb-4">
				<Input
					aria-label="Escanear código de barras"
					onChange={(e) => setScannerValue(e.target.value)}
					onKeyDown={handleScannerKeyDown}
					placeholder="Escanear ou digitar código de barras"
					ref={scannerRef}
					value={scannerValue}
				/>
			</div>
			<BranchStockCardGrid onSelect={setSelectedRow} rows={items} />
			<InfiniteSentinel
				error={error}
				hasMore={hasMore}
				onLoadMore={loadMore}
				pending={pending}
			/>
			<BranchStockEditSheet
				branchId={branchId}
				branchName={branchName}
				canMutate={canMutate}
				onClose={() => setSelectedRow(null)}
				row={selectedRow}
				suppliers={suppliers}
			/>
		</div>
	);
}
