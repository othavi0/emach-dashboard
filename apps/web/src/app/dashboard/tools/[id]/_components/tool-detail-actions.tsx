import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";

interface ToolDetailActionsProps {
	canMutate: boolean;
	tab: string;
	toolId: string;
}

/**
 * Ação contextual do header. "Editar ferramenta" aparece só na Visão geral
 * (edição é form grande → página `/edit`). Excluir a ferramenta vive na tab
 * Variantes & preços (zona de perigo). Ajuste de estoque é pelo drawer da aba.
 */
export function ToolDetailActions({
	tab,
	toolId,
	canMutate,
}: ToolDetailActionsProps) {
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
