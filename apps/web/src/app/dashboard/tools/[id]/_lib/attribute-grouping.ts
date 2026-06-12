import type { ToolDetailAttribute } from "./tool-detail-data";

export interface AttributeGroup {
	attributes: ToolDetailAttribute[];
	categoryId: string;
	categoryName: string;
}

export function groupAttributesByCategory(
	attributes: ToolDetailAttribute[]
): AttributeGroup[] {
	const byId = new Map<string, AttributeGroup>();
	const depthById = new Map<string, number>();

	for (const a of attributes) {
		depthById.set(a.sourceCategoryId, a.sourceCategoryDepth);
		const group = byId.get(a.sourceCategoryId);
		if (group) {
			group.attributes.push(a);
		} else {
			byId.set(a.sourceCategoryId, {
				categoryId: a.sourceCategoryId,
				categoryName: a.sourceCategoryName,
				attributes: [a],
			});
		}
	}

	const groups = Array.from(byId.values());
	for (const g of groups) {
		g.attributes.sort((x, y) => x.sortOrder - y.sortOrder);
	}
	groups.sort((x, y) => {
		const dx = depthById.get(x.categoryId) ?? 0;
		const dy = depthById.get(y.categoryId) ?? 0;
		if (dx !== dy) {
			return dx - dy;
		}
		return x.categoryName.localeCompare(y.categoryName);
	});
	return groups;
}
