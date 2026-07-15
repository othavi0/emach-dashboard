"use client";

import { Button } from "@emach/ui/components/button";
import type { ReactNode } from "react";

export interface BulkAction {
	icon?: ReactNode;
	label: string;
	run: (ids: string[]) => void;
	variant?: "default" | "destructive" | "outline" | "secondary";
}

interface BulkActionBarProps {
	actions: BulkAction[];
	selectedIds: string[];
}

/**
 * Barra flutuante de ações em massa. Surge quando há ≥1 selecionado. As ações são
 * plugadas por listagem; cada uma recebe os IDs selecionados. Desmarcar/sair do
 * modo fica no SelectionToolbar — a barra não duplica esses controles.
 */
export function BulkActionBar({ actions, selectedIds }: BulkActionBarProps) {
	const count = selectedIds.length;
	return (
		<div className="sticky bottom-4 z-40 mt-4 flex items-center gap-4 rounded-xl border border-primary/60 bg-card px-4 py-3 shadow-lg">
			<span className="font-semibold text-foreground text-sm tabular-nums">
				{count} selecionado{count === 1 ? "" : "s"}
			</span>
			<div className="ml-auto flex items-center gap-2">
				{actions.map((action) => (
					<Button
						key={action.label}
						onClick={() => action.run(selectedIds)}
						size="sm"
						variant={action.variant ?? "secondary"}
					>
						{action.icon}
						{action.label}
					</Button>
				))}
			</div>
		</div>
	);
}
