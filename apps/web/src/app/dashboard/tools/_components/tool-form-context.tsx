"use client";

import type { AttributeDefinition } from "@emach/db/schema/attributes";
import { createContext, useContext } from "react";

export interface CategoryOption {
	depth: number;
	id: string;
	name: string;
	path: string;
	slug: string;
}
export interface SupplierOption {
	id: string;
	name: string;
}

export interface ToolFormContextValue {
	allDefinitions: AttributeDefinition[];
	categories: CategoryOption[];
	definitionsByCategory: Record<string, AttributeDefinition[]>;
	existingSlug?: string;
	mode: "create" | "edit";
	suppliers: SupplierOption[];
	toolId?: string;
}

const ToolFormContext = createContext<ToolFormContextValue | null>(null);

export function ToolFormProvider({
	value,
	children,
}: {
	value: ToolFormContextValue;
	children: React.ReactNode;
}) {
	return (
		<ToolFormContext.Provider value={value}>
			{children}
		</ToolFormContext.Provider>
	);
}

export function useToolFormContext(): ToolFormContextValue {
	const ctx = useContext(ToolFormContext);
	if (!ctx) {
		throw new Error(
			"useToolFormContext deve ser usado dentro de ToolFormProvider"
		);
	}
	return ctx;
}
