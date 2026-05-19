import { describe, expect, it, vi } from "vitest";

import { decodeCursor } from "@/lib/cursor";
import { BATCH_SIZE, paginate } from "@/lib/infinite";

interface Raw {
	n: number;
}

const makeRows = (count: number): Raw[] =>
	Array.from({ length: count }, (_, i) => ({ n: i }));

const mapRow = (r: Raw) => ({ value: r.n * 10 });

const makeCursor = (last: Raw) =>
	({
		v: 1,
		sort: "newest",
		createdAt: `t${last.n}`,
		id: `id${last.n}`,
	}) as const;

describe("paginate", () => {
	it("retorna todos os itens e nextCursor null quando há menos que BATCH_SIZE linhas", () => {
		const spy = vi.fn(makeCursor);
		const result = paginate(makeRows(BATCH_SIZE - 1), mapRow, spy);
		expect(result.items).toHaveLength(BATCH_SIZE - 1);
		expect(result.nextCursor).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});

	it("retorna nextCursor null quando há exatamente BATCH_SIZE linhas", () => {
		const spy = vi.fn(makeCursor);
		const result = paginate(makeRows(BATCH_SIZE), mapRow, spy);
		expect(result.items).toHaveLength(BATCH_SIZE);
		expect(result.nextCursor).toBeNull();
		expect(spy).not.toHaveBeenCalled();
	});

	it("corta em BATCH_SIZE e emite cursor da linha de índice BATCH_SIZE-1 quando há mais", () => {
		const spy = vi.fn(makeCursor);
		const result = paginate(makeRows(BATCH_SIZE + 1), mapRow, spy);
		expect(result.items).toHaveLength(BATCH_SIZE);
		expect(result.nextCursor).not.toBeNull();
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith({ n: BATCH_SIZE - 1 });
		const decoded = decodeCursor(result.nextCursor as string);
		expect(decoded).toMatchObject({
			sort: "newest",
			id: `id${BATCH_SIZE - 1}`,
			createdAt: `t${BATCH_SIZE - 1}`,
		});
	});

	it("aplica mapRow a cada item retornado", () => {
		const result = paginate(makeRows(3), mapRow, makeCursor);
		expect(result.items).toEqual([{ value: 0 }, { value: 10 }, { value: 20 }]);
	});
});
