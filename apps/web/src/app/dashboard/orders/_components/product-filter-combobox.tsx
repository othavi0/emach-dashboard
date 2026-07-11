"use client";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { Popover, PopoverContent } from "@emach/ui/components/popover";
import { ChevronsUpDown, X } from "lucide-react";
import { useState } from "react";

import { ComboboxTriggerButton } from "@/components/combobox-trigger-button";

interface ProductFilterComboboxProps {
	id?: string;
	onChange: (toolId: string | null) => void;
	options: { id: string; name: string }[];
	value: string | null;
}

export function ProductFilterCombobox({
	id,
	onChange,
	options,
	value,
}: ProductFilterComboboxProps) {
	const [open, setOpen] = useState(false);
	const selected = options.find((o) => o.id === value) ?? null;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<ComboboxTriggerButton id={id}>
				<span className={selected ? "truncate" : "text-muted-foreground"}>
					{selected ? selected.name : "Todos os produtos"}
				</span>
				{selected ? (
					<X
						className="size-3.5 shrink-0 opacity-70 hover:opacity-100"
						onClick={(e) => {
							e.stopPropagation();
							onChange(null);
						}}
					/>
				) : (
					<ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
				)}
			</ComboboxTriggerButton>
			<PopoverContent align="start" className="w-80 p-0">
				<Command>
					<CommandInput placeholder="Buscar produto…" />
					<CommandList>
						<CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
						<CommandGroup>
							{options.map((tool) => (
								<CommandItem
									data-checked={tool.id === value}
									key={tool.id}
									onSelect={() => {
										onChange(tool.id === value ? null : tool.id);
										setOpen(false);
									}}
									value={tool.name}
								>
									{tool.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
