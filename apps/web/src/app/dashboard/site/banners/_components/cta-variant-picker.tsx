"use client";

import { cn } from "@emach/ui/lib/utils";
import { BANNER_CTA_VARIANTS, type BannerCtaVariant } from "./banner-schema";
import { CTA_BASE, CTA_VARIANT_CLASS } from "./cta-variant-class";

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
					<span className="mb-1 flex items-center justify-center rounded-md bg-[#0b0a09] px-3 py-2">
						<span
							className={cn(
								"inline-block px-3 py-1 text-[10px]",
								CTA_BASE,
								CTA_VARIANT_CLASS[variant]
							)}
						>
							Botão
						</span>
					</span>
					<span className="block text-[10px] text-muted-foreground">
						{LABELS[variant]}
					</span>
				</button>
			))}
		</div>
	);
}
