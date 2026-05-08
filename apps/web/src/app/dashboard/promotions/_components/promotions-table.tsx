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
import { Pencil } from "lucide-react";
import Link from "next/link";

import type { PromotionListItem } from "../actions";
import { DeletePromotionDialog } from "./delete-promotion-dialog";
import { ScopePopover } from "./scope-popover";

interface PromotionsTableProps {
	canMutate: boolean;
	promotions: PromotionListItem[];
}

const DATE_FMT = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
});

function fmtDate(d: Date): string {
	return DATE_FMT.format(d);
}

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
	return "Sem janela definida";
}

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

function formatDesconto(discountPct: string): string {
	const num = Number(discountPct);
	return `${new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(num)}%`;
}

export function PromotionsTable({
	promotions,
	canMutate,
}: PromotionsTableProps) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Tipo / Código</TableHead>
					<TableHead>Título</TableHead>
					<TableHead>Desconto</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Escopo</TableHead>
					{canMutate && (
						<TableHead className="w-32 text-right">Ações</TableHead>
					)}
				</TableRow>
			</TableHeader>
			<TableBody>
				{promotions.map((p) => (
					<TableRow key={p.id}>
						<TableCell>
							<div className="flex flex-col gap-1">
								{p.type === "promocode" ? (
									<Badge className="w-fit" variant="info">
										Cupom
									</Badge>
								) : (
									<Badge className="w-fit" variant="outline">
										Automática
									</Badge>
								)}
								<span className="font-mono text-muted-foreground text-xs">
									{p.type === "promocode" ? (p.code ?? "—") : "—"}
								</span>
							</div>
						</TableCell>

						<TableCell className="max-w-[280px] truncate font-medium">
							{p.title}
						</TableCell>

						<TableCell className="tabular-nums">
							{formatDesconto(p.discountPct)}
						</TableCell>

						<TableCell>
							<div className="flex flex-col gap-1">
								{isPromotionActive(p) ? (
									<Badge className="w-fit" variant="success">
										Ativa
									</Badge>
								) : (
									<Badge className="w-fit" variant="outline">
										Inativa
									</Badge>
								)}
								<span className="text-muted-foreground text-xs">
									{formatJanela(p.startsAt, p.endsAt)}
								</span>
							</div>
						</TableCell>

						<TableCell>
							<ScopePopover tools={p.tools} />
						</TableCell>

						{canMutate && (
							<TableCell className="text-right">
								<div className="flex justify-end gap-2">
									<Link
										aria-label={`Editar promoção ${p.title}`}
										className={buttonVariants({
											size: "icon-sm",
											variant: "secondary",
										})}
										href={`/dashboard/promotions/${p.id}/edit`}
									>
										<Pencil aria-hidden className="size-3.5" />
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
