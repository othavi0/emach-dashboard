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
import { DeletePromotionDialog } from "./delete-promotion-dialog";

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

function formatToolsScope(promotion: PromotionListItem): string {
	if (promotion.tools.length === 0) {
		return "Nenhuma ferramenta vinculada";
	}

	const visibleTools = promotion.tools.slice(0, 2).map((tool) => tool.name);
	const hiddenCount = promotion.tools.length - visibleTools.length;
	const suffix = hiddenCount > 0 ? ` +${hiddenCount}` : "";

	return `Ferramentas específicas: ${visibleTools.join(", ")}${suffix}`;
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
					<TableHead>Escopo</TableHead>
					{canMutate && (
						<TableHead className="w-40 text-right">Ações</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{promotions.map((p) => (
					<TableRow key={p.id}>
						<TableCell>
							{p.type === "promocode" ? (
								<Badge variant="info">Cupom</Badge>
							) : (
								<Badge variant="outline">Automática</Badge>
							)}
						</TableCell>

						<TableCell className="font-medium">{p.title}</TableCell>

						<TableCell className="font-mono text-muted-foreground text-sm">
							{p.type === "promocode" ? (p.code ?? "—") : "—"}
						</TableCell>

						<TableCell className="tabular-nums">
							{formatDesconto(p.discountPct)}
						</TableCell>

						<TableCell>
							{isPromotionActive(p) ? (
								<Badge variant="success">Ativa</Badge>
							) : (
								<Badge variant="outline">Inativa</Badge>
							)}
						</TableCell>

						<TableCell className="text-muted-foreground text-sm">
							{formatJanela(p.startsAt, p.endsAt)}
						</TableCell>

						<TableCell className="max-w-xs text-muted-foreground text-sm">
							{formatToolsScope(p)}
						</TableCell>

						{canMutate && (
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										className={buttonVariants({ size: "sm", variant: "ghost" })}
										href={`/dashboard/promotions/${p.id}/edit`}
									>
										Editar
									</Link>
									<DeletePromotionDialog
										promotionId={p.id}
										promotionTitle={p.title}
									/>
								</div>
							</TableCell>
						)}
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
