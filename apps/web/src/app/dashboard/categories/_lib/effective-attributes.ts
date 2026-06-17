import { db } from "@emach/db";
import { attributeDefinition } from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { eq, or, sql } from "drizzle-orm";

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
		// `seen` é defesa contra um parentId cíclico vindo de escrita SQL direta
		// (o trigger prevent_category_cycle cobre o caminho do app): sem ele o
		// while oscilaria pra sempre.
		const seen = new Set<string>();
		let cursor: string | null = c.id;
		while (cursor && !seen.has(cursor)) {
			seen.add(cursor);
			total += ownCount.get(cursor) ?? 0;
			cursor = parentById.get(cursor) ?? null;
		}
		result.set(c.id, total);
	}
	return result;
}

/**
 * Conta atributos efetivos de UMA categoria (próprios + herdados), via path
 * materializado — O(atributos da cadeia), sem varrer o catálogo inteiro. Use no
 * gate de cadastro/edição de ferramenta, onde só interessa a categoria principal.
 * Paths são slugs (sem `%`/`_`), seguros para LIKE.
 */
export async function getEffectiveAttributeCount(
	categoryId: string
): Promise<number> {
	const [self] = await db
		.select({ path: category.path })
		.from(category)
		.where(eq(category.id, categoryId))
		.limit(1);
	if (!self) {
		return 0;
	}
	const [row] = await db
		.select({ n: sql<number>`count(*)::int` })
		.from(attributeDefinition)
		.innerJoin(category, eq(attributeDefinition.categoryId, category.id))
		.where(
			or(
				eq(category.path, self.path),
				sql`${self.path} like ${category.path} || '/%'`
			)
		);
	return Number(row?.n ?? 0);
}
