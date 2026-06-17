import { describe, expect, it } from "vitest";

import {
	breadcrumbFromPath,
	buildCategoryTree,
	buildNameBySlug,
	type FlatCategory,
} from "./category-tree";

const flat: FlatCategory[] = [
	{
		id: "a",
		name: "A",
		slug: "a",
		parentId: null,
		depth: 0,
		sortOrder: 1,
		isActive: true,
		productCount: 5,
		attributeCount: 0,
	},
	{
		id: "b",
		name: "B",
		slug: "b",
		parentId: null,
		depth: 0,
		sortOrder: 0,
		isActive: true,
		productCount: 0,
		attributeCount: 0,
	},
	{
		id: "a1",
		name: "A1",
		slug: "a1",
		parentId: "a",
		depth: 1,
		sortOrder: 1,
		isActive: true,
		productCount: 2,
		attributeCount: 0,
	},
	{
		id: "a0",
		name: "A0",
		slug: "a0",
		parentId: "a",
		depth: 1,
		sortOrder: 0,
		isActive: false,
		productCount: 0,
		attributeCount: 0,
	},
];

describe("buildCategoryTree", () => {
	it("ordena raízes e filhos por sortOrder", () => {
		const tree = buildCategoryTree(flat);
		expect(tree.map((n) => n.id)).toEqual(["b", "a"]);
		const a = tree.find((n) => n.id === "a");
		expect(a?.children.map((n) => n.id)).toEqual(["a0", "a1"]);
	});

	it("anexa órfãos (pai ausente) como raiz", () => {
		const orphan: FlatCategory[] = [
			{
				id: "x",
				name: "X",
				slug: "x",
				parentId: "missing",
				depth: 1,
				sortOrder: 0,
				isActive: true,
				productCount: 0,
				attributeCount: 0,
			},
		];
		expect(buildCategoryTree(orphan).map((n) => n.id)).toEqual(["x"]);
	});
});

describe("breadcrumbFromPath", () => {
	it("monta os segmentos a partir do path e do mapa de nomes", () => {
		const names = new Map([
			["a", "Ferramentas"],
			["a1", "Furadeiras"],
		]);
		expect(breadcrumbFromPath("/a/a1", names)).toEqual([
			"Ferramentas",
			"Furadeiras",
		]);
	});

	it("ignora segmentos sem nome conhecido", () => {
		expect(
			breadcrumbFromPath("/a/a1", new Map([["a", "Ferramentas"]]))
		).toEqual(["Ferramentas"]);
	});
});

describe("buildCategoryTree → rollupCount", () => {
	it("soma o direto do nó com o rollup de todas as descendentes", () => {
		const tree = buildCategoryTree(flat);
		const a = tree.find((n) => n.id === "a");
		// a (direto 5) + a0 (0) + a1 (2) = 7
		expect(a?.rollupCount).toBe(7);
		// folhas: rollup == direto
		expect(a?.children.find((n) => n.id === "a1")?.rollupCount).toBe(2);
		expect(tree.find((n) => n.id === "b")?.rollupCount).toBe(0);
	});

	it("propaga por mais de um nível", () => {
		const deep: FlatCategory[] = [
			{
				id: "r",
				name: "R",
				slug: "r",
				parentId: null,
				depth: 0,
				sortOrder: 0,
				isActive: true,
				productCount: 1,
				attributeCount: 0,
			},
			{
				id: "c",
				name: "C",
				slug: "c",
				parentId: "r",
				depth: 1,
				sortOrder: 0,
				isActive: true,
				productCount: 2,
				attributeCount: 0,
			},
			{
				id: "g",
				name: "G",
				slug: "g",
				parentId: "c",
				depth: 2,
				sortOrder: 0,
				isActive: true,
				productCount: 4,
				attributeCount: 0,
			},
		];
		const tree = buildCategoryTree(deep);
		const r = tree.find((n) => n.id === "r");
		expect(r?.rollupCount).toBe(7); // 1 + 2 + 4
		expect(r?.children[0]?.rollupCount).toBe(6); // 2 + 4
	});
});

describe("buildNameBySlug", () => {
	it("mapeia slug → nome", () => {
		const map = buildNameBySlug([
			{ slug: "a", name: "Ferramentas" },
			{ slug: "a1", name: "Furadeiras" },
		]);
		expect(map.get("a")).toBe("Ferramentas");
		expect(map.get("a1")).toBe("Furadeiras");
		expect(map.size).toBe(2);
	});
});
