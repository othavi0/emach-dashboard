export interface FlatCategory {
	attributeCount: number;
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
	/** Direto do nó + soma dos rollups das descendentes (calculado no cliente). */
	rollupCount: number;
}

/** Monta a árvore a partir da lista achatada, ordenando irmãos por sortOrder e nome. */
export function buildCategoryTree(flat: FlatCategory[]): CategoryTreeNode[] {
	const byId = new Map<string, CategoryTreeNode>();
	for (const c of flat) {
		byId.set(c.id, { ...c, children: [], rollupCount: 0 });
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

	const computeRollup = (node: CategoryTreeNode): number => {
		let total = node.productCount;
		for (const child of node.children) {
			total += computeRollup(child);
		}
		node.rollupCount = total;
		return total;
	};
	for (const root of roots) {
		computeRollup(root);
	}

	return roots;
}

/** Mapa slug → nome, para montar breadcrumbs de hierarquia. */
export function buildNameBySlug(
	categories: { slug: string; name: string }[]
): Map<string, string> {
	return new Map(categories.map((c) => [c.slug, c.name]));
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
