"use client";

import { useCallback, useState } from "react";
import type { ToolFormValues } from "./tool-schema";

export type ToolFormState = Omit<
	ToolFormValues,
	"weightKg" | "lengthCm" | "widthCm" | "heightCm" | "packagingWeightKg"
> & {
	weightKg?: number;
	lengthCm?: number;
	widthCm?: number;
	heightCm?: number;
	packagingWeightKg?: number;
};

export type ToolPatch = (
	next:
		| Partial<ToolFormState>
		| ((prev: ToolFormState) => Partial<ToolFormState>)
) => void;

export const EMPTY_TOOL_VALUES: ToolFormState = {
	name: "",
	description: "",
	model: "",
	invoiceModel: "",
	manufacturerName: "",
	status: "draft",
	hsCode: "",
	ncm: "",
	cest: "",
	powerWatts: undefined,
	weightKg: undefined,
	lengthCm: undefined,
	widthCm: undefined,
	heightCm: undefined,
	packagingWeightKg: undefined,
	stackable: true,
	shipsInOwnBox: false,
	uprightOnly: false,
	categoryIds: [],
	primaryCategoryId: "",
	visibleOnSite: true,
	images: [],
	videoUrl: null,
	videoPosterUrl: null,
	variants: [
		{
			sku: "",
			barcode: "",
			voltage: "",
			priceAmount: 0,
			isDefault: true,
			sortOrder: 0,
		},
	],
	attributeValues: {},
	attributeAssignments: [],
};

export function useToolFormState(defaultValues: Partial<ToolFormState>) {
	const [values, setValues] = useState<ToolFormState>(() => ({
		...EMPTY_TOOL_VALUES,
		...defaultValues,
		variants:
			defaultValues.variants && defaultValues.variants.length > 0
				? defaultValues.variants
				: EMPTY_TOOL_VALUES.variants,
		attributeValues: defaultValues.attributeValues ?? {},
		attributeAssignments: defaultValues.attributeAssignments ?? [],
	}));
	const [errors, setErrors] = useState<
		Partial<Record<keyof ToolFormValues, string>>
	>({});

	const patch = useCallback<ToolPatch>((next) => {
		setValues((prev) => ({
			...prev,
			...(typeof next === "function" ? next(prev) : next),
		}));
	}, []);

	return { values, setValues, patch, errors, setErrors };
}
