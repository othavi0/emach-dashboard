import { describe, expect, it } from "vitest";

import {
	breadcrumbFromPath,
	buildCategoryTree,
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
