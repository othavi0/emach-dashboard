// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { buildDescriptionExtensions } from "../markdown-editor-extensions";

function roundTrip(markdown: string): string {
	const editor = new Editor({
		content: markdown,
		extensions: buildDescriptionExtensions(),
	});
	const out = editor.storage.markdown.getMarkdown();
	editor.destroy();
	return out;
}

describe("buildDescriptionExtensions", () => {
	it("preserva negrito, itálico e listas no round-trip", () => {
		const md = "**negrito** e *itálico*\n\n- item um\n- item dois";
		expect(roundTrip(md)).toBe(md);
	});

	it("preserva lista numerada", () => {
		expect(roundTrip("1. um\n2. dois")).toContain("1. um");
	});

	it("degrada heading colado (whitelist)", () => {
		expect(roundTrip("# Título")).not.toContain("#");
	});

	it("degrada tachado colado (whitelist)", () => {
		expect(roundTrip("~~riscado~~")).not.toContain("~~");
	});

	it("texto plano legado passa intacto", () => {
		expect(roundTrip("só um parágrafo simples")).toBe(
			"só um parágrafo simples"
		);
	});
});
