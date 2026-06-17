import type { BannerLayout } from "./banner-schema";

// Posições de produto / conteúdo / CTA por preset de layout.
// Fonte única consumida pelo preview ao vivo E pelo card da listagem —
// espelha o que o storefront (hero-carousel) deve renderizar (ver issue ecommerce#130).

// Bloco de conteúdo (título/badge/countdown).
export const CONTENT_POS: Record<BannerLayout, string> = {
	split: "left-[7%] bottom-[14%] items-start text-left",
	stack_left: "left-[7%] bottom-[14%] items-start text-left",
	center_bottom:
		"left-1/2 bottom-[14%] -translate-x-1/2 items-center text-center",
	center_mid:
		"left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 items-center text-center",
	center_cta_right: "left-[7%] top-1/2 -translate-y-1/2 items-start text-left",
	mirror_split: "right-[7%] top-1/2 -translate-y-1/2 items-end text-right",
	hero_center: "left-1/2 top-[10%] -translate-x-1/2 items-center text-center",
	text_right: "left-1/2 top-[10%] -translate-x-1/2 items-center text-center",
};

// Imagem do produto.
export const PRODUCT_POS: Record<BannerLayout, string> = {
	split: "top-1/2 right-[6%] -translate-y-1/2",
	stack_left: "top-1/2 right-[6%] -translate-y-1/2",
	center_bottom: "top-[8%] left-1/2 -translate-x-1/2",
	center_mid: "top-[8%] left-1/2 -translate-x-1/2",
	center_cta_right: "top-[8%] left-1/2 -translate-x-1/2",
	mirror_split: "top-1/2 left-[6%] -translate-y-1/2",
	hero_center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
	text_right: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
};

// Botão CTA.
export const CTA_POS: Record<BannerLayout, string> = {
	split: "right-[7%] bottom-[12%]",
	stack_left: "bottom-[6%] left-1/2 -translate-x-1/2",
	center_bottom: "bottom-[6%] left-1/2 -translate-x-1/2",
	center_mid: "bottom-[6%] left-1/2 -translate-x-1/2",
	center_cta_right: "right-[7%] bottom-[12%]",
	mirror_split: "right-[7%] bottom-[12%]",
	hero_center: "bottom-[6%] left-1/2 -translate-x-1/2",
	text_right: "right-[7%] bottom-[12%]",
};
