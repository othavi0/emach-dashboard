import type { BannerCtaVariant } from "./banner-schema";

// Espelha CTA_VARIANT_MAP + EmachButton do emach-ecommerce (hero-carousel.tsx).
// Fonte de verdade real é o storefront; aqui é aproximação fiel via hex.
// Brand red = #da291c (Ferrari Red), near-black = #181818.
export const CTA_VARIANT_CLASS: Record<BannerCtaVariant, string> = {
	red: "bg-[#da291c] text-white",
	dark: "border border-white/25 bg-[#181818] text-white",
	white: "bg-white text-[#181818]",
	ghost: "border border-white/70 bg-transparent text-white",
};

// Forma + peso + tracking + fonte (Barlow) comuns do EmachButton real.
export const CTA_BASE =
	"rounded-[2px] font-[family-name:var(--font-barlow)] font-semibold tracking-[0.04em]";
