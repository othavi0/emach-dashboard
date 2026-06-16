import { describe, expect, it } from "vitest";
import {
	CAPABILITIES,
	type Capability,
	isCapability,
	roleDefaultCapabilities,
	SECTION_ORDER,
	sectionForCapability,
} from "@/lib/capabilities";

// Tipadas como Capability[] de propósito: o compilador valida que cada string
// é uma key real do registry (pega typo na lista de regressão).
const LEGACY_USER: readonly Capability[] = [
	"tools.read",
	"categories.read",
	"suppliers.read",
	"branches.read",
	"stock.read",
	"promotions.read",
	"orders.read",
	"customers.read",
	"site.read",
	"reviews.read",
	"attributes.read",
	"stock.adjust",
	"orders.update_status",
	"orders.add_note",
];
const LEGACY_SUPER_EXCLUSIVE: readonly Capability[] = [
	"branches.manage",
	"users.delete",
	"site.update_banners",
	"site.update_settings",
	"site.publish_announcements",
	"tools.delete",
	"categories.delete",
	"promotions.delete",
	"attributes.delete",
];

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

	it("user default == LEGACY_USER (mais nada)", () => {
		const userCaps = roleDefaultCapabilities("user");
		expect([...userCaps].sort()).toEqual([...LEGACY_USER].sort());
	});

	it("admin default == tudo menos os exclusivos de super_admin", () => {
		const adminCaps = roleDefaultCapabilities("admin");
		for (const c of LEGACY_SUPER_EXCLUSIVE) {
			expect(adminCaps.has(c), `admin não deve ter ${c}`).toBe(false);
		}
		for (const key of Object.keys(CAPABILITIES) as Capability[]) {
			if (!LEGACY_SUPER_EXCLUSIVE.includes(key)) {
				expect(adminCaps.has(key), `admin deve ter ${key}`).toBe(true);
			}
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
		for (const cap of Object.keys(CAPABILITIES) as Capability[]) {
			expect(SECTION_ORDER).toContain(sectionForCapability(cap));
		}
	});
});
