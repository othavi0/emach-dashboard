const FIFO_TABS = new Set(["paid", "preparing", "late"]);

// FIFO das filas de expedição pagina por COALESCE(paid_at, created_at) via a
// variante PaidAtAscCursor JÁ existente em @/lib/cursor — não criar sort novo.
export function ordersTabSort(tabKey: string): "paidAtAsc" | "newest" {
	return FIFO_TABS.has(tabKey) ? "paidAtAsc" : "newest";
}
