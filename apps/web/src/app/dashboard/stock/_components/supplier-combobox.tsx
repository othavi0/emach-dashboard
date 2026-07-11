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
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { ComboboxTriggerButton } from "@/components/combobox-trigger-button";
import type { ActiveSupplierOption } from "@/lib/suppliers";

// Picker de fornecedor com busca (Popover + Command) — fornecedor pode ser muitos;
// CommandList já traz altura máxima + scroll. Single-select (fecha ao escolher).
export function SupplierCombobox({
	suppliers,
	value,
	onChange,
	disabled,
	id,
	ariaInvalid,
}: {
	ariaInvalid?: boolean;
	disabled?: boolean;
	id?: string;
	onChange: (id: string) => void;
	suppliers: ActiveSupplierOption[];
	value: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = suppliers.find((s) => s.id === value);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<ComboboxTriggerButton
				aria-invalid={ariaInvalid}
				disabled={disabled}
				id={id}
			>
				<span
					className={selected ? "text-foreground" : "text-muted-foreground"}
				>
					{selected ? selected.name : "Selecione o fornecedor"}
				</span>
				<ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
			</ComboboxTriggerButton>
			<PopoverContent align="start" className="w-(--anchor-width) p-0">
				<Command>
					<CommandInput placeholder="Buscar fornecedor…" />
					<CommandList>
						<CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
						<CommandGroup>
							{suppliers.map((s) => (
								<CommandItem
									data-checked={s.id === value}
									key={s.id}
									onSelect={() => {
										onChange(s.id);
										setOpen(false);
									}}
									value={s.name}
								>
									{s.name}
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
