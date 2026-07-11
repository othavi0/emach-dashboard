"use client";

import { PopoverTrigger } from "@emach/ui/components/popover";
import { cn } from "@emach/ui/lib/utils";
import type { ComponentProps } from "react";

/**
 * Trigger canônico para combobox "botão-que-abre-popover" (Popover + Command).
 *
 * Espelha exatamente os tokens do `SelectTrigger` (packages/ui/src/components/select.tsx)
 * — h-8, border-input, bg-transparent + dark:bg-input/30, py-2 pr-2 pl-2.5 text-xs, gap-1.5,
 * focus ring-1/offset-1, aria-invalid — para que todo combobox fique pixel-idêntico aos
 * Selects vizinhos. Centraliza a única parte que precisa ser consistente (a className do
 * trigger), impedindo a divergência copy-paste que existia em 4 comboboxes hand-written
 * (h-9/h-10 + bg-transparent sem dark). Ver docs/superpowers/specs/2026-07-11-*.
 *
 * O conteúdo (label + ícone trailing chevron/clear) fica por conta de cada call-site, que
 * legitimamente varia (single/multi/clear/invalid) — passado via `children`.
 */
export const COMBOBOX_TRIGGER_CLASS =
	"flex h-8 w-full select-none items-center justify-between gap-1.5 whitespace-nowrap rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50";

export function ComboboxTriggerButton({
	className,
	children,
	...props
}: ComponentProps<typeof PopoverTrigger>) {
	return (
		<PopoverTrigger
			className={cn(COMBOBOX_TRIGGER_CLASS, className)}
			{...props}
			render={<button type="button" />}
		>
			{children}
		</PopoverTrigger>
	);
}
