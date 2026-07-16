import { formatMeasure } from "@/lib/format/number";
import type { ToolDetailAttribute, ToolDetailRow } from "./tool-detail-data";

export interface SpecCandidate {
	key: string;
	label: string;
	mono?: boolean;
	value: string | null;
}

export interface PartitionedRows {
	emptyLabels: string[];
	rows: SpecCandidate[];
	total: number;
}

export function partitionRows(candidates: SpecCandidate[]): PartitionedRows {
	const rows: SpecCandidate[] = [];
	const emptyLabels: string[] = [];
	for (const c of candidates) {
		if (c.value === null) {
			emptyLabels.push(c.label);
		} else {
			rows.push(c);
		}
	}
	return { rows, emptyLabels, total: candidates.length };
}

// weightKg/lengthCm/widthCm/heightCm são `.notNull()` no schema (`packages/db/src/schema/tools.ts`),
// mas os CHECK constraints do banco ("IS NULL OR ... >= 0") e o consumo pré-existente em
// tool-specs.tsx tratam esses campos como potencialmente ausentes — sobrescrevemos a
// nulabilidade aqui em vez de herdar `string` estrito do Pick<>. Um ToolDetailRow real
// (campos `string`) continua atribuível, pois `string` é subtipo de `string | null`.
export type PhysicalSpecSource = Pick<
	ToolDetailRow,
	"model" | "invoiceModel" | "manufacturerName" | "powerWatts"
> & {
	heightCm: string | null;
	lengthCm: string | null;
	weightKg: string | null;
	widthCm: string | null;
};

export function physicalCandidates(tool: PhysicalSpecSource): SpecCandidate[] {
	const dimensions =
		tool.lengthCm !== null && tool.widthCm !== null && tool.heightCm !== null
			? `${formatMeasure(tool.lengthCm, 2) ?? "?"} × ${formatMeasure(tool.widthCm, 2) ?? "?"} × ${formatMeasure(tool.heightCm, 2) ?? "?"} cm`
			: null;
	return [
		{ key: "model", label: "Modelo", mono: true, value: tool.model },
		{
			key: "invoiceModel",
			label: "Modelo NF",
			mono: true,
			value: tool.invoiceModel,
		},
		{ key: "manufacturer", label: "Fabricante", value: tool.manufacturerName },
		{
			key: "powerWatts",
			label: "Potência",
			value: tool.powerWatts === null ? null : `${tool.powerWatts} W`,
		},
		{
			key: "weightKg",
			label: "Peso",
			value:
				tool.weightKg === null
					? null
					: `${formatMeasure(tool.weightKg) ?? "—"} kg`,
		},
		{ key: "dimensions", label: "Dimensões", value: dimensions },
	];
}

export type FiscalSpecSource = Pick<ToolDetailRow, "hsCode" | "ncm" | "cest">;

export function fiscalCandidates(tool: FiscalSpecSource): SpecCandidate[] {
	return [
		{ key: "hsCode", label: "HS Code", mono: true, value: tool.hsCode },
		{ key: "ncm", label: "NCM", mono: true, value: tool.ncm },
		{ key: "cest", label: "CEST", mono: true, value: tool.cest },
	];
}

export function isAttributeFilled(attr: ToolDetailAttribute): boolean {
	switch (attr.inputType) {
		case "boolean":
			return attr.valueBool !== null;
		case "number":
			return attr.valueNumeric !== null;
		case "numeric_range":
			return attr.valueNumeric !== null || attr.valueNumericMax !== null;
		default:
			return (attr.valueText ?? "").trim() !== "";
	}
}
