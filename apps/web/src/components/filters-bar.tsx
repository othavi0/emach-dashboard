"use client";

import { Button } from "@emach/ui/components/button";
import type { ReactNode } from "react";

interface FiltersBarProps {
	children: ReactNode;
	hasActive?: boolean;
	onClear?: () => void;
}

export function FiltersBar({ children, hasActive, onClear }: FiltersBarProps) {
	return (
		<div className="flex flex-col gap-3 md:flex-row md:items-end">
			{children}
			{hasActive && onClear ? (
				<Button
					className="md:self-end"
					onClick={onClear}
					size="sm"
					type="button"
					variant="ghost"
				>
					Limpar filtros
				</Button>
			) : null}
		</div>
	);
}
