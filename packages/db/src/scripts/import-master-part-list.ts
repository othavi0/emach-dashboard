/**
 * Imports tools from the Master Part List XLSX into the database.
 *
 * Usage:
 *   bun run packages/db/src/scripts/import-master-part-list.ts <path-to-xlsx> [--dry-run]
 *
 * Expected columns (row 1 header):
 *   Item | Code | Model | INVOICE Model | English Description |
 *   Portuguese Description | Unity | HS Code (Invoice) | NCM Brazil | Código CEST
 *
 * Upsert key: sku (unique). SAMPLES rows (shared code) get sku =
 * `SAMPLES-<invoiceModel>`. Repeated (sku,invoiceModel) pairs are treated as
 * re-imports and update the existing row idempotently.
 */

import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import * as XLSX from "xlsx";

import { type ProductType, tool } from "../schema/tools";

type Row = {
	item?: string | number;
	code?: string;
	model?: string;
	invoiceModel?: string;
	descriptionEn?: string;
	descriptionPt?: string;
	unity?: string;
	hsCode?: string;
	ncm?: string;
	cest?: string;
};

const HEADER_MAP: Record<string, keyof Row> = {
	Item: "item",
	Code: "code",
	Model: "model",
	"INVOICE\nModel": "invoiceModel",
	"INVOICE Model": "invoiceModel",
	"English Description": "descriptionEn",
	"Portuguese Description": "descriptionPt",
	Unity: "unity",
	"HS Code\n(Invoice)": "hsCode",
	"HS Code (Invoice)": "hsCode",
	"NCM Brazil": "ncm",
	"Código CEST": "cest",
};

function cleanText(v: unknown): string | undefined {
	if (v === null || v === undefined) return undefined;
	const s = String(v).trim();
	if (!s || s.toUpperCase() === "NA" || s === "-") return undefined;
	return s;
}

function parseUnity(v: string | undefined): ProductType | undefined {
	if (!v) return undefined;
	const s = v.trim().toLowerCase();
	if (s === "machine") return "machine";
	if (s === "equipment") return "equipment";
	if (s === "part") return "part";
	if (s === "accessory" || s === "acessorio" || s === "acessório") {
		return "accessory";
	}
	return undefined;
}

function slugify(s: string): string {
	return s
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function deriveVoltage(invoiceModel: string | undefined): string | undefined {
	if (!invoiceModel) return undefined;
	const match = invoiceModel.match(/(\d{2,3})\s*V\b/i);
	return match ? `${match[1]}V` : undefined;
}

function readRows(xlsxPath: string): Row[] {
	const buf = readFileSync(xlsxPath);
	const wb = XLSX.read(buf, { type: "buffer" });
	const firstSheet = wb.Sheets[wb.SheetNames[0] ?? ""];
	if (!firstSheet) throw new Error("Workbook has no sheets");

	const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
		defval: "",
		raw: true,
	});

	return raw.map((r) => {
		const out: Row = {};
		for (const [header, value] of Object.entries(r)) {
			const key = HEADER_MAP[header] ?? HEADER_MAP[header.replace(/\s+/g, " ")];
			if (!key) continue;
			(out as Record<string, unknown>)[key] = value;
		}
		return out;
	});
}

type ImportResult = {
	processed: number;
	inserted: number;
	updated: number;
	skipped: { row: number; reason: string }[];
};

async function runImport(xlsxPath: string, dryRun: boolean): Promise<ImportResult> {
	const rows = readRows(xlsxPath);
	const result: ImportResult = {
		processed: 0,
		inserted: 0,
		updated: 0,
		skipped: [],
	};

	const db = dryRun ? null : (await import("../index")).db;

	for (let i = 0; i < rows.length; i++) {
		const r = rows[i];
		if (!r) continue;
		result.processed++;
		const rowNum = i + 2; // accounting for header row

		const code = cleanText(r.code);
		const invoiceModel = cleanText(r.invoiceModel);
		const descriptionPt = cleanText(r.descriptionPt);
		const model = cleanText(r.model);

		if (!invoiceModel) {
			result.skipped.push({ row: rowNum, reason: "missing invoiceModel" });
			continue;
		}
		if (!descriptionPt) {
			result.skipped.push({ row: rowNum, reason: "missing PT description" });
			continue;
		}

		const isSample = code?.toUpperCase() === "SAMPLES";
		const sku = isSample ? `SAMPLES-${invoiceModel}` : code;
		if (!sku) {
			result.skipped.push({ row: rowNum, reason: "missing sku" });
			continue;
		}

		const values = {
			id: crypto.randomUUID(),
			name: descriptionPt,
			description: null,
			slug: slugify(`${model ?? descriptionPt}-${invoiceModel}`),
			sku,
			model: model ?? null,
			invoiceModel,
			productType: parseUnity(r.unity) ?? null,
			status: "draft" as const,
			voltage: deriveVoltage(invoiceModel) ?? null,
			hsCode: cleanText(r.hsCode) ?? null,
			ncm: cleanText(r.ncm) ?? null,
			cest: cleanText(r.cest) ?? null,
			visibleOnSite: false,
		};

		if (dryRun || !db) {
			console.log(`[dry-run] row ${rowNum}:`, {
				invoiceModel: values.invoiceModel,
				sku: values.sku,
				model: values.model,
				productType: values.productType,
				voltage: values.voltage,
			});
			continue;
		}

		const existing = await db
			.select({ id: tool.id })
			.from(tool)
			.where(sql`${tool.sku} = ${sku}`)
			.limit(1);

		if (existing.length > 0) {
			await db
				.update(tool)
				.set({
					name: values.name,
					model: values.model,
					invoiceModel: values.invoiceModel,
					productType: values.productType,
					voltage: values.voltage,
					hsCode: values.hsCode,
					ncm: values.ncm,
					cest: values.cest,
				})
				.where(sql`${tool.sku} = ${sku}`);
			result.updated++;
		} else {
			await db.insert(tool).values(values);
			result.inserted++;
		}
	}

	return result;
}

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const xlsxPath = args.find((a) => !a.startsWith("--"));
	const dryRun = args.includes("--dry-run");

	if (!xlsxPath) {
		console.error("Usage: bun run import-master-part-list.ts <xlsx-path> [--dry-run]");
		process.exit(1);
	}

	const result = await runImport(xlsxPath, dryRun);
	console.log("\n=== Import result ===");
	console.log(`Processed: ${result.processed}`);
	console.log(`Inserted:  ${result.inserted}`);
	console.log(`Updated:   ${result.updated}`);
	console.log(`Skipped:   ${result.skipped.length}`);
	for (const s of result.skipped) {
		console.log(`  row ${s.row}: ${s.reason}`);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
