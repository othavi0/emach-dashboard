"use client";

import { Button } from "@emach/ui/components/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@emach/ui/components/tooltip";
import { cn } from "@emach/ui/lib/utils";
import { FunnelXIcon } from "lucide-react";

interface ClearFiltersButtonProps {
	className?: string;
	onClear?: () => void;
}

/**
 * Ícone de limpar filtros — padrão único do sistema (spec 2026-07-11).
 * O caller só renderiza quando há filtro ativo; sem filtro, nada ocupa espaço.
 */
export function ClearFiltersButton({
	className,
	onClear,
}: ClearFiltersButtonProps) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						aria-label="Limpar filtros"
						className={cn(
							"fade-in animate-in border-border bg-muted duration-200",
							className
						)}
						onClick={onClear}
						size="icon"
						type="button"
						variant="ghost"
					>
						<FunnelXIcon />
					</Button>
				}
			/>
			<TooltipContent>Limpar filtros</TooltipContent>
		</Tooltip>
	);
}
