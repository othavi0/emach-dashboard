import { describe, expect, it } from "vitest";
import { getSidebarProfileHref } from "../sidebar-footer-user";

describe("getSidebarProfileHref", () => {
	it("leva o item Perfil para a página do próprio usuário", () => {
		expect(getSidebarProfileHref("user_123")).toBe("/dashboard/users/user_123");
	});
});
