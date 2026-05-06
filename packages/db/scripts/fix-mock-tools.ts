/**
 * Audita + corrige tools mockadas que violam invariantes do form de edição.
 *
 * Invariantes aplicadas (idempotente):
 *  - Toda tool tem ≥1 tool_variant.
 *  - Cada tool tem exatamente 1 variant com isDefault=true.
 *  - Toda variant tem sku não-vazio, priceAmount não-NULL.
 *  - Toda tool tem ≥1 tool_category com isPrimary=true (warning quando faltar — não auto-fixável).
 *
 * Modo dry-run por default. Passar `--apply` pra persistir.
 */

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../src";
import { toolCategory } from "../src/schema/categories";
import { tool, toolVariant } from "../src/schema/tools";

const APPLY = process.argv.includes("--apply");

interface Issue {
	detail?: string;
	kind:
		| "no_variants"
		| "no_default"
		| "multiple_defaults"
		| "empty_sku"
		| "null_price"
		| "no_categories"
		| "no_primary_category";
	toolId: string;
	toolName: string;
}

async function audit(): Promise<Issue[]> {
	const issues: Issue[] = [];

	const tools = await db.select({ id: tool.id, name: tool.name }).from(tool);

	for (const t of tools) {
		const variants = await db
			.select()
			.from(toolVariant)
			.where(eq(toolVariant.toolId, t.id));

		if (variants.length === 0) {
			issues.push({ toolId: t.id, toolName: t.name, kind: "no_variants" });
		} else {
			const defaults = variants.filter((v) => v.isDefault);
			if (defaults.length === 0) {
				issues.push({ toolId: t.id, toolName: t.name, kind: "no_default" });
			} else if (defaults.length > 1) {
				issues.push({
					toolId: t.id,
					toolName: t.name,
					kind: "multiple_defaults",
					detail: `${defaults.length} marcadas como default`,
				});
			}
			for (const v of variants) {
				if (!v.sku || v.sku.trim() === "") {
					issues.push({
						toolId: t.id,
						toolName: t.name,
						kind: "empty_sku",
						detail: `variant ${v.id}`,
					});
				}
				if (v.priceAmount == null) {
					issues.push({
						toolId: t.id,
						toolName: t.name,
						kind: "null_price",
						detail: `variant ${v.id}`,
					});
				}
			}
		}

		const cats = await db
			.select()
			.from(toolCategory)
			.where(eq(toolCategory.toolId, t.id));

		if (cats.length === 0) {
			issues.push({
				toolId: t.id,
				toolName: t.name,
				kind: "no_categories",
			});
		} else if (!cats.some((c) => c.isPrimary)) {
			issues.push({
				toolId: t.id,
				toolName: t.name,
				kind: "no_primary_category",
			});
		}
	}

	return issues;
}

async function fix(issues: Issue[]) {
	const byTool = new Map<string, Issue[]>();
	for (const i of issues) {
		const list = byTool.get(i.toolId) ?? [];
		list.push(i);
		byTool.set(i.toolId, list);
	}

	for (const [toolId, list] of byTool) {
		const toolName = list[0]?.toolName ?? toolId;

		// no_variants → cria variant default mínima.
		if (list.some((i) => i.kind === "no_variants")) {
			const slug =
				toolName
					.toLowerCase()
					.normalize("NFD")
					.replace(/[̀-ͯ]/g, "")
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-+|-+$/g, "")
					.slice(0, 40) || "var";
			const sku = `MOCK-${slug}-${toolId.slice(0, 6)}`;
			await db.insert(toolVariant).values({
				id: crypto.randomUUID(),
				toolId,
				sku,
				priceAmount: "0.00",
				isDefault: true,
				sortOrder: 0,
			});
			console.log(`  [fix] ${toolName}: variant default criada (sku=${sku})`);
			continue;
		}

		// no_default → marca primeira (ordenada por sortOrder) como default.
		if (list.some((i) => i.kind === "no_default")) {
			const variants = await db
				.select({ id: toolVariant.id })
				.from(toolVariant)
				.where(eq(toolVariant.toolId, toolId))
				.orderBy(toolVariant.sortOrder);
			const first = variants[0];
			if (first) {
				await db
					.update(toolVariant)
					.set({ isDefault: true })
					.where(eq(toolVariant.id, first.id));
				console.log(`  [fix] ${toolName}: variant ${first.id} marcada default`);
			}
		}

		// multiple_defaults → mantém primeira por sortOrder, demais viram false.
		if (list.some((i) => i.kind === "multiple_defaults")) {
			const variants = await db
				.select({ id: toolVariant.id, sortOrder: toolVariant.sortOrder })
				.from(toolVariant)
				.where(eq(toolVariant.toolId, toolId))
				.orderBy(toolVariant.sortOrder);
			const keep = variants[0]?.id;
			if (keep) {
				for (const v of variants) {
					await db
						.update(toolVariant)
						.set({ isDefault: v.id === keep })
						.where(eq(toolVariant.id, v.id));
				}
				console.log(`  [fix] ${toolName}: default unificado em ${keep}`);
			}
		}

		// empty_sku → preenche fallback.
		const emptySkuIssues = list.filter((i) => i.kind === "empty_sku");
		for (const issue of emptySkuIssues) {
			const variantId = issue.detail?.replace("variant ", "") ?? "";
			const fallback = `MOCK-${variantId.slice(0, 8)}`;
			await db
				.update(toolVariant)
				.set({ sku: fallback })
				.where(eq(toolVariant.id, variantId));
			console.log(`  [fix] ${toolName}: sku ${variantId} → ${fallback}`);
		}

		// null_price → 0.00.
		const nullPriceIssues = list.filter((i) => i.kind === "null_price");
		for (const issue of nullPriceIssues) {
			const variantId = issue.detail?.replace("variant ", "") ?? "";
			await db
				.update(toolVariant)
				.set({ priceAmount: "0.00" })
				.where(eq(toolVariant.id, variantId));
			console.log(`  [fix] ${toolName}: priceAmount ${variantId} → 0.00`);
		}

		// no_categories / no_primary_category → não auto-fixáveis.
		if (list.some((i) => i.kind === "no_categories")) {
			console.warn(
				`  [warn] ${toolName} (${toolId}) sem categorias — atribua manualmente`
			);
		}
		if (list.some((i) => i.kind === "no_primary_category")) {
			// Auto-fix: marca primeira categoria como primary.
			const cats = await db
				.select({ categoryId: toolCategory.categoryId })
				.from(toolCategory)
				.where(eq(toolCategory.toolId, toolId));
			const first = cats[0];
			if (first) {
				await db
					.update(toolCategory)
					.set({ isPrimary: true })
					.where(
						sql`${toolCategory.toolId} = ${toolId} AND ${toolCategory.categoryId} = ${first.categoryId}`
					);
				console.log(
					`  [fix] ${toolName}: categoria ${first.categoryId} marcada primary`
				);
			}
		}
	}
}

async function main() {
	console.log(
		`[fix-mock-tools] modo: ${APPLY ? "APPLY (vai persistir)" : "DRY-RUN"}`
	);
	const issues = await audit();
	if (issues.length === 0) {
		console.log("[fix-mock-tools] OK — nenhuma inconsistência encontrada");
		return;
	}

	console.log(`[fix-mock-tools] ${issues.length} issue(s):`);
	for (const i of issues) {
		console.log(
			`  - ${i.kind} · ${i.toolName} (${i.toolId})${i.detail ? ` · ${i.detail}` : ""}`
		);
	}

	if (!APPLY) {
		console.log(
			"\n[fix-mock-tools] dry-run. Re-rode com --apply pra persistir."
		);
		return;
	}

	console.log("\n[fix-mock-tools] aplicando correções…");
	await fix(issues);
	console.log("\n[fix-mock-tools] re-auditando…");
	const remaining = await audit();
	if (remaining.length === 0) {
		console.log("[fix-mock-tools] limpo.");
	} else {
		console.warn(
			`[fix-mock-tools] ${remaining.length} issue(s) restante(s) — requerem intervenção manual:`
		);
		for (const i of remaining) {
			console.warn(`  - ${i.kind} · ${i.toolName} (${i.toolId})`);
		}
	}
}

main()
	.catch((err) => {
		console.error("[fix-mock-tools] FAIL", err);
		process.exit(1);
	})
	.finally(() => process.exit(0));
