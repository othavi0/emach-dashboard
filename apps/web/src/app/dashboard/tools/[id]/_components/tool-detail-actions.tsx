import { buttonVariants } from "@emach/ui/components/button";
import { Pencil } from "lucide-react";
import Link from "next/link";

import { DeleteToolDialog } from "../../_components/delete-tool-dialog";

interface ToolDetailActionsProps {
	canDelete: boolean;
	canMutate: boolean;
	tab: string;
	toolId: string;
	toolName: string;
}

/**
 * Ação contextual do header. "Editar ferramenta" aparece só na Visão geral
 * (edição é form grande → página `/edit`). O ajuste de estoque agora é feito
 * pelo drawer dentro da própria aba Estoque, então não há ação no header dela.
 * Remover é persistente em todas as abas.
 */
export function ToolDetailActions({
	tab,
	toolId,
	toolName,
	canMutate,
	canDelete,
}: ToolDetailActionsProps) {
	return (
		<>
			{canDelete && <DeleteToolDialog toolId={toolId} toolName={toolName} />}

			{canMutate && tab === "visao-geral" && (
				<Link
					className={buttonVariants({ size: "sm", variant: "default" })}
					href={`/dashboard/tools/${toolId}/edit`}
				>
					<Pencil aria-hidden className="mr-1.5 size-3.5" />
					Editar ferramenta
				</Link>
			)}
		</>
	);
}
