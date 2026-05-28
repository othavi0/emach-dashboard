export const SIDEBAR_COOKIE_NAME = "sidebar_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

/** Parse do header Cookie (server) ou document.cookie (client). */
export function parseSidebarCookie(cookieHeader: string | undefined): boolean {
	if (!cookieHeader) {
		return true;
	}
	const match = cookieHeader
		.split(";")
		.map((c) => c.trim())
		.find((c) => c.startsWith(`${SIDEBAR_COOKIE_NAME}=`));
	if (!match) {
		return true;
	}
	return match.split("=")[1] !== "false";
}

/** Escreve o cookie no client. */
export function writeSidebarCookie(open: boolean): void {
	if (typeof document === "undefined") {
		return;
	}
	document.cookie = `${SIDEBAR_COOKIE_NAME}=${open}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
}
