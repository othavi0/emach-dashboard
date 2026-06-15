"use client";

import { cn } from "@emach/ui/lib/utils";
import { BANNER_CTA_VARIANTS, type BannerCtaVariant } from "./banner-schema";

const SWATCH: Record<BannerCtaVariant, string> = {
	red: "bg-[#e60012] text-white",
	dark: "border border-white bg-[#181818] text-white",
	white: "bg-white text-[#181818]",
	ghost: "border border-white bg-transparent text-white",
};
const LABELS: Record<BannerCtaVariant, string> = {
	red: "Vermelho",
	dark: "Escuro",
	white: "Branco",
	ghost: "Contorno",
};

export function CtaVariantPicker({
	value,
	onChange,
}: {
	value: BannerCtaVariant;
	onChange: (v: BannerCtaVariant) => void;
}) {
	return (
		<div className="grid grid-cols-4 gap-2">
			{BANNER_CTA_VARIANTS.map((variant) => (
				<button
					className={cn(
						"rounded-lg border p-2 text-center transition-colors",
						value === variant
							? "border-primary"
							: "border-border hover:border-border/60"
					)}
					key={variant}
					onClick={() => onChange(variant)}
					type="button"
				>
					<span
						className={cn(
							"mb-1 inline-block rounded-sm px-3 py-1 font-bold text-[10px]",
							SWATCH[variant]
						)}
					>
						Botão
					</span>
					<span className="block text-[10px] text-muted-foreground">
						{LABELS[variant]}
					</span>
				</button>
			))}
		</div>
	);
}
