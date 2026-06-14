"use client";

import { Button } from "@emach/ui/components/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@emach/ui/components/sheet";
import type { FormEvent, ReactNode } from "react";

interface Props {
	cancelLabel?: string;
	children: ReactNode;
	description?: ReactNode;
	onOpenChange: (open: boolean) => void;
	onSubmit: (e: FormEvent<HTMLFormElement>) => void;
	open: boolean;
	submitLabel?: string;
	submitting?: boolean;
	title: ReactNode;
	/** Classe de largura máxima do drawer. Default `sm:max-w-lg`. */
	widthClassName?: string;
}

export function EntityEditSheet({
	open,
	onOpenChange,
	title,
	description,
	submitting = false,
	submitLabel = "Salvar",
	cancelLabel = "Cancelar",
	onSubmit,
	children,
	widthClassName = "sm:max-w-lg",
}: Props) {
	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent
				className={`flex w-full flex-col gap-0 p-0 ${widthClassName}`}
			>
				<SheetHeader className="border-border border-b">
					<SheetTitle>{title}</SheetTitle>
					{description ? (
						<SheetDescription>{description}</SheetDescription>
					) : null}
				</SheetHeader>
				<form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
					<div className="flex-1 overflow-y-auto p-6">{children}</div>
					<SheetFooter className="border-border border-t">
						<Button
							disabled={submitting}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							{cancelLabel}
						</Button>
						<Button disabled={submitting} type="submit">
							{submitting ? "Salvando…" : submitLabel}
						</Button>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
