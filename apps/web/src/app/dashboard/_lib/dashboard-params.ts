export function parseBranchParam(
	value: string | string[] | undefined
): string | null {
	const v = Array.isArray(value) ? value[0] : value;
	if (!v || v === "all") {
		return null;
	}
	return v;
}
