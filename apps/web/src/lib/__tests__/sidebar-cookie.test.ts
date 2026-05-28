import { describe, expect, it } from "vitest";
import { parseSidebarCookie, SIDEBAR_COOKIE_NAME } from "../sidebar-cookie";

describe("parseSidebarCookie", () => {
	it("retorna true quando cookie ausente (default aberto)", () => {
		expect(parseSidebarCookie(undefined)).toBe(true);
	});
	it("retorna false quando cookie = 'false'", () => {
		expect(parseSidebarCookie(`${SIDEBAR_COOKIE_NAME}=false`)).toBe(false);
	});
	it("retorna true quando cookie = 'true'", () => {
		expect(parseSidebarCookie(`x=1; ${SIDEBAR_COOKIE_NAME}=true; y=2`)).toBe(
			true
		);
	});
});
