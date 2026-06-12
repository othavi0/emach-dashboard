import type { ToolDetailAttribute } from "./tool-detail-data";

export type FixedSpecKey = "weightKg" | "powerWatts";

export interface SpecDivergences {
	attributeSlugs: Set<string>;
	fixed: Set<FixedSpecKey>;
}

interface FixedSpecInput {
	powerWatts: number | null;
	weightKg: string | null;
}

const PAIRS: { key: FixedSpecKey; unit: string }[] = [
	{ key: "weightKg", unit: "kg" },
	{ key: "powerWatts", unit: "W" },
];

export function detectSpecDivergences(
	tool: FixedSpecInput,
	attributes: ToolDetailAttribute[]
): SpecDivergences {
	const fixed = new Set<FixedSpecKey>();
	const attributeSlugs = new Set<string>();

	for (const pair of PAIRS) {
		const fixedRaw = pair.key === "weightKg" ? tool.weightKg : tool.powerWatts;
		if (fixedRaw === null) {
			continue;
		}
		const fixedValue = Number(fixedRaw);
		for (const a of attributes) {
			if (
				a.unit === pair.unit &&
				a.valueNumeric !== null &&
				a.valueNumeric !== fixedValue
			) {
				fixed.add(pair.key);
				attributeSlugs.add(a.slug);
			}
		}
	}

	return { fixed, attributeSlugs };
}
