import type { Extensions } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { MarkdownStorage } from "tiptap-markdown";
import { Markdown } from "tiptap-markdown";

// tiptap-markdown não faz essa declaration merging sozinho (interface `Storage`
// de @tiptap/core nasce vazia, propositalmente aberta pra augmentation por
// extensão) — sem isso, `editor.storage.markdown.getMarkdown()` não tipa.
declare module "@tiptap/core" {
	interface Storage {
		markdown: MarkdownStorage;
	}
}

// Whitelist do spec: parágrafo, negrito, itálico, listas, hard break.
// Tudo além disso desligado — o render (ToolDescription) e a loja só estilizam esse subset.
export function buildDescriptionExtensions(): Extensions {
	return [
		StarterKit.configure({
			blockquote: false,
			code: false,
			codeBlock: false,
			heading: false,
			horizontalRule: false,
			link: false,
			strike: false,
			underline: false,
		}),
		Markdown.configure({
			breaks: true,
			html: false,
			transformPastedText: true,
		}),
	];
}
