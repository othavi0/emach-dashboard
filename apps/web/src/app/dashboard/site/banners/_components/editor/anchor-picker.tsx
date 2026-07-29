"use client";

import { cn } from "@emach/ui/lib/utils";
import { ANCHORS, type Anchor9 } from "../composition/composition-schema";

// Nome PT de cada zona da grade 3×3 — usado como aria-label (grid genérico,
// reaproveitado por posição de elemento e ponto focal do fundo).
const ANCHOR_LABELS: Record<Anchor9, string> = {
	tl: "superior esquerda",
	tc: "superior centro",
	tr: "superior direita",
	ml: "meio esquerda",
	mc: "centro",
	mr: "meio direita",
	bl: "inferior esquerda",
	bc: "inferior centro",
	br: "inferior direita",
};

export function AnchorPicker({
	value,
	onChange,
}: {
	value: Anchor9;
	onChange: (a: Anchor9) => void;
}) {
	return (
		<div className="grid grid-cols-3 gap-1">
			{ANCHORS.map((anchor) => (
				<button
					aria-label={ANCHOR_LABELS[anchor]}
					aria-pressed={value === anchor}
					className={cn(
						"aspect-square rounded-md border transition-colors",
						value === anchor
							? "border-primary bg-primary"
							: "border-border bg-card hover:border-border/60"
					)}
					key={anchor}
					onClick={() => onChange(anchor)}
					type="button"
				/>
			))}
		</div>
	);
}
