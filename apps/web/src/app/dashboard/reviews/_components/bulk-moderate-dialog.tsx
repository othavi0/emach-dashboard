"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@emach/ui/components/dialog";
import { Spinner } from "@emach/ui/components/spinner";
import { Textarea } from "@emach/ui/components/textarea";
import { useState, useTransition } from "react";

import { FieldError } from "@/components/field-error";
import { notify } from "@/lib/notify";

import { bulkModerateReviews } from "../actions";
import type { BulkModerateStatus } from "../schema";
import type { ReviewStatus } from "../status-meta";

interface BulkModerateDialogProps {
	count: number;
	expectedStatus: ReviewStatus;
	onClose: () => void;
	onSuccess: (moderatedIds: string[]) => void;
	reviewIds: string[];
	status: BulkModerateStatus;
}

const ACTION_LABELS: Record<BulkModerateStatus, string> = {
	approved: "Aprovar",
	rejected: "Rejeitar",
	spam: "Marcar como spam",
};

function isNoteRequired(status: BulkModerateStatus) {
	return status === "rejected" || status === "spam";
}

function plural(count: number) {
	return count === 1 ? "avaliação" : "avaliações";
}

export function BulkModerateDialog({
	count,
	expectedStatus,
	onClose,
	onSuccess,
	reviewIds,
	status,
}: BulkModerateDialogProps) {
	const [note, setNote] = useState("");
	const [noteError, setNoteError] = useState<string | undefined>(undefined);
	const [isPending, startTransition] = useTransition();

	const noteRequired = isNoteRequired(status);

	function handleConfirm() {
		const trimmed = note.trim();
		if (noteRequired && !trimmed) {
			setNoteError("Informe a nota ao rejeitar ou marcar como spam");
			return;
		}
		setNoteError(undefined);

		startTransition(async () => {
			const result = await bulkModerateReviews({
				reviewIds,
				status,
				moderationNote: trimmed || undefined,
				expectedStatus,
			});

			if (!result.ok) {
				// Dialog segue aberto: o usuário pode corrigir e tentar de novo.
				notify.error(result.error);
				return;
			}

			const { moderatedIds, stale, succeeded } = result.data;
			if (stale > 0) {
				notify.warning(
					`${succeeded} ${plural(succeeded)} moderada(s); ${stale} já havia(m) sido moderada(s) por outra pessoa`
				);
			} else {
				notify.success(`${succeeded} ${plural(succeeded)} moderada(s)`);
			}
			onSuccess(moderatedIds);
		});
	}

	return (
		<Dialog onOpenChange={(value) => !value && onClose()} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{ACTION_LABELS[status]} {count} {plural(count)}?
					</DialogTitle>
					<DialogDescription>
						A ação será aplicada a todas as avaliações selecionadas.
					</DialogDescription>
				</DialogHeader>

				{noteRequired ? (
					<div className="space-y-1">
						<label
							className="text-muted-foreground text-xs"
							htmlFor="bulk-moderation-note"
						>
							Nota de moderação (obrigatória)
						</label>
						<Textarea
							aria-invalid={noteError ? true : undefined}
							id="bulk-moderation-note"
							onChange={(event) => setNote(event.target.value)}
							placeholder="Explique a decisão para registro interno…"
							value={note}
						/>
						<FieldError>{noteError}</FieldError>
					</div>
				) : null}

				<DialogFooter>
					<Button disabled={isPending} onClick={onClose} variant="ghost">
						Cancelar
					</Button>
					<Button
						disabled={isPending}
						onClick={handleConfirm}
						variant={status === "approved" ? "default" : "destructive"}
					>
						{isPending ? (
							<>
								<Spinner /> Moderando…
							</>
						) : (
							`${ACTION_LABELS[status]} (${count})`
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
