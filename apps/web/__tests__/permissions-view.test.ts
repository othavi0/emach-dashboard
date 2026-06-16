import { describe, expect, it } from "vitest";
import {
	buildPermissionTree,
	sectionMasterState,
} from "@/app/dashboard/users/[id]/permissions/permissions-view";
import type { Capability } from "@/lib/capabilities";

const empty = {
	overrides: new Map(),
	roleDefaults: new Set<Capability>(),
	manageable: new Set<Capability>([
		"tools.read",
		"tools.create",
		"tools.delete",
	]),
};

describe("buildPermissionTree", () => {
	it("agrupa por seção na ordem da sidebar e por recurso", () => {
		const tree = buildPermissionTree(empty);
		const sections = tree.map((s) => s.section);
		// Operação vem antes de Catálogo, que vem antes de Administração
		expect(sections.indexOf("Operação")).toBeLessThan(
			sections.indexOf("Catálogo")
		);
		expect(sections.indexOf("Catálogo")).toBeLessThan(
			sections.indexOf("Administração")
		);
		const catalogo = tree.find((s) => s.section === "Catálogo");
		expect(catalogo?.resources.some((r) => r.resource === "Ferramentas")).toBe(
			true
		);
	});

	it("ordena ações: Ver primeiro, destrutivas por último", () => {
		const tree = buildPermissionTree(empty);
		const ferramentas = tree
			.find((s) => s.section === "Catálogo")
			?.resources.find((r) => r.resource === "Ferramentas");
		const acts = ferramentas?.rows.map((r) => r.action) ?? [];
		expect(acts[0]).toBe("Ver");
		expect(acts.at(-1)).toBe("Deletar");
	});

	it("popula state/defaultOn/editable por linha", () => {
		const tree = buildPermissionTree({
			overrides: new Map([["tools.create", "revoke"]]),
			roleDefaults: new Set<Capability>(["tools.read"]),
			manageable: new Set<Capability>(["tools.read"]),
		});
		const rows =
			tree
				.find((s) => s.section === "Catálogo")
				?.resources.find((r) => r.resource === "Ferramentas")?.rows ?? [];
		const ver = rows.find((r) => r.cap === "tools.read");
		const criar = rows.find((r) => r.cap === "tools.create");
		expect(ver).toMatchObject({
			defaultOn: true,
			state: "inherit",
			editable: true,
		});
		expect(criar).toMatchObject({ state: "revoke", editable: false });
	});
});

describe("sectionMasterState", () => {
	const mk = (states: ("inherit" | "grant" | "revoke")[]) => ({
		section: "Catálogo" as const,
		resources: [
			{
				resource: "Ferramentas",
				rows: states.map((s, i) => ({
					cap: `c${i}` as Capability,
					action: "x",
					defaultOn: false,
					state: s,
					editable: true,
				})),
			},
		],
	});

	it("uniforme → devolve o estado", () => {
		expect(sectionMasterState(mk(["grant", "grant"]))).toBe("grant");
	});
	it("divergente → mixed", () => {
		expect(sectionMasterState(mk(["grant", "revoke"]))).toBe("mixed");
	});
	it("sem linhas editáveis → null", () => {
		const s = mk(["grant"]);
		const firstRow = s.resources[0]?.rows[0];
		if (firstRow) {
			firstRow.editable = false;
		}
		expect(sectionMasterState(s)).toBeNull();
	});
});
