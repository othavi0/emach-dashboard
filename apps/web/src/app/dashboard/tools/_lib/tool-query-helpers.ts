import type { AttributeDefinition } from "@emach/db/schema/attributes";
import type { toolVariant } from "@emach/db/schema/tools";
import type {
	AttributeValueInput,
	ToolFormValues,
	ToolVariantInput,
} from "../_components/tool-schema";

export function toNumericString(
	value: number | null | undefined
): string | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return value.toFixed(2);
}

export function toInt(value: number | undefined): number | null {
	if (typeof value !== "number" || Number.isNaN(value)) {
		return null;
	}
	return Math.trunc(value);
}

export function nullableText(value: string | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export function normalizeToolPayload(input: ToolFormValues) {
	return {
		name: input.name,
		description: nullableText(input.description),
		model: nullableText(input.model),
		invoiceModel: nullableText(input.invoiceModel),
		manufacturerName: nullableText(input.manufacturerName),
		status: input.status,
		hsCode: nullableText(input.hsCode),
		ncm: nullableText(input.ncm),
		cest: nullableText(input.cest),
		powerWatts: toInt(input.powerWatts),
		weightKg: input.weightKg.toFixed(3),
		lengthCm: input.lengthCm.toFixed(2),
		widthCm: input.widthCm.toFixed(2),
		heightCm: input.heightCm.toFixed(2),
		overweightShippingAmount: toNumericString(input.overweightShippingAmount),
		visibleOnSite: input.visibleOnSite,
		videoUrl: input.videoUrl,
		videoPosterUrl: input.videoPosterUrl,
	};
}

export function normalizeVariantValues(
	v: ToolVariantInput
): Omit<typeof toolVariant.$inferInsert, "id" | "toolId"> {
	return {
		sku: v.sku.trim(),
		voltage: v.voltage ? v.voltage : null,
		priceAmount: v.priceAmount.toFixed(2),
		isDefault: v.isDefault,
		sortOrder: v.sortOrder,
	};
}

export function attributeValueRow(
	def: AttributeDefinition,
	input: AttributeValueInput
): {
	valueText: string | null;
	valueNumeric: string | null;
	valueNumericMax: string | null;
	valueBool: boolean | null;
} | null {
	if (!input) {
		return null;
	}
	const num = (n: number | null | undefined) =>
		typeof n === "number" && !Number.isNaN(n) ? n.toString() : null;
	switch (def.inputType) {
		case "text":
			return input.valueText?.trim()
				? {
						valueText: input.valueText.trim(),
						valueNumeric: null,
						valueNumericMax: null,
						valueBool: null,
					}
				: null;
		case "number":
			return typeof input.valueNumeric === "number" &&
				!Number.isNaN(input.valueNumeric)
				? {
						valueText: null,
						valueNumeric: num(input.valueNumeric),
						valueNumericMax: null,
						valueBool: null,
					}
				: null;
		case "boolean":
			return typeof input.valueBool === "boolean"
				? {
						valueText: null,
						valueNumeric: null,
						valueNumericMax: null,
						valueBool: input.valueBool,
					}
				: null;
		case "select":
		case "color":
			return input.valueText?.trim()
				? {
						valueText: input.valueText.trim(),
						valueNumeric: null,
						valueNumericMax: null,
						valueBool: null,
					}
				: null;
		case "numeric_range":
			return typeof input.valueNumeric === "number" &&
				!Number.isNaN(input.valueNumeric)
				? {
						valueText: null,
						valueNumeric: num(input.valueNumeric),
						valueNumericMax: num(input.valueNumericMax ?? null),
						valueBool: null,
					}
				: null;
		default:
			return null;
	}
}
