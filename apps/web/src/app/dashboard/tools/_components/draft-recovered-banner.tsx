"use client";

import { Button } from "@emach/ui/components/button";
import { History } from "lucide-react";

export function DraftRecoveredBanner({ onDiscard }: { onDiscard: () => void }) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted px-3 py-2">
			<span className="flex items-center gap-2 text-muted-foreground text-xs">
				<History aria-hidden className="size-3.5" />
				Rascunho recuperado — continuamos de onde você parou.
			</span>
			<Button onClick={onDiscard} size="sm" type="button" variant="ghost">
				Descartar
			</Button>
		</div>
	);
}
