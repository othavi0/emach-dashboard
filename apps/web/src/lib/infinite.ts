export interface InfiniteResult<T> {
	items: T[];
	nextCursor: string | null;
}

export const BATCH_SIZE = 24;
