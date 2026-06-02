"use client";

import { Checkbox } from "@emach/ui/components/checkbox";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

interface SelectableItemProps {
	active: boolean;
	children: ReactNode;
	onToggle: () => void;
	selected: boolean;
}

/**
 * Envolve qualquer card de listagem para seleção em massa, sem reescrever o card.
 * No modo ativo, intercepta o clique no capture (cancela a navegação do <Link>/<a>
 * interno e o onClick de cards `div role=button`) e o transforma em toggle. O wrapper
 * é sempre o grid-item — só os handlers/ring/checkbox são condicionais —, então o card
 * nunca remonta ao ligar/desligar o modo.
 */
export function SelectableItem({
	active,
	selected,
	onToggle,
	children,
}: SelectableItemProps) {
	function handleClickCapture(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		onToggle();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === " " || e.key === "Enter") {
			e.preventDefault();
			onToggle();
		}
	}

	if (!active) {
		return <div className="relative rounded-[10px]">{children}</div>;
	}

	return (
		<div
			aria-pressed={selected}
			className={`relative rounded-[10px] ${selected ? "ring-2 ring-primary" : ""}`}
			onClickCapture={handleClickCapture}
			onKeyDown={handleKeyDown}
			role="button"
			tabIndex={0}
		>
			<span className="absolute top-2 left-2 z-10 rounded-[5px] bg-card/90 p-1 shadow-sm backdrop-blur-sm">
				<Checkbox checked={selected} className="pointer-events-none" />
			</span>
			{children}
		</div>
	);
}
