"use client";

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
import { Label } from "@emach/ui/components/label";
import { Textarea } from "@emach/ui/components/textarea";
import { useState } from "react";

interface Props {
	cancelLabel?: string;
	confirmLabel: string;
	description: string;
	destructive?: boolean;
	onCancel: () => void;
	onConfirm: (reason: string) => void | Promise<void>;
	open: boolean;
	reasonRequired?: boolean;
	submitting?: boolean;
	title: string;
}

const MIN_REASON_LENGTH = 10;

export function DestructiveActionDialog({
	open,
	title,
	description,
	confirmLabel,
	cancelLabel = "Cancelar",
	destructive = true,
	reasonRequired = true,
	submitting = false,
	onConfirm,
	onCancel,
}: Props) {
	const [reason, setReason] = useState("");
	const tooShort = reasonRequired && reason.trim().length < MIN_REASON_LENGTH;

	const handleConfirm = () => {
		if (tooShort) {
			return;
		}
		const result = onConfirm(reason.trim());
		if (result instanceof Promise) {
			result.catch(() => undefined);
		}
	};

	return (
		<AlertDialog
			onOpenChange={(o) => {
				if (!o) {
					setReason("");
					onCancel();
				}
			}}
			open={open}
		>
			<AlertDialogContent size="default">
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="destructive-reason">
						Motivo{" "}
						{reasonRequired
							? "(obrigatório, mín. 10 caracteres)"
							: "(opcional)"}
					</Label>
					<Textarea
						id="destructive-reason"
						onChange={(e) => setReason(e.target.value)}
						placeholder="Explique brevemente o motivo desta ação"
						rows={3}
						value={reason}
					/>
					{reasonRequired && reason.length > 0 && tooShort ? (
						<p className="text-destructive text-xs">
							Mínimo {MIN_REASON_LENGTH} caracteres.
						</p>
					) : null}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={submitting}>
						{cancelLabel}
					</AlertDialogCancel>
					<AlertDialogAction
						disabled={submitting || tooShort}
						onClick={handleConfirm}
						variant={destructive ? "destructive" : "default"}
					>
						{confirmLabel}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
