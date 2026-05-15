export interface FlatCategory {
	depth: number;
	id: string;
	isActive: boolean;
	name: string;
	parentId: string | null;
	productCount: number;
	slug: string;
	sortOrder: number;
}

export interface CategoryTreeNode extends FlatCategory {
	children: CategoryTreeNode[];
}

/** Monta a árvore a partir da lista achatada, ordenando irmãos por sortOrder e nome. */
export function buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[] {
	const byId = new Map<string, CategoryTreeNode>();
	for (const c of flat) {
		byId.set(c.id, { ...c, children: [] });
	}

	const roots: CategoryTreeNode[] = [];
	for (const node of byId.values()) {
		const parent = node.parentId ? byId.get(node.parentId) : undefined;
		if (parent) {
			parent.children.push(node);
		} else {
			roots.push(node);
		}
	}

	const sortSiblings = (nodes: CategoryTreeNode[]) => {
		nodes.sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		);
		for (const n of nodes) {
			sortSiblings(n.children);
		}
	};
	sortSiblings(roots);

	return roots;
}

/** Converte um path materializado (segmentos de slug) numa lista de nomes para breadcrumb. */
export function breadcrumbFromPath(
	path: string,
	nameBySlug: Map<string, string>
): string[] {
	return path
		.split("/")
		.filter((seg) => seg !== "")
		.map((seg) => nameBySlug.get(seg))
		.filter((name): name is string => name !== undefined);
}
