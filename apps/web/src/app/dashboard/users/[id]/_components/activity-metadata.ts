import { z } from "zod";
import type { TimelineEntry } from "./activity-timeline";

// metadata é jsonb: decodifica cada valor no texto exibido. Vazio vira "—",
// escalar vira String, objeto e array viram JSON. O catch cobre o que o jsonb
// não produz (função, bigint) com String, como o formatador anterior.
const metadataValueSchema = z
	.union([
		z.union([z.null(), z.undefined()]).transform(() => "—"),
		z.union([z.string(), z.number(), z.boolean()]).transform(String),
		z.json().transform((v) => JSON.stringify(v)),
	])
	.catch((ctx) => String(ctx.value));

export interface MetadataRow {
	key: string;
	text: string;
}

// Object.entries, não um schema do contêiner: jsonb em array lista os índices
// (0, 1, ...) e nenhum formato de metadata some da tela.
export function metadataRows(
	metadata: TimelineEntry["metadata"]
): MetadataRow[] {
	if (!metadata) {
		return [];
	}

	return Object.entries(metadata).map(([key, value]) => ({
		key,
		text: metadataValueSchema.parse(value),
	}));
}
