"use client";

import type { ReviewStatus } from "@emach/db/schema/reviews";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@emach/ui/components/alert-dialog";
import { Badge } from "@emach/ui/components/badge";
import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Empty, EmptyHeader, EmptyTitle } from "@emach/ui/components/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@emach/ui/components/table";
import { Textarea } from "@emach/ui/components/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { BanIcon, CheckCircleIcon, StarIcon, XCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateReview } from "@/app/dashboard/reviews/actions";
import { useLazyTabReload } from "@/components/entity/lazy-tab";
import { notify } from "@/lib/notify";
import type { CustomerReviewRow } from "../data";

const REVIEW_STATUS_LABELS: Record<string, string> = {
	pending: "Pendente",
	approved: "Aprovada",
	rejected: "Rejeitada",
	spam: "Spam",
};

const REVIEW_STATUS_VARIANTS: Record<
	string,
	"warning" | "success" | "destructive"
> = {
	pending: "warning",
	approved: "success",
	rejected: "destructive",
	spam: "destructive",
};

function StarRating({ rating }: { rating: number }) {
	const clamped = Math.max(0, Math.min(5, Math.round(rating)));
	return (
		<span
			aria-label={`${clamped} de 5 estrelas`}
			className="inline-flex items-center gap-0.5 text-warning"
			role="img"
		>
			{Array.from({ length: 5 }, (_, i) => (
				<StarIcon
					aria-hidden="true"
					className={
						i < clamped ? "size-3.5 fill-current" : "size-3.5 opacity-30"
					}
					key={`star-${i}`}
				/>
			))}
		</span>
	);
}

type PendingAction = {
	reviewId: string;
	status: "rejected" | "spam";
	expectedStatus: ReviewStatus;
} | null;

interface CustomerReviewsTableProps {
	canModerate: boolean;
	items: CustomerReviewRow[];
}

export function CustomerReviewsTable({
	items,
	canModerate,
}: CustomerReviewsTableProps) {
	const router = useRouter();
	const reloadTab = useLazyTabReload();
	const [isPending, startTransition] = useTransition();
	const [pendingAction, setPendingAction] = useState<PendingAction>(null);
	const [note, setNote] = useState("");

	if (items.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Avaliações</CardTitle>
				</CardHeader>
				<CardContent>
					<Empty>
						<EmptyHeader>
							<EmptyTitle>Nenhuma avaliação encontrada</EmptyTitle>
						</EmptyHeader>
					</Empty>
				</CardContent>
			</Card>
		);
	}

	function handleApprove(reviewId: string, expectedStatus: ReviewStatus) {
		startTransition(async () => {
			const result = await moderateReview({
				reviewId,
				status: "approved",
				expectedStatus,
			});
			if (result.ok) {
				notify.success("Avaliação aprovada");
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	function handleNoteSubmit() {
		if (!pendingAction) {
			return;
		}
		const moderationNote = note.trim();
		startTransition(async () => {
			const result = await moderateReview({
				reviewId: pendingAction.reviewId,
				status: pendingAction.status,
				moderationNote,
				expectedStatus: pendingAction.expectedStatus,
			});
			if (result.ok) {
				notify.success(
					pendingAction.status === "spam"
						? "Avaliação marcada como spam"
						: "Avaliação rejeitada"
				);
				setPendingAction(null);
				setNote("");
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error);
			}
		});
	}

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">Avaliações</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Ferramenta</TableHead>
								<TableHead>Rating</TableHead>
								<TableHead>Título / Texto</TableHead>
								<TableHead>Status</TableHead>
								{canModerate && (
									<TableHead className="text-right">Ações</TableHead>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{items.map((review) => {
								const statusVariant =
									REVIEW_STATUS_VARIANTS[review.status] ?? "secondary";
								const statusLabel =
									REVIEW_STATUS_LABELS[review.status] ?? review.status;
								const isReviewPending = review.status === "pending";

								return (
									<TableRow key={review.id}>
										<TableCell className="max-w-[180px] truncate font-medium text-sm">
											{review.toolName}
										</TableCell>
										<TableCell>
											<StarRating rating={review.rating} />
										</TableCell>
										<TableCell className="max-w-[280px]">
											<div className="flex flex-col gap-0.5">
												{review.title ? (
													<span className="font-medium text-sm">
														{review.title}
													</span>
												) : null}
												<span className="text-muted-foreground text-sm">
													{review.body}
												</span>
											</div>
										</TableCell>
										<TableCell>
											<div className="flex flex-col gap-0.5">
												<Badge variant={statusVariant}>{statusLabel}</Badge>
												{review.moderationNote ? (
													<p className="text-muted-foreground text-xs">
														Nota de moderação: {review.moderationNote}
													</p>
												) : null}
											</div>
										</TableCell>
										{canModerate && (
											<TableCell className="text-right">
												{isReviewPending && (
													<div className="flex items-center justify-end gap-1">
														<Tooltip>
															<TooltipTrigger
																render={
																	<Button
																		aria-label="Aprovar avaliação"
																		disabled={isPending}
																		onClick={() =>
																			handleApprove(review.id, review.status)
																		}
																		size="icon-sm"
																		variant="secondary"
																	>
																		<CheckCircleIcon
																			aria-hidden
																			className="size-3.5 text-success"
																		/>
																	</Button>
																}
															/>
															<TooltipContent>Aprovar</TooltipContent>
														</Tooltip>
														<Tooltip>
															<TooltipTrigger
																render={
																	<Button
																		aria-label="Rejeitar avaliação"
																		disabled={isPending}
																		onClick={() => {
																			setPendingAction({
																				reviewId: review.id,
																				status: "rejected",
																				expectedStatus: review.status,
																			});
																			setNote("");
																		}}
																		size="icon-sm"
																		variant="secondary"
																	>
																		<XCircleIcon
																			aria-hidden
																			className="size-3.5 text-destructive"
																		/>
																	</Button>
																}
															/>
															<TooltipContent>Rejeitar</TooltipContent>
														</Tooltip>
														<Tooltip>
															<TooltipTrigger
																render={
																	<Button
																		aria-label="Marcar como spam"
																		disabled={isPending}
																		onClick={() => {
																			setPendingAction({
																				reviewId: review.id,
																				status: "spam",
																				expectedStatus: review.status,
																			});
																			setNote("");
																		}}
																		size="icon-sm"
																		variant="secondary"
																	>
																		<BanIcon
																			aria-hidden
																			className="size-3.5 text-destructive"
																		/>
																	</Button>
																}
															/>
															<TooltipContent>Spam</TooltipContent>
														</Tooltip>
													</div>
												)}
											</TableCell>
										)}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</CardContent>
			</Card>

			<AlertDialog
				onOpenChange={(open) => {
					if (!open) {
						setPendingAction(null);
						setNote("");
					}
				}}
				open={!!pendingAction}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{pendingAction?.status === "spam"
								? "Marcar como spam"
								: "Rejeitar avaliação"}
						</AlertDialogTitle>
						<AlertDialogDescription>
							Informe o motivo para registro interno (obrigatório).
						</AlertDialogDescription>
					</AlertDialogHeader>
					<Textarea
						onChange={(e) => setNote(e.target.value)}
						placeholder="Ex: linguagem ofensiva, conteúdo irrelevante..."
						rows={3}
						value={note}
					/>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancelar</AlertDialogCancel>
						<AlertDialogAction
							className={buttonVariants({ variant: "destructive" })}
							disabled={!note.trim() || isPending}
							onClick={handleNoteSubmit}
						>
							{isPending ? "Processando…" : "Confirmar"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
