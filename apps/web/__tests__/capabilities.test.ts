import { describe, expect, it } from "vitest";
import {
	CAPABILITIES,
	isCapability,
	roleDefaultCapabilities,
} from "@/lib/capabilities";

const LEGACY_USER: readonly string[] = [
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
const LEGACY_SUPER_EXCLUSIVE: readonly string[] = [
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
			expect(adminCaps.has(c as never), `admin não deve ter ${c}`).toBe(false);
		}
		for (const key of Object.keys(CAPABILITIES)) {
			if (!LEGACY_SUPER_EXCLUSIVE.includes(key)) {
				expect(adminCaps.has(key as never), `admin deve ter ${key}`).toBe(true);
			}
		}
	});

	it("manager é alias de admin", () => {
		expect([...roleDefaultCapabilities("manager")].sort()).toEqual(
			[...roleDefaultCapabilities("admin")].sort()
		);
	});

	it("isCapability discrimina keys válidas", () => {
		expect(isCapability("tools.read")).toBe(true);
		expect(isCapability("inexistente.foo")).toBe(false);
	});
});
