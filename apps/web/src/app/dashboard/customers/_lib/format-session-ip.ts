const ALL_ZERO_IPV6 = /^(0{1,4}:){7}0{1,4}$/;

/** Normaliza o IP cru de `client_session.ip_address` para exibição. */
export function formatSessionIp(ip: string | null): string {
	if (!ip) {
		return "—";
	}
	const trimmed = ip.trim();
	if (
		trimmed === "::" ||
		trimmed === "::1" ||
		trimmed === "127.0.0.1" ||
		ALL_ZERO_IPV6.test(trimmed)
	) {
		return "Local";
	}
	return trimmed;
}
