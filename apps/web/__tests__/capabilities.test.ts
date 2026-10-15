import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
	CAPABILITIES,
	type Capability,
	isCapability,
	roleDefaultCapabilities,
	SECTION_ORDER,
	sectionForCapability,
} from "@/lib/capabilities";

// Object.keys devolve string[]; o filtro pelo guard isCapability estreita para
// Capability sem perder nenhuma chave do registry.
const ALL_CAPABILITIES = Object.keys(CAPABILITIES).filter(isCapability);

// Tipadas como Capability[] de propósito: o compilador valida que cada string
// é uma key real do registry (pega typo na lista de regressão).
// Matriz alvo do role user (estoqueista/operacional) — ver ADR-0016 e ADR-0017.
// orders.read migrou SAU→SA em 2026-07: user opera a fila de separação
// (orders.pick) mas não enxerga a seção Pedidos nem o detalhe do pedido.
const OPERATIONAL_USER: readonly Capability[] = [
	"tools.read",
	"categories.read",
	"attributes.read",
	"suppliers.read",
	"suppliers.manage",
	"stock.read",
	"stock.adjust",
	"orders.update_status",
	"orders.add_note",
	"orders.pick",
];

const SUPER_ADMIN_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"users.delete",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"tools.delete",
	"categories.delete",
	"promotions.delete",
	"attributes.delete",
	"shipping.manage",
];

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

// As duas cópias em texto da lista de exclusivos que agentes leem antes do código.
const EXCLUSIVE_LIST_DOCS = [
	{ doc: "CLAUDE.md", marker: "exclusivos de `super_admin`" },
	{
		doc: "docs/adr/0016-religacao-gates-3-niveis-filial.md",
		marker: "Exclusivo de super_admin",
	},
];

const BACKTICK_NAME = /`([^`]+)`/g;

describe("registry de capabilities", () => {
	it("toda key tem metadata completa", () => {
		for (const [key, meta] of Object.entries(CAPABILITIES)) {
			expect(meta.group, key).toBeTruthy();
			expect(meta.resource, key).toBeTruthy();
			expect(meta.action, key).toBeTruthy();
			expect(meta.description, key).toBeTruthy();
			expect(meta.defaultRoles.length, key).toBeGreaterThan(0);
		}
	});

	it("super_admin recebe TODAS as capabilities por default", () => {
		const superCaps = roleDefaultCapabilities("super_admin");
		expect(superCaps.size).toBe(Object.keys(CAPABILITIES).length);
	});

	it("user default == OPERATIONAL_USER (mais nada)", () => {
		const userCaps = roleDefaultCapabilities("user");
		expect([...userCaps].sort()).toEqual([...OPERATIONAL_USER].sort());
	});

	it("admin default == tudo menos os exclusivos de super_admin", () => {
		const adminCaps = roleDefaultCapabilities("admin");

		for (const c of SUPER_ADMIN_EXCLUSIVE) {
			expect(adminCaps.has(c), `admin não deve ter ${c}`).toBe(false);
		}

		for (const key of ALL_CAPABILITIES) {
			if (!SUPER_ADMIN_EXCLUSIVE.includes(key)) {
				expect(adminCaps.has(key), `admin deve ter ${key}`).toBe(true);
			}
		}
	});

	it("SUPER_ADMIN_EXCLUSIVE == caps com defaultRoles só super_admin", () => {
		const onlySuper = ALL_CAPABILITIES.filter((key) => {
			const roles = CAPABILITIES[key].defaultRoles;

			return roles.length === 1 && roles[0] === "super_admin";
		});

		expect(onlySuper.sort()).toEqual([...SUPER_ADMIN_EXCLUSIVE].sort());
	});

	it.each(
		EXCLUSIVE_LIST_DOCS
	)("$doc lista os mesmos exclusivos de super_admin que o código", ({
		doc,
		marker,
	}) => {
		const text = readFileSync(path.resolve(REPO_ROOT, doc), "utf8");
		const line = text.split("\n").find((l) => l.includes(marker));
		expect(line, `${doc}: linha com "${marker}" sumiu`).toBeDefined();

		const listed = new Set<Capability>();

		for (const [, name = ""] of (line ?? "").matchAll(BACKTICK_NAME)) {
			if (isCapability(name)) {
				listed.add(name);
			}
		}

		const missing = SUPER_ADMIN_EXCLUSIVE.filter((c) => !listed.has(c));
		const extra = [...listed].filter((c) => !SUPER_ADMIN_EXCLUSIVE.includes(c));
		expect({ missing, extra }, `${doc} diverge de capabilities.ts`).toEqual({
			missing: [],
			extra: [],
		});
	});

	it("admin mantém as caps que mudaram de nível na matriz operacional do user", () => {
		// suppliers.manage migrou SA→SAU; customers/reviews/promotions
		// migraram SAU→SA. admin permanece com todas — regressão explícita da feature
		// do role user (o loop acima cobre isso só implicitamente).
		const adminCaps = roleDefaultCapabilities("admin");

		for (const c of [
			"suppliers.manage",
			"customers.read",
			"reviews.read",
			"promotions.read",
		] as const) {
			expect(adminCaps.has(c), `admin deve manter ${c}`).toBe(true);
		}
	});

	it("isCapability discrimina keys válidas", () => {
		expect(isCapability("tools.read")).toBe(true);
		expect(isCapability("inexistente.foo")).toBe(false);
	});
});

describe("seções de navegação (redesign permissões)", () => {
	it("mapeia cada recurso para a seção da sidebar", () => {
		expect(sectionForCapability("orders.read")).toBe("Operação");
		expect(sectionForCapability("branches.manage")).toBe("Operação");
		expect(sectionForCapability("tools.create")).toBe("Catálogo");
		expect(sectionForCapability("stock.adjust")).toBe("Catálogo");
		expect(sectionForCapability("reviews.moderate")).toBe("Relacionamento");
		expect(sectionForCapability("promotions.manage")).toBe("Relacionamento");
		expect(sectionForCapability("site.update_settings")).toBe("Sistema");
		expect(sectionForCapability("permissions.manage")).toBe("Administração");
		expect(sectionForCapability("audit.read")).toBe("Administração");
	});

	it("toda capability tem uma seção em SECTION_ORDER", () => {
		for (const cap of ALL_CAPABILITIES) {
			expect(SECTION_ORDER).toContain(sectionForCapability(cap));
		}
	});
});

describe("branches.read — admin-only", () => {
	it("user NÃO tem branches.read", () => {
		expect(roleDefaultCapabilities("user").has("branches.read")).toBe(false);
	});
	it("admin e super_admin têm branches.read", () => {
		expect(roleDefaultCapabilities("admin").has("branches.read")).toBe(true);
		expect(roleDefaultCapabilities("super_admin").has("branches.read")).toBe(
			true
		);
	});
});
