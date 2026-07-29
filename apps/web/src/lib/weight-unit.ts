import { formatMeasure } from "@/lib/format/number";

export type WeightUnit = "kg" | "g";

/** Converte o valor canônico (kg) pro número exibido na unidade escolhida. */
export function kgToDisplay(
	kg: number | undefined,
	unit: WeightUnit
): number | undefined {
	if (kg === undefined) {
		return;
	}
	return unit === "g" ? Math.round(kg * 1000) : kg;
}

/** Converte o número digitado de volta pra kg, a 3 casas (resolução do banco: 1 g). */
export function displayToKg(
	n: number | undefined,
	unit: WeightUnit
): number | undefined {
	if (n === undefined) {
		return;
	}
	return unit === "g" ? Math.round(n) / 1000 : Math.round(n * 1000) / 1000;
}

/** Peso existente sub-kg abre em gramas; senão a unidade default do campo. */
export function initialUnit(
	kg: number | undefined,
	fallback: WeightUnit
): WeightUnit {
	return kg !== undefined && kg > 0 && kg < 1 ? "g" : fallback;
}

/** Equivalente na outra unidade, quando ajuda a conferir a grandeza. */
export function conversionHint(
	kg: number | undefined,
	unit: WeightUnit
): string | null {
	if (kg === undefined || kg <= 0) {
		return null;
	}
	if (unit === "g") {
		return `= ${formatMeasure(kg)} kg`;
	}
	return kg < 1 ? `= ${formatMeasure(Math.round(kg * 1000))} g` : null;
}
