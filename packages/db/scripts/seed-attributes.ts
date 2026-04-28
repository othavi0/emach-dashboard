import crypto from "node:crypto";
import { db } from "../src";
import {
	type AttributeOptions,
	attributeDefinition,
} from "../src/schema/attributes";
import { category } from "../src/schema/categories";

interface Seed {
	categorySlug: string;
	inputType:
		| "text"
		| "number"
		| "select"
		| "boolean"
		| "numeric_range"
		| "color";
	isRequired?: boolean;
	label: string;
	options?: AttributeOptions;
	slug: string;
	sortOrder?: number;
	unit?: string;
}

const SEEDS: Seed[] = [
	{
		slug: "rpm-maximo",
		label: "RPM máximo",
		inputType: "number",
		unit: "RPM",
		categorySlug: "ferramentas-eletricas",
		sortOrder: 10,
	},
	{
		slug: "capacidade-mandril",
		label: "Capacidade do mandril",
		inputType: "numeric_range",
		unit: "mm",
		categorySlug: "ferramentas-eletricas",
		sortOrder: 20,
	},
	{
		slug: "tipo-percussao",
		label: "Tipo de percussão",
		inputType: "select",
		options: {
			kind: "select",
			options: [
				{ value: "sem-percussao", label: "Sem percussão" },
				{ value: "com-percussao", label: "Com percussão" },
				{ value: "rotomartelo", label: "Rotomartelo" },
			],
		},
		categorySlug: "ferramentas-eletricas",
		sortOrder: 30,
	},
	{
		slug: "tem-luz-led",
		label: "Possui luz LED",
		inputType: "boolean",
		categorySlug: "ferramentas-eletricas",
		sortOrder: 40,
	},
	{
		slug: "material-carcaca",
		label: "Material da carcaça",
		inputType: "text",
		categorySlug: "ferramentas-eletricas",
		sortOrder: 50,
	},
];

async function main() {
	const cats = await db
		.select({ id: category.id, slug: category.slug })
		.from(category);
	const bySlug = new Map(cats.map((c) => [c.slug, c.id]));

	for (const s of SEEDS) {
		const categoryId = bySlug.get(s.categorySlug);
		if (!categoryId) {
			console.warn(
				`[seed-attributes] SKIP ${s.slug} — category ${s.categorySlug} not found`
			);
			continue;
		}
		await db
			.insert(attributeDefinition)
			.values({
				id: crypto.randomUUID(),
				slug: s.slug,
				label: s.label,
				inputType: s.inputType,
				unit: s.unit ?? null,
				options: s.options ?? null,
				isRequired: s.isRequired ?? false,
				categoryId,
				sortOrder: s.sortOrder ?? 0,
			})
			.onConflictDoNothing({ target: attributeDefinition.slug });
	}

	const rows = await db
		.select({ slug: attributeDefinition.slug })
		.from(attributeDefinition);
	console.log("[seed-attributes] OK", rows.map((r) => r.slug).join(", "));
}

main().catch((err) => {
	console.error("[seed-attributes] FAIL", err);
	process.exit(1);
});
