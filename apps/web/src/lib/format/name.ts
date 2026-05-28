/**
 * Iniciais para avatares: primeira + última palavra do nome, uppercase.
 * Retorna "?" quando o nome é vazio/só espaços.
 */
export function getInitials(name: string): string {
	const parts = name.split(" ").filter(Boolean);
	if (parts.length === 0) {
		return "?";
	}
	const first = parts[0]?.[0]?.toUpperCase() ?? "";
	const last = parts.length > 1 ? (parts.at(-1)?.[0]?.toUpperCase() ?? "") : "";
	return first + last || "?";
}
