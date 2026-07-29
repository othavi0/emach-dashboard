"use client";

// Pilha segura mobile (Task 12): elementos sem override de posição no mobile
// empilham a partir do terço inferior do banner, na ordem recebida
// (SAFE_STACK_ORDER via partitionMobileElements). Reusa o conteúdo puro de
// cada elemento via renderElement — zero duplicação de markup com o
// posicionamento absoluto do desktop/overrides mobile. Importa de
// element-renders (não de composition-renderer) pra não formar ciclo — fix
// round 1 do review da Task 12.
//
// Task 13: cada item da pilha é arrastável — onPointerDown despacha o mesmo
// handler do editor-canvas (drag em elemento herdado cria override mobile,
// já resolvido pelo reducer da Task 9). `data-inherited` + `cursor-grab`
// marcam visualmente que o elemento ainda vem da pilha (sem override).
import { cn } from "@emach/ui/lib/utils";
import type { PointerEvent } from "react";
import type { ElementKey } from "./composition-schema";
import { type RendererBanner, renderElement } from "./element-renders";

type OnElementPointerDown = (key: ElementKey, e: PointerEvent) => void;

export function SafeStack({
	banner,
	keys,
	productUrl,
	selected,
	onElementPointerDown,
}: {
	banner: RendererBanner;
	keys: ElementKey[];
	productUrl: string | null;
	selected?: ElementKey | "background" | null;
	onElementPointerDown?: OnElementPointerDown;
}) {
	function itemClassName(key: ElementKey, extra?: string) {
		return cn(
			"cursor-grab",
			selected === key && "outline outline-2 outline-primary outline-offset-4",
			extra
		);
	}

	return (
		<div className="absolute inset-x-[5%] bottom-[16%] flex flex-col items-start gap-3">
			{keys.map((key) => {
				if (key === "product") {
					const content = renderElement(key, banner, productUrl);
					if (content === null) {
						return null;
					}
					return (
						<div
							className={itemClassName(
								key,
								"relative h-[38%] w-[82%] self-center"
							)}
							data-element={key}
							data-inherited="true"
							key={key}
							onPointerDown={(e) => onElementPointerDown?.(key, e)}
						>
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
						<div
							className={itemClassName(key, "w-full")}
							data-element={key}
							data-inherited="true"
							key={key}
							onPointerDown={(e) => onElementPointerDown?.(key, e)}
						>
							{content}
						</div>
					);
				}
				const content = renderElement(key, banner, productUrl);
				if (content === null) {
					return null;
				}
				return (
					<div
						className={itemClassName(key)}
						data-element={key}
						data-inherited="true"
						key={key}
						onPointerDown={(e) => onElementPointerDown?.(key, e)}
					>
						{content}
					</div>
				);
			})}
		</div>
	);
}
