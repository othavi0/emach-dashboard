import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { asc } from "drizzle-orm";

/**
 * Returns a record keyed by category.id, where each value is the list of
 * AttributeDefinitions active for that category — the union of definitions
 * tied to any ancestor in the category's chain plus globals (categoryId IS NULL).
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: walks ancestor chain + dedup; encapsulado em uma função pura para evitar consultas N+1
export async function buildDefinitionsByCategory(): Promise<
	Record<string, AttributeDefinition[]>
> {
	const [categories, definitions] = await Promise.all([
		db
			.select({
				id: category.id,
				parentId: category.parentId,
			})
			.from(category),
		db
			.select()
			.from(attributeDefinition)
			.orderBy(
				asc(attributeDefinition.sortOrder),
				asc(attributeDefinition.label)
			),
	]);

	const parentById = new Map(categories.map((c) => [c.id, c.parentId]));
	const globalDefs = definitions.filter((d) => d.categoryId === null);
	const defsByCategoryId = new Map<string, AttributeDefinition[]>();
	for (const d of definitions) {
		if (d.categoryId === null) {
			continue;
		}
		const list = defsByCategoryId.get(d.categoryId) ?? [];
		list.push(d);
		defsByCategoryId.set(d.categoryId, list);
	}

	const result: Record<string, AttributeDefinition[]> = {};
	for (const c of categories) {
		const chain: string[] = [c.id];
		let cur = c.parentId;
		while (cur) {
			chain.push(cur);
			cur = parentById.get(cur) ?? null;
		}
		const seen = new Set<string>();
		const list: AttributeDefinition[] = [];
		for (const ancestorId of chain) {
			for (const d of defsByCategoryId.get(ancestorId) ?? []) {
				if (!seen.has(d.id)) {
					list.push(d);
					seen.add(d.id);
				}
			}
		}
		for (const d of globalDefs) {
			if (!seen.has(d.id)) {
				list.push(d);
				seen.add(d.id);
			}
		}
		list.sort(
			(a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
		);
		result[c.id] = list;
	}
	return result;
}
