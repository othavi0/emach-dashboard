"use client";

import { Button } from "@emach/ui/components/button";
import { CheckSquareIcon, XIcon } from "lucide-react";

interface SelectionToolbarProps {
	active: boolean;
	allLoadedSelected: boolean;
	loadedCount: number;
	onCancel: () => void;
	onEnter: () => void;
	/** Já resolvido pelo caller: selecionar todos os carregados ou limpar. */
	onToggleAll: () => void;
}

/** Controles do modo de seleção, posicionados acima do grid. */
export function SelectionToolbar({
	active,
	allLoadedSelected,
	loadedCount,
	onCancel,
	onEnter,
	onToggleAll,
}: SelectionToolbarProps) {
	if (!active) {
		return (
			<Button onClick={onEnter} size="sm" variant="outline">
				<CheckSquareIcon aria-hidden className="size-4" />
				Selecionar
			</Button>
		);
	}
	return (
		<div className="flex items-center gap-2">
			<Button onClick={onToggleAll} size="sm" variant="secondary">
				{allLoadedSelected
					? "Desmarcar todos"
					: `Selecionar todos (${loadedCount})`}
			</Button>
			<Button onClick={onCancel} size="sm" variant="ghost">
				<XIcon aria-hidden className="size-4" />
				Cancelar
			</Button>
		</div>
	);
}
