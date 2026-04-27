import crypto from "node:crypto";
import { db } from "../src";
import { category } from "../src/schema/categories";

const ROOTS = [
	{ slug: "ferramentas-eletricas", name: "Ferramentas Elétricas" },
	{ slug: "ferramentas-manuais", name: "Ferramentas Manuais" },
	{ slug: "acessorios", name: "Acessórios" },
	{ slug: "pecas", name: "Peças" },
	{ slug: "sem-categoria", name: "Sem Categoria" },
];

async function main() {
	for (const root of ROOTS) {
		await db
			.insert(category)
			.values({
				id: crypto.randomUUID(),
				slug: root.slug,
				name: root.name,
				parentId: null,
				sortOrder: 0,
				isActive: true,
				path: `/${root.slug}`,
				depth: 0,
			})
			.onConflictDoNothing({ target: category.slug });
	}

	const rows = await db.select({ slug: category.slug }).from(category);
	console.log("[seed-categories] OK", rows.map((r) => r.slug).join(", "));
}

main().catch((err) => {
	console.error("[seed-categories] FAIL", err);
	process.exit(1);
});
