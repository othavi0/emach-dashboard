import { describe, expect, it } from "vitest";
import { metadataRows } from "../activity-metadata";
import type { TimelineEntry } from "../activity-timeline";

// metadata vem de jsonb tipado como Record, mas o banco aceita qualquer JSON.
function fromJsonb(json: string): TimelineEntry["metadata"] {
	return JSON.parse(json);
}

describe("metadataRows", () => {
	it("objeto lista cada chave com o valor formatado", () => {
		expect(
			metadataRows(
				fromJsonb(
					'{"title":"Promo","count":3,"active":false,"note":null,"tags":["a","b"],"diff":{"from":1,"to":2}}'
				)
			)
		).toEqual([
			{ key: "title", text: "Promo" },
			{ key: "count", text: "3" },
			{ key: "active", text: "false" },
			{ key: "note", text: "—" },
			{ key: "tags", text: '["a","b"]' },
			{ key: "diff", text: '{"from":1,"to":2}' },
		]);
	});

	it("array lista os índices, como antes", () => {
		expect(metadataRows(fromJsonb("[1,2]"))).toEqual([
			{ key: "0", text: "1" },
			{ key: "1", text: "2" },
		]);
	});

	it("array de objetos mostra cada objeto em JSON", () => {
		expect(metadataRows(fromJsonb('[{"id":"b1"}]'))).toEqual([
			{ key: "0", text: '{"id":"b1"}' },
		]);
	});

	it("string solta lista cada caractere, como antes", () => {
		expect(metadataRows(fromJsonb('"ok"'))).toEqual([
			{ key: "0", text: "o" },
			{ key: "1", text: "k" },
		]);
	});

	it("sem metadata ou vazia não gera linha", () => {
		expect(metadataRows(null)).toEqual([]);
		expect(metadataRows(undefined)).toEqual([]);
		expect(metadataRows({})).toEqual([]);
		expect(metadataRows(fromJsonb("[]"))).toEqual([]);
		expect(metadataRows(fromJsonb("5"))).toEqual([]);
	});
});
