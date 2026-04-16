"use client";

import { Badge } from "@emach/ui/components/badge";
import { buttonVariants } from "@emach/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import Link from "next/link";

import type { PromotionListItem } from "../actions";

interface PromotionsTableProps {
	canMutate: boolean;
	promotions: PromotionListItem[];
}

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function fmtDate(d: Date): string {
	return DATE_FMT.format(d);
}

// ---------------------------------------------------------------------------
// Janela (date range) — 4 conditional variants
// ---------------------------------------------------------------------------

function formatJanela(startsAt: Date | null, endsAt: Date | null): string {
	if (startsAt && endsAt) {
		return `${fmtDate(startsAt)} – ${fmtDate(endsAt)}`;
	}
	if (startsAt) {
		return `A partir de ${fmtDate(startsAt)}`;
	}
	if (endsAt) {
		return `Até ${fmtDate(endsAt)}`;
	}
	return "—";
}

// ---------------------------------------------------------------------------
// Ativa — window-aware active check
// ---------------------------------------------------------------------------

function isPromotionActive(row: PromotionListItem): boolean {
	if (!row.active) {
		return false;
	}
	const now = new Date();
	if (row.startsAt && row.startsAt > now) {
		return false;
	}
	if (row.endsAt && row.endsAt < now) {
		return false;
	}
	return true;
}

// ---------------------------------------------------------------------------
// Desconto — pt-BR format XX,XX%
// ---------------------------------------------------------------------------

function formatDesconto(discountPct: string): string {
	const num = Number(discountPct);
	return `${new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(num)}%`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PromotionsTable({
	promotions,
	canMutate,
}: PromotionsTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Tipo</TableHead>
					<TableHead>Título</TableHead>
					<TableHead>Código</TableHead>
					<TableHead>Desconto</TableHead>
					<TableHead>Ativa</TableHead>
					<TableHead>Janela</TableHead>
					<TableHead className="text-right">Ferramentas</TableHead>
					{canMutate && (
						<TableHead className="w-40 text-right">Ações</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{promotions.map((p) => (
					<TableRow key={p.id}>
						{/* Tipo badge — Warm Sand for promotion, Dark Charcoal for promocode */}
						<TableCell>
							{p.type === "promocode" ? (
								<Badge
									className="bg-[#30302e] text-[#faf9f5] hover:bg-[#30302e]/90"
									variant="outline"
								>
									Código
								</Badge>
							) : (
								<Badge
									className="bg-[#e8e6dc] text-[#4d4c48] hover:bg-[#e8e6dc]/90"
									variant="outline"
								>
									Promoção
								</Badge>
							)}
						</TableCell>

						{/* Título */}
						<TableCell className="font-medium">{p.title}</TableCell>

						{/* Código */}
						<TableCell className="font-mono text-muted-foreground text-sm">
							{p.type === "promocode" ? (p.code ?? "—") : "—"}
						</TableCell>

						{/* Desconto */}
						<TableCell className="tabular-nums">
							{formatDesconto(p.discountPct)}
						</TableCell>

						{/* Ativa badge */}
						<TableCell>
							{isPromotionActive(p) ? (
								<Badge variant="default">Ativa</Badge>
							) : (
								<Badge variant="outline">Inativa</Badge>
							)}
						</TableCell>

						{/* Janela */}
						<TableCell className="text-muted-foreground text-sm">
							{formatJanela(p.startsAt, p.endsAt)}
						</TableCell>

						{/* Ferramentas count */}
						<TableCell className="text-right tabular-nums">
							{p.tools.length}
						</TableCell>

						{/* Ações — absent from DOM for non-admin */}
						{canMutate && (
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										className={buttonVariants({ size: "sm", variant: "ghost" })}
										href={`/dashboard/promotions/${p.id}/edit`}
									>
										Editar
									</Link>
									<button
										aria-label="Deletar promoção"
										className={buttonVariants({
											size: "sm",
											variant: "ghost",
										})}
										type="button"
									>
										Deletar
									</button>
								</div>
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
