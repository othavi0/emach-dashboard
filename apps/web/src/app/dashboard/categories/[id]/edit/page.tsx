import { db } from "@emach/db";
import {
	type AttributeDefinition,
	attributeDefinition,
	toolAttributeValue,
} from "@emach/db/schema/attributes";
import { category } from "@emach/db/schema/categories";
import { count, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { can, requireCapabilityOrRedirect } from "@/lib/permissions";
import { requireCurrentSession, type UserRole } from "@/lib/session";
import type { InheritedRow, OwnRow } from "../../_components/attributes-table";
import { CategoryAttributesPanel } from "../../_components/category-attributes-panel";
import { CategoryForm } from "../../_components/category-form";
import { getCategory, listCategories } from "../../actions";

export const dynamic = "force-dynamic";

interface PageProps {
	params: Promise<{ id: string }>;
}

async function loadAttributeRows(
	currentCategoryId: string
): Promise<{ inheritedRows: InheritedRow[]; ownRows: OwnRow[] }> {
	// Cadeia de ancestrais
	const [self] = await db
		.select({ id: category.id, parentId: category.parentId })
		.from(category)
		.where(eq(category.id, currentCategoryId))
		.limit(1);
	if (!self) {
		return { inheritedRows: [], ownRows: [] };
	}

	const ancestors: { id: string; name: string }[] = [];
	let cursor: string | null = self.parentId;
	while (cursor) {
		const [row]: { id: string; name: string; parentId: string | null }[] =
			await db
				.select({
					id: category.id,
					name: category.name,
					parentId: category.parentId,
				})
				.from(category)
				.where(eq(category.id, cursor))
				.limit(1);
		if (!row) {
			break;
		}
		ancestors.push({ id: row.id, name: row.name });
		cursor = row.parentId;
	}

	const ancestorIds = ancestors.map((a) => a.id);
	const ancestorNameById = new Map(ancestors.map((a) => [a.id, a.name]));

	const ids = [currentCategoryId, ...ancestorIds];
	const definitions: AttributeDefinition[] = await db
		.select()
		.from(attributeDefinition)
		.where(inArray(attributeDefinition.categoryId, ids));

	const ownDefs = definitions.filter((d) => d.categoryId === currentCategoryId);
	const inheritedDefs = definitions.filter(
		(d) => d.categoryId !== currentCategoryId
	);

	// Usage counts somente para "próprios" (delete dialog usa esse número)
	const ownIds = ownDefs.map((d) => d.id);
	const usageMap = new Map<string, number>();
	if (ownIds.length > 0) {
		const usages = await db
			.select({
				attributeId: toolAttributeValue.attributeId,
				count: count(),
			})
			.from(toolAttributeValue)
			.where(inArray(toolAttributeValue.attributeId, ownIds))
			.groupBy(toolAttributeValue.attributeId);
		for (const u of usages) {
			usageMap.set(u.attributeId, Number(u.count));
		}
	}

	const ownRows: OwnRow[] = ownDefs
		.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
		.map((def) => ({ def, usageCount: usageMap.get(def.id) ?? 0 }));

	const inheritedRows: InheritedRow[] = inheritedDefs
		.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
		.map((def) => ({
			def,
			ownerCategoryId: def.categoryId,
			ownerCategoryName: ancestorNameById.get(def.categoryId) ?? "Origem",
		}));

	return { inheritedRows, ownRows };
}

export default async function EditCategoryPage({ params }: PageProps) {
	await requireCapabilityOrRedirect("categories.manage");
	const { id } = await params;
	const session = await requireCurrentSession();
	const role = (session.user.role as UserRole | undefined) ?? null;

	const [existing, categories, attrRows] = await Promise.all([
		getCategory(id),
		listCategories(),
		loadAttributeRows(id),
	]);

	if (!existing) {
		notFound();
	}

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				description={
					<>
						Caminho atual: <code className="text-xs">{existing.path}</code>
					</>
				}
				title="Editar categoria"
			/>
			<CategoryForm
				categories={categories}
				categoryId={id}
				defaultValues={{
					id: existing.id,
					name: existing.name,
					slug: existing.slug,
					parentId: existing.parentId,
					description: existing.description,
					isActive: existing.isActive,
					path: existing.path,
				}}
				mode="edit"
			/>
			<CategoryAttributesPanel
				canCreate={can(role, "attributes.create")}
				canDelete={can(role, "attributes.delete")}
				canUpdate={can(role, "attributes.update")}
				categoryId={id}
				categoryName={existing.name}
				inheritedRows={attrRows.inheritedRows}
				ownRows={attrRows.ownRows}
			/>
		</div>
	);
}
