import { stockMovement } from "@emach/db/schema/stock-movements";
import { and, eq, lt, or } from "drizzle-orm";

import { decodeCursorAs, encodeCursor } from "@/lib/cursor";
import { startOfDaySaoPaulo } from "@/lib/format/datetime";

export type PeriodPreset = "today" | "7d" | "30d" | "90d" | "all";

const PERIOD_DAYS: Record<"7d" | "30d" | "90d", number> = {
	"7d": 7,
	"30d": 30,
	"90d": 90,
};

export function computePeriodCutoff(period: PeriodPreset): Date | null {
	if (period === "all") {
		return null;
	}
	const now = new Date();
	if (period === "today") {
		return startOfDaySaoPaulo(now);
	}
	return new Date(now.getTime() - PERIOD_DAYS[period] * 86_400_000);
}

/** Condição keyset (createdAt,id) desc para paginação de stock_movement. */
export function movementKeysetCondition(cursor: string | null) {
	if (!cursor) {
		return;
	}
	const c = decodeCursorAs(cursor, "activity");
	return or(
		lt(stockMovement.createdAt, new Date(c.createdAt)),
		and(
			eq(stockMovement.createdAt, new Date(c.createdAt)),
			lt(stockMovement.id, c.id)
		)
	);
}

/** Cursor do próximo page de stock_movement (ou null se não há mais). */
export function encodeMovementCursor(
	last: { id: string; createdAt: Date } | undefined,
	hasMore: boolean
): string | null {
	if (!(hasMore && last)) {
		return null;
	}
	return encodeCursor({
		v: 1,
		sort: "activity",
		id: last.id,
		createdAt: last.createdAt.toISOString(),
	});
}
