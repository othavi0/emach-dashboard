"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes, Pencil } from "lucide-react";
import Link from "next/link";

import { DeleteToolDialog } from "./delete-tool-dialog";

interface ToolCardActionsProps {
	toolId: string;
	toolName: string;
}

export function ToolCardActions({ toolId, toolName }: ToolCardActionsProps) {
	return (
		<>
			<Link
				aria-label={`Gerenciar estoque de ${toolName}`}
				className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
				href={`/dashboard/tools/${toolId}/stock`}
			>
				<Boxes aria-hidden className="size-3.5" />
			</Link>
			<Link
				aria-label={`Editar ferramenta ${toolName}`}
				className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
				href={`/dashboard/tools/${toolId}/edit`}
			>
				<Pencil aria-hidden className="size-3.5" />
			</Link>
			<DeleteToolDialog toolId={toolId} toolName={toolName} />
		</>
	);
}
