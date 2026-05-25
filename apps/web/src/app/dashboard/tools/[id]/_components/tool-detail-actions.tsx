"use client";

import { Button, buttonVariants } from "@emach/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { Copy, EyeOff, PackagePlus, Pencil, StopCircle } from "lucide-react";
import Link from "next/link";

import { DeleteToolDialog } from "../../_components/delete-tool-dialog";

interface ToolDetailActionsProps {
	canDelete: boolean;
	canMutate: boolean;
	toolId: string;
	toolName: string;
}

export function ToolDetailActions({
	toolId,
	toolName,
	canMutate,
	canDelete,
}: ToolDetailActionsProps) {
	return (
		<TooltipProvider delay={300}>
			<div className="flex items-center gap-1.5">
				<DisabledIconButton icon={Copy} label="Duplicar (em breve)" />
				<DisabledIconButton icon={EyeOff} label="Ocultar do site (em breve)" />
				<DisabledIconButton
					icon={StopCircle}
					label="Marcar descontinuada (em breve)"
				/>

				{canDelete && <DeleteToolDialog toolId={toolId} toolName={toolName} />}

				<div className="mx-2 h-6 w-px bg-border" />

				{canMutate && (
					<Link
						className={buttonVariants({ variant: "outline", size: "sm" })}
						href={`/dashboard/tools/${toolId}/edit`}
					>
						<Pencil className="mr-1.5 size-3.5" />
						Editar
					</Link>
				)}

				{canMutate && (
					<Link
						className={buttonVariants({ variant: "default", size: "sm" })}
						href={`/dashboard/tools/${toolId}/stock`}
					>
						<PackagePlus className="mr-1.5 size-3.5" />
						Ajustar estoque
					</Link>
				)}
			</div>
		</TooltipProvider>
	);
}

interface DisabledIconButtonProps {
	icon: typeof Copy;
	label: string;
}

function DisabledIconButton({ icon: Icon, label }: DisabledIconButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						aria-label={label}
						className="text-muted-foreground"
						disabled
						size="sm"
						variant="outline"
					/>
				}
			>
				<Icon className="size-3.5" />
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}
