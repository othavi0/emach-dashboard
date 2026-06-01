import { type Cursor, encodeCursor } from "./cursor";

export interface InfiniteResult<T> {
	items: T[];
	nextCursor: string | null;
}

export const BATCH_SIZE = 20;

/**
 * Paginação keyset: recebe `BATCH_SIZE + 1` linhas raw de uma query,
 * mapeia para itens de UI e emite o cursor da última linha da página.
 * `makeCursor` só é chamado quando há mais páginas, recebendo a última
 * linha RAW (índice `BATCH_SIZE - 1`).
 */
export function paginate<TRaw, TItem>(
	rawRows: TRaw[],
	mapRow: (row: TRaw) => TItem,
	makeCursor: (lastRaw: TRaw) => Cursor
): InfiniteResult<TItem> {
	const hasMore = rawRows.length > BATCH_SIZE;
	const pageRows = hasMore ? rawRows.slice(0, BATCH_SIZE) : rawRows;
	const items = pageRows.map(mapRow);
	const lastRaw = pageRows.at(-1);
	const nextCursor =
		hasMore && lastRaw ? encodeCursor(makeCursor(lastRaw)) : null;
	return { items, nextCursor };
}
