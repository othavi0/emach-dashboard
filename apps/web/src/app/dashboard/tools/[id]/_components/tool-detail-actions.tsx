"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useActiveTab } from "@/components/entity/entity-client-tabs";

interface ToolDetailActionsProps {
	canMutate: boolean;
	toolId: string;
}

/**
 * Ação contextual do header. "Editar ferramenta" aparece só na Visão geral
 * (edição é form grande → página `/edit`). A tab ativa vem do contexto client
 * do ToolDetailTabs (sem re-render do servidor ao trocar de tab).
 */
export function ToolDetailActions({
	toolId,
	canMutate,
}: ToolDetailActionsProps) {
	const tab = useActiveTab();
	if (!(canMutate && tab === "visao-geral")) {
		return null;
	}
	return (
		<Link
			className={buttonVariants({ size: "sm", variant: "default" })}
			href={`/dashboard/tools/${toolId}/edit`}
		>
			<Pencil aria-hidden className="mr-1.5 size-3.5" />
			Editar ferramenta
		</Link>
	);
}
