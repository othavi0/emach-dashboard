"use server";

import type { ActionResult } from "@/lib/action-result";
import { logger } from "@/lib/logger";
import { requireCurrentSession } from "@/lib/session";
import type { SearchResults } from "./_lib/global-search";
import { runGlobalSearch } from "./_lib/global-search.server";

export async function globalSearch(
	query: string
): Promise<ActionResult<SearchResults>> {
	await requireCurrentSession();
	try {
		const data = await runGlobalSearch(query);
		return { ok: true, data };
	} catch (err) {
		logger.error("globalSearch", err);
		return { ok: false, error: "Falha na busca" };
	}
}
