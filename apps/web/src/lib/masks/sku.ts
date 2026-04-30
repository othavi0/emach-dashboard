import type { Mask } from "./index";

function sanitizeSku(display: string): string {
	return display
		.toUpperCase()
		.replace(/\s+/g, "-")
		.replace(/[^A-Z0-9-]/g, "")
		.replace(/-{2,}/g, "-");
}

export const skuMask: Mask<string> = {
	format: (raw) => raw ?? "",
	parse: (display) => {
		const cleaned = sanitizeSku(display);
		return cleaned ? cleaned : undefined;
	},
	sanitize: sanitizeSku,
	inputMode: "text",
	placeholder: "FUR-700-127",
};
