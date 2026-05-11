"use client";

import { buttonVariants } from "@emach/ui/components/button";
import { Boxes } from "lucide-react";
import Link from "next/link";

interface StockCardActionsProps {
	toolId: string;
	toolName: string;
}

export function StockCardActions({ toolId, toolName }: StockCardActionsProps) {
	return (
		<Link
			aria-label={`Gerenciar estoque de ${toolName}`}
			className={buttonVariants({ size: "icon-sm", variant: "secondary" })}
			href={`/dashboard/tools/${toolId}/stock`}
		>
			<Boxes aria-hidden className="size-3.5" />
		</Link>
	);
}
