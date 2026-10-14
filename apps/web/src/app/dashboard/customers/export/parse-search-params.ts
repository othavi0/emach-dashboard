export type RawSearchParams = Record<string, string | string[]>;

// Map em vez de objeto literal: `?__proto__=x` num `{}` lê e troca o protótipo.
export function parseSearchParams(
	searchParams: URLSearchParams
): RawSearchParams {
	const grouped = new Map<string, string | string[]>();

	for (const [k, v] of searchParams) {
		const existing = grouped.get(k);

		if (existing === undefined) {
			grouped.set(k, v);
		} else if (Array.isArray(existing)) {
			existing.push(v);
		} else {
			grouped.set(k, [existing, v]);
		}
	}

	return Object.fromEntries(grouped);
}
