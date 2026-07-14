"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useLazyTabReload } from "@/components/entity/lazy-tab";
import { notify } from "@/lib/notify";

import { moderateReview } from "../actions";
import type { ReviewDetail, ReviewStatus } from "../data";

function isNoteRequired(status: ReviewStatus) {
	return status === "rejected" || status === "spam";
}

export function ModerateActions({ review }: { review: ReviewDetail }) {
	const router = useRouter();
	const reloadTab = useLazyTabReload();
	const [moderationNote, setModerationNote] = useState(
		review.moderationNote ?? ""
	);
	const [isPending, startTransition] = useTransition();

	function handleModeration(
		status: Extract<ReviewStatus, "approved" | "rejected" | "spam">
	) {
		if (isNoteRequired(status) && !moderationNote.trim()) {
			notify.error("Informe uma nota ao rejeitar ou marcar como spam");
			return;
		}

		startTransition(async () => {
			try {
				const result = await moderateReview({
					reviewId: review.id,
					status,
					moderationNote: moderationNote.trim() || undefined,
					// O status que o Server Component renderizou é, literalmente, "o que o
					// moderador tinha na tela quando decidiu".
					expectedStatus: review.status,
				});

				if (!result.ok) {
					notify.error(result.error);
					// Pode ser conflito (outra pessoa moderou antes): recarrega para o
					// moderador ver o status e a nota de quem chegou primeiro — o card de
					// detalhe já renderiza `moderatedByName • moderatedAt` e a nota.
					reloadTab();
					router.refresh();
					return;
				}

				notify.success("Moderação salva");
				reloadTab();
				router.refresh();
			} catch {
				notify.error("Não foi possível salvar a moderação");
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Ações de moderação</CardTitle>
				<CardDescription>
					Aprove, rejeite ou marque como spam. Rejeição e spam exigem nota.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<Textarea
					onChange={(event) => setModerationNote(event.target.value)}
					placeholder="Explique a decisão para registro interno"
					value={moderationNote}
				/>
				<div className="flex flex-wrap gap-2">
					<Button
						disabled={isPending}
						onClick={() => handleModeration("approved")}
						variant="default"
					>
						{isPending ? <Spinner /> : "Aprovar"}
					</Button>
					<Button
						disabled={isPending}
						onClick={() => handleModeration("rejected")}
						variant="secondary"
					>
						{isPending ? <Spinner /> : "Rejeitar"}
					</Button>
					<Button
						disabled={isPending}
						onClick={() => handleModeration("spam")}
						variant="destructive"
					>
						{isPending ? <Spinner /> : "Spam"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
