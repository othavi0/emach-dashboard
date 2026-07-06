import { describe, expect, it } from "vitest";
import {
	deriveFulfillmentState,
	isPickingStale,
	STALE_PICKING_MS,
} from "../_lib/picking-logic";

describe("deriveFulfillmentState", () => {
	it("null (nenhuma sessão) → awaiting_picking", () => {
		expect(deriveFulfillmentState(null)).toBe("awaiting_picking");
	});
	it("canceled → awaiting_picking (volta pra fila)", () => {
		expect(deriveFulfillmentState("canceled")).toBe("awaiting_picking");
	});
	it("in_progress → picking_in_progress", () => {
		expect(deriveFulfillmentState("in_progress")).toBe("picking_in_progress");
	});
	it("exception → picking_exception", () => {
		expect(deriveFulfillmentState("exception")).toBe("picking_exception");
	});
	it("completed → picked", () => {
		expect(deriveFulfillmentState("completed")).toBe("picked");
	});
});

describe("isPickingStale", () => {
	const now = new Date("2026-07-06T15:00:00Z");
	it("sem bipagem, startedAt há 2h → stale", () => {
		expect(
			isPickingStale({
				lastScannedAt: null,
				startedAt: new Date(now.getTime() - 2 * STALE_PICKING_MS),
				now,
			})
		).toBe(true);
	});
	it("última bipagem há 10min → não stale (mesmo com start antigo)", () => {
		expect(
			isPickingStale({
				lastScannedAt: new Date(now.getTime() - 10 * 60 * 1000),
				startedAt: new Date(now.getTime() - 5 * STALE_PICKING_MS),
				now,
			})
		).toBe(false);
	});
	it("exatamente no limiar → não stale (estrito >)", () => {
		expect(
			isPickingStale({
				lastScannedAt: new Date(now.getTime() - STALE_PICKING_MS),
				startedAt: new Date(0),
				now,
			})
		).toBe(false);
	});
});
