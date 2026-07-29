"use client";

import { type RendererBanner, renderElement } from "./composition-renderer";
// Pilha segura mobile (Task 12): elementos sem override de posição no mobile
// empilham a partir do terço inferior do banner, na ordem recebida
// (SAFE_STACK_ORDER via partitionMobileElements). Reusa o conteúdo puro de
// cada elemento via renderElement — zero duplicação de markup com o
// posicionamento absoluto do desktop/overrides mobile.
import type { ElementKey } from "./composition-schema";

export function SafeStack({
	banner,
	keys,
	productUrl,
}: {
	banner: RendererBanner;
	keys: ElementKey[];
	productUrl: string | null;
}) {
	return (
		<div className="absolute inset-x-[5%] bottom-[16%] flex flex-col items-start gap-3">
			{keys.map((key) => {
				if (key === "product") {
					const content = renderElement(key, banner, productUrl);
					if (content === null) {
						return null;
					}
					return (
						<div className="relative h-[38%] w-[82%] self-center" key={key}>
							{content}
						</div>
					);
				}
				if (key === "cta") {
					const content = renderElement(key, banner, productUrl, {
						display: "flex",
						justifyContent: "center",
						width: "100%",
					});
					if (content === null) {
						return null;
					}
					return (
						<div className="w-full" key={key}>
							{content}
						</div>
					);
				}
				const content = renderElement(key, banner, productUrl);
				if (content === null) {
					return null;
				}
				return <div key={key}>{content}</div>;
			})}
		</div>
	);
}
