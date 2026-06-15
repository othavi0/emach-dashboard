"use server";

import type { InfiniteResult } from "@/lib/infinite";
import {
	fetchLedgerPage,
	type LedgerFilters,
	type LedgerRow,
} from "../movements-data";

/**
 * Wrapper "use server" do ledger global — o componente client
 * (`ledger-infinite.tsx`) chama esta action em vez de importar a função
 * de `movements-data.ts` (que é `server-only` e arrasta `@emach/db` pro
 * bundle do browser). Os tipos podem ser importados direto de movements-data
 * (type-only import é apagado no compile, não vai pro bundle).
 */
export async function fetchLedgerPageAction(
	filters: LedgerFilters,
	cursor: string | null
): Promise<InfiniteResult<LedgerRow>> {
	return await fetchLedgerPage(filters, cursor);
}
