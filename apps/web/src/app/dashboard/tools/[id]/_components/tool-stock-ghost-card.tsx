"use client";

import { getInitials } from "@/lib/format/name";
import type { ToolDetailBranch } from "../_lib/tool-detail-data";

interface ToolStockGhostCardProps {
	branch: ToolDetailBranch;
	onSelect: (branch: ToolDetailBranch) => void;
}

/**
 * Filial ainda sem stock_level pra variante — afford de primeira entrada.
 * Receita do "tile de adicionar" (galeria de imagens / banners): dashed +
 * muted, acende no hover. O clique abre a sheet em modo Entrada; o vínculo
 * nasce no servidor (insert lazy do applyMovement).
 */
export function ToolStockGhostCard({
	branch,
	onSelect,
}: ToolStockGhostCardProps) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			className="group flex cursor-pointer flex-col rounded-[10px] border border-border border-dashed bg-muted/30 transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onClick={() => onSelect(branch)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(branch);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-10 flex-shrink-0 items-center justify-center rounded-[8px] border border-border border-dashed font-semibold text-[13px] text-muted-foreground">
					{getInitials(branch.name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="truncate font-semibold text-[14px] text-foreground leading-tight tracking-tight">
						{branch.name}
					</p>
					<p className="truncate text-muted-foreground text-xs">
						Sem estoque nesta filial
					</p>
				</div>
			</div>

			<div className="mt-auto border-border border-t border-dashed py-2.5 text-center text-muted-foreground text-xs transition-colors group-hover:text-foreground">
				+ Registrar entrada
			</div>
		</div>
	);
}
