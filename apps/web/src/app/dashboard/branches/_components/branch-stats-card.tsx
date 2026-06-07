"use client";

import type { ReactNode } from "react";

import { getInitials } from "@/lib/format/name";

export interface BranchCardStat {
	/** Realça o valor em âmbar quando > 0 (ex.: itens abaixo do mínimo). */
	amber?: boolean;
	label: string;
	value: number;
}

interface Props {
	address: string | null;
	/** Rodapé opcional abaixo dos stats (ex.: ação desvincular). Inclui a própria borda. */
	footer?: ReactNode;
	/** Ação no canto do header (ex.: atalho de estoque). Deve usar stopPropagation. */
	headerAction?: ReactNode;
	name: string;
	/** Disparado por clique ou Enter/Espaço no card. */
	onActivate: () => void;
	stats: [BranchCardStat, BranchCardStat, BranchCardStat];
	status: "active" | "inactive";
}

/**
 * Shell visual de card de filial (avatar + nome + endereço + grid de 3 stats).
 * Reusado pela listagem (`BranchCard`) e pelas filiais do usuário (`UserBranchCard`),
 * que injetam suas próprias ações via `headerAction`/`footer`.
 */
export function BranchStatsCard({
	address,
	headerAction,
	footer,
	name,
	onActivate,
	stats,
	status,
}: Props) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: card clicável (padrão DESIGN.md §4) — div role=button com onKeyDown
		<div
			className={`group flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-border bg-card shadow-[0_0_0_1px_rgba(20,20,19,0.04)] transition-[border-color,box-shadow] hover:border-border/60 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${status === "inactive" ? "opacity-70" : ""}`}
			onClick={onActivate}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onActivate();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex items-start gap-3 px-4 pt-4 pb-3">
				<div className="flex size-12 flex-shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted font-bold text-[17px] text-foreground">
					{getInitials(name)}
				</div>
				<div className="min-w-0 flex-1">
					<p className="font-semibold text-[15px] text-foreground leading-tight">
						{name}
					</p>
					{status === "inactive" && (
						<span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground uppercase tracking-wider">
							Inativa
						</span>
					)}
					{address ? (
						<p className="line-clamp-1 text-muted-foreground text-xs">
							{address}
						</p>
					) : null}
				</div>
				{headerAction}
			</div>

			<div className="grid grid-cols-3 border-border border-t">
				{stats.map((stat, i) => (
					<div
						className={`flex flex-col items-center py-2.5 ${
							i < 2 ? "border-border border-r" : ""
						}`}
						key={stat.label}
					>
						<span
							className={`font-bold text-[18px] tabular-nums ${
								stat.amber && stat.value > 0
									? "text-amber-500"
									: "text-foreground"
							}`}
						>
							{stat.value}
						</span>
						<span className="text-[9px] text-muted-foreground uppercase tracking-wider">
							{stat.label}
						</span>
					</div>
				))}
			</div>

			{footer}
		</div>
	);
}
