"use client";

import type { ReactNode } from "react";

import { ClearFiltersButton } from "@/components/clear-filters-button";

interface FiltersBarProps {
	children: ReactNode;
	hasActive?: boolean;
	onClear?: () => void;
}

export function FiltersBar({ children, hasActive, onClear }: FiltersBarProps) {
	return (
		<div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
			{children}
			{hasActive && (
				<ClearFiltersButton className="md:self-end" onClear={onClear} />
			)}
		</div>
	);
}
