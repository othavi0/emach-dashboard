import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";

/**
 * Conta atributos *efetivos* (próprios + herdados da cadeia ancestral) de cada
 * categoria, numa única passada. A herança segue `parentId` — espelha o que
 * `buildDefinitionsByCategory` faz para o wizard de tool, mas devolvendo só a
 * contagem (mais barato para a árvore e o gate).
 *
 * Server-only (importa `db`): consumir a partir de Server Components/actions.
 * Para o limiar/decisão use `MIN_CATEGORY_ATTRIBUTES`/`isCategoryComplete` de
 * `./category-completeness` (módulo puro, importável no cliente).
 */
export async function buildEffectiveAttributeCounts(): Promise<
	Map<string, number>
> {
	const [categories, defs] = await Promise.all([
		db.select({ id: category.id, parentId: category.parentId }).from(category),
		db
			.select({ categoryId: attributeDefinition.categoryId })
			.from(attributeDefinition),
	]);

	const parentById = new Map(categories.map((c) => [c.id, c.parentId]));
	const ownCount = new Map<string, number>();
	for (const d of defs) {
		ownCount.set(d.categoryId, (ownCount.get(d.categoryId) ?? 0) + 1);
	}

	const result = new Map<string, number>();
	for (const c of categories) {
		let total = 0;
		let cursor: string | null = c.id;
		while (cursor) {
			total += ownCount.get(cursor) ?? 0;
			cursor = parentById.get(cursor) ?? null;
		}
		result.set(c.id, total);
	}
	return result;
}
