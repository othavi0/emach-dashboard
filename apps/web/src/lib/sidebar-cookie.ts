// Deve casar com o nome escrito por packages/ui/src/components/sidebar.tsx
// (componente vendored shadcn que não pode importar deste módulo).
export const SIDEBAR_COOKIE_NAME = "sidebar_state";

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
