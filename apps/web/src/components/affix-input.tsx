"use client";

import { cn } from "@emach/ui/lib/utils";
import type { ReactNode } from "react";

type AffixInputProps = Omit<React.ComponentProps<"input">, "prefix"> & {
	prefix?: ReactNode;
	suffix?: ReactNode;
};

/**
 * Input com adorno fixo (prefixo/sufixo) — o símbolo fica FORA do texto
 * editável. Espelha as classes do Input base (@emach/ui) para consistência.
 */
export function AffixInput({
	prefix,
	suffix,
	className,
	disabled,
	...rest
}: AffixInputProps) {
	return (
		<div
			className={cn(
				"flex h-8 w-full min-w-0 items-stretch overflow-hidden rounded-md border border-input bg-transparent text-xs transition-colors focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-1 focus-within:ring-offset-transparent dark:bg-input/30",
				disabled && "pointer-events-none opacity-50",
				className
			)}
			data-slot="affix-input"
		>
			{prefix == null ? null : (
				<div className="flex shrink-0 items-stretch border-input border-r bg-muted text-muted-foreground">
					{prefix}
				</div>
			)}
			<input
				className="min-w-0 flex-1 bg-transparent px-2.5 py-1 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
				disabled={disabled}
				{...rest}
			/>
			{suffix == null ? null : (
				<div className="flex shrink-0 items-stretch border-input border-l bg-muted text-muted-foreground">
					{suffix}
				</div>
			)}
		</div>
	);
}
