export interface Mask<T> {
	format: (raw: T | undefined) => string;
	inputMode: "decimal" | "numeric" | "text";
	maxLength?: number;
	parse: (display: string) => T | undefined;
	placeholder: string;
	sanitize: (display: string) => string;
}

// biome-ignore lint/performance/noBarrelFile: pasta de máscaras intencionalmente reexporta para import ergonômico
export { cestMask } from "./cest";
export { brlMask } from "./currency-brl";
export { decimalMask } from "./decimal";
export { hsCodeMask } from "./hs-code";
export { integerMask } from "./integer";
export { ncmMask } from "./ncm";
export { percentageMask } from "./percentage";
export { skuMask } from "./sku";
