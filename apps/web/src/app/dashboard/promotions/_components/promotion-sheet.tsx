"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import {
	Copy,
	ExternalLink,
	PauseCircle,
	Pencil,
	PlayCircle,
	Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
	duplicatePromotion,
	type PromotionDetail,
	togglePromotionActive,
} from "../actions";
import { fmtDateTime, formatDesconto, formatJanela } from "./_lib/format";
import { CopyCodeButton } from "./copy-code-button";
import { DeletePromotionDialog } from "./delete-promotion-dialog";
import { PromotionStatusBadge } from "./promotion-status-badge";

interface PromotionSheetProps {
	canMutate: boolean;
	promotion: PromotionDetail | null;
}

export function PromotionSheet({ canMutate, promotion }: PromotionSheetProps) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [isPending, startTransition] = useTransition();
	const [deleteOpen, setDeleteOpen] = useState(false);

	const open = Boolean(searchParams.get("view"));

	const close = useCallback(() => {
		const params = new URLSearchParams(searchParams);
		params.delete("view");
		const query = params.toString();
		router.replace(
			query ? `/dashboard/promotions?${query}` : "/dashboard/promotions",
			{ scroll: false }
		);
	}, [router, searchParams]);

	const goEdit = useCallback(
		(id: string) => {
			const params = new URLSearchParams(searchParams);
			params.delete("view");
			params.set("edit", id);
			router.replace(`/dashboard/promotions?${params.toString()}`, {
				scroll: false,
			});
		},
		[router, searchParams]
	);

	// Auto-close se a promoção solicitada não existe (ex: deletada em paralelo)
	useEffect(() => {
		if (open && !promotion) {
			const timer = setTimeout(close, 1500);
			return () => clearTimeout(timer);
		}
	}, [open, promotion, close]);

	function handleToggle() {
		if (!promotion) {
			return;
		}
		startTransition(async () => {
			const result = await togglePromotionActive(promotion.id);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success(
				result.data.active ? "Promoção ativada" : "Promoção pausada"
			);
			router.refresh();
		});
	}

	function handleDuplicate() {
		if (!promotion) {
			return;
		}
		startTransition(async () => {
			const result = await duplicatePromotion(promotion.id);
			if (!result.ok) {
				toast.error(result.error);
				return;
			}
			toast.success("Promoção duplicada");
			goEdit(result.data.id);
		});
	}

	return (
		<Sheet onOpenChange={(next) => (next ? null : close())} open={open}>
			<SheetContent className="flex w-full flex-col gap-0 sm:max-w-[480px]">
				{promotion ? (
					<>
						<SheetHeader className="gap-2 border-border border-b">
							<div className="flex items-center gap-2">
								{promotion.type === "promocode" ? (
									<Badge variant="info">Cupom</Badge>
								) : (
									<Badge variant="outline">Automática</Badge>
								)}
								<PromotionStatusBadge status={promotion.status} />
							</div>
							<SheetTitle className="font-medium font-serif text-[22px] leading-tight">
								{promotion.title}
							</SheetTitle>
							<SheetDescription>
								{formatJanela(promotion.startsAt, promotion.endsAt)}
							</SheetDescription>
						</SheetHeader>

						<div className="flex flex-1 flex-col gap-6 overflow-auto px-6 py-5">
							<div className="grid grid-cols-2 gap-3">
								<div className="rounded-md border border-border bg-muted/40 p-3">
									<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
										Desconto
									</div>
									<div className="mt-1 font-medium text-[32px] text-primary tabular-nums leading-none">
										{formatDesconto(promotion.discountPct)}
									</div>
								</div>
								<div className="rounded-md border border-border bg-muted/40 p-3">
									<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
										{promotion.type === "promocode" ? "Código" : "Tipo"}
									</div>
									<div className="mt-2 flex items-center gap-2">
										{promotion.type === "promocode" && promotion.code ? (
											<>
												<span className="rounded bg-background px-2 py-1 font-mono text-foreground text-sm">
													{promotion.code}
												</span>
												<CopyCodeButton code={promotion.code} />
											</>
										) : (
											<span className="text-muted-foreground text-sm">
												{promotion.type === "promocode"
													? "—"
													: "Aplicada automaticamente"}
											</span>
										)}
									</div>
								</div>
							</div>

							{promotion.description && (
								<div>
									<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
										Descrição
									</div>
									<p className="mt-2 whitespace-pre-wrap text-foreground text-sm leading-relaxed">
										{promotion.description}
									</p>
								</div>
							)}

							{canMutate && (
								<div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
									<div className="min-w-0">
										<div className="font-medium text-sm">
											{promotion.active
												? "Promoção em execução"
												: "Promoção pausada"}
										</div>
										<p className="text-muted-foreground text-xs">
											{promotion.active
												? "Aparece no site para clientes elegíveis."
												: "Não aparece no site. Pode ser reativada a qualquer momento."}
										</p>
									</div>
									{promotion.active ? (
										<Button
											disabled={isPending}
											onClick={handleToggle}
											size="sm"
											variant="secondary"
										>
											<PauseCircle className="mr-1.5 size-4" />
											Pausar promoção
										</Button>
									) : (
										<Button
											disabled={isPending}
											onClick={handleToggle}
											size="sm"
											variant="default"
										>
											<PlayCircle className="mr-1.5 size-4" />
											Ativar promoção
										</Button>
									)}
								</div>
							)}

							<div>
								<div className="flex items-center justify-between">
									<span className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
										Ferramentas vinculadas ({promotion.tools.length})
									</span>
									{canMutate && (
										<button
											className="text-primary text-xs hover:underline"
											onClick={() => goEdit(promotion.id)}
											type="button"
										>
											Gerenciar →
										</button>
									)}
								</div>
								<ul className="mt-3 flex flex-col">
									{promotion.tools.map((t) => (
										<li
											className="flex items-center gap-3 border-border border-b py-2 last:border-b-0"
											key={t.id}
										>
											<div className="size-9 flex-shrink-0 overflow-hidden rounded-md bg-muted">
												{t.thumbUrl ? (
													// biome-ignore lint/performance/noImgElement: Supabase public URL
													<img
														alt={t.name}
														className="size-full object-cover"
														height={36}
														src={t.thumbUrl}
														width={36}
													/>
												) : null}
											</div>
											<div className="min-w-0 flex-1">
												<div className="truncate font-medium text-sm">
													{t.name}
												</div>
												{t.sku && (
													<div className="font-mono text-[11px] text-muted-foreground">
														SKU: {t.sku}
													</div>
												)}
											</div>
											<Link
												aria-label={`Abrir ${t.name}`}
												className="text-primary"
												href={`/dashboard/tools/${t.slug}`}
											>
												<ExternalLink className="size-4" />
											</Link>
										</li>
									))}
								</ul>
							</div>

							<div>
								<div className="font-medium text-[11px] text-muted-foreground uppercase tracking-wider">
									Histórico
								</div>
								<div className="mt-2 space-y-1 text-muted-foreground text-xs">
									<p>
										Criada em{" "}
										<span className="text-foreground">
											{fmtDateTime(promotion.createdAt)}
										</span>
										{promotion.createdByName && (
											<>
												{" "}
												por{" "}
												<span className="font-medium text-foreground">
													{promotion.createdByName}
												</span>
											</>
										)}
									</p>
									<p>
										Atualizada em{" "}
										<span className="text-foreground">
											{fmtDateTime(promotion.updatedAt)}
										</span>
										{promotion.updatedByName && (
											<>
												{" "}
												por{" "}
												<span className="font-medium text-foreground">
													{promotion.updatedByName}
												</span>
											</>
										)}
									</p>
								</div>
							</div>
						</div>

						{canMutate && (
							<SheetFooter className="border-border border-t bg-muted/40 px-6 py-4">
								<div className="flex w-full items-stretch gap-2">
									<Button
										className="flex-1"
										disabled={isPending}
										onClick={handleDuplicate}
										size="sm"
										variant="secondary"
									>
										<Copy className="mr-2 size-4" />
										Duplicar
									</Button>
									<Button
										className="flex-1"
										onClick={() => goEdit(promotion.id)}
										size="sm"
										type="button"
									>
										<Pencil className="mr-2 size-4" />
										Editar
									</Button>
									<Button
										className="flex-1"
										onClick={() => setDeleteOpen(true)}
										size="sm"
										variant="destructive"
									>
										<Trash2 className="mr-2 size-4" />
										Excluir
									</Button>
								</div>
							</SheetFooter>
						)}

						<DeletePromotionDialog
							controlled={{ open: deleteOpen, onOpenChange: setDeleteOpen }}
							promotionId={promotion.id}
							promotionTitle={promotion.title}
						/>
					</>
				) : (
					<div className="flex flex-1 items-center justify-center p-8 text-center text-muted-foreground text-sm">
						Promoção não encontrada ou removida.
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
