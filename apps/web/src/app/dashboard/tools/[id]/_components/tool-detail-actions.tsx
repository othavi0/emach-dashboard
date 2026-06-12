import { buttonVariants } from "@emach/ui/components/button";
import { PackagePlus, Pencil } from "lucide-react";
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
 * Ação contextual do header — a ação primária (coral) muda conforme a aba ativa,
 * seguindo o CRUD pattern canônico (ver `branches/[id]`). Na aba Estoque a
 * primária é "Ajustar estoque"; nas demais é "Editar". Remover é persistente.
 */
export function ToolDetailActions({
	tab,
	toolId,
	toolName,
	canMutate,
	canDelete,
}: ToolDetailActionsProps) {
	const isStockTab = tab === "estoque";

	return (
		<>
			{canDelete && <DeleteToolDialog toolId={toolId} toolName={toolName} />}

			{canMutate && (
				<Link
					className={buttonVariants({
						variant: isStockTab ? "outline" : "default",
						size: "sm",
					})}
					href={`/dashboard/tools/${toolId}/edit`}
				>
					<Pencil aria-hidden className="mr-1.5 size-3.5" />
					Editar
				</Link>
			)}

			{canMutate && isStockTab && (
				<Link
					className={buttonVariants({ variant: "default", size: "sm" })}
					href={`/dashboard/tools/${toolId}/stock`}
				>
					<PackagePlus aria-hidden className="mr-1.5 size-3.5" />
					Ajustar estoque
				</Link>
			)}
		</>
	);
}
