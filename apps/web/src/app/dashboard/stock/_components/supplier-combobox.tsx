"use client";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";
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
			<PopoverTrigger
				aria-invalid={ariaInvalid}
				className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
				disabled={disabled}
				id={id}
				render={<button type="button" />}
			>
				<span
					className={selected ? "text-foreground" : "text-muted-foreground"}
				>
					{selected ? selected.name : "Selecione o fornecedor"}
				</span>
				<ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
			</PopoverTrigger>
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
