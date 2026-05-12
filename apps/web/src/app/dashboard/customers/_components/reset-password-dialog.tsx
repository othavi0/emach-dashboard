"use client";

import { Button } from "@emach/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@emach/ui/components/dialog";
import { CheckIcon, CopyIcon } from "lucide-react";
import { type ReactElement, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { generatePasswordResetLink } from "../actions";

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
	hour: "2-digit",
	minute: "2-digit",
});

interface ResetPasswordDialogProps {
	children: ReactElement;
	clientId: string;
	clientName: string;
	disabled?: boolean;
}

export function ResetPasswordDialog({
	children,
	clientId,
	clientName,
	disabled,
}: ResetPasswordDialogProps) {
	const [open, setOpen] = useState(false);
	const [result, setResult] = useState<{
		expiresAt: Date;
		url: string;
	} | null>(null);
	const [copied, setCopied] = useState(false);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) {
			setResult(null);
			setCopied(false);
		}
	}, [open]);

	function handleOpen(isOpen: boolean) {
		setOpen(isOpen);
		if (isOpen && !result) {
			startTransition(async () => {
				const res = await generatePasswordResetLink({ clientId });
				if (res.ok) {
					setResult({
						url: res.data.url,
						expiresAt: new Date(res.data.expiresAt),
					});
				} else {
					toast.error(res.error);
					setOpen(false);
				}
			});
		}
	}

	function handleCopy() {
		if (!result?.url) {
			return;
		}
		navigator.clipboard.writeText(result.url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<Dialog onOpenChange={handleOpen} open={open}>
			<DialogTrigger disabled={disabled} render={children} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Reset de senha — {clientName}</DialogTitle>
					<DialogDescription>
						Link gerado para o cliente redefinir a senha. Envie por canal
						seguro.
					</DialogDescription>
				</DialogHeader>

				{isPending && (
					<div className="flex items-center justify-center py-8">
						<div className="text-muted-foreground text-sm">Gerando link…</div>
					</div>
				)}

				{result && (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							{/* biome-ignore lint/a11y/noLabelWithoutControl: visual label for static <code> block */}
							<label className="text-muted-foreground text-xs uppercase tracking-wide">
								Link de reset
							</label>
							<div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
								<code className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs">
									{result.url}
								</code>
								<Button
									onClick={handleCopy}
									size="icon-sm"
									type="button"
									variant="ghost"
								>
									{copied ? (
										<CheckIcon aria-hidden className="size-3.5 text-success" />
									) : (
										<CopyIcon aria-hidden className="size-3.5" />
									)}
								</Button>
							</div>
						</div>

						<p className="text-muted-foreground text-xs">
							Expira em{" "}
							<span className="font-medium text-foreground">
								{DATE_TIME.format(result.expiresAt)}
							</span>
							. Envie ao cliente por canal seguro (não por email automatizado).
						</p>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
