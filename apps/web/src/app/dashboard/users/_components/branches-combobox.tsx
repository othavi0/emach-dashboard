"use client";

import { Badge } from "@emach/ui/components/badge";
import { Button } from "@emach/ui/components/button";
import { Checkbox } from "@emach/ui/components/checkbox";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";

import type { BranchLite } from "./types";

interface Props {
	branches: BranchLite[];
	disabled?: boolean;
	onChange: (next: string[]) => void;
	value: string[];
}

export function BranchesCombobox({
	branches,
	value,
	onChange,
	disabled,
}: Props) {
	function toggle(id: string) {
		if (value.includes(id)) {
			onChange(value.filter((v) => v !== id));
		} else {
			onChange([...value, id]);
		}
	}

	return (
		<div className="flex flex-col gap-2">
			<div className="flex flex-wrap gap-2">
				{value.length === 0 && (
					<span className="text-muted-foreground text-xs">Nenhuma filial</span>
				)}
				{value.map((id) => {
					const b = branches.find((br) => br.id === id);
					return (
						<Badge key={id} variant="default">
							{b?.name ?? id}
						</Badge>
					);
				})}
			</div>
			<Popover>
				<PopoverTrigger
					disabled={disabled}
					render={
						<Button size="sm" variant="outline">
							+ Filial
						</Button>
					}
				/>
				<PopoverContent className="w-64 p-2">
					<div className="flex flex-col gap-1">
						{branches.map((b) => (
							<button
								className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-left hover:bg-accent"
								key={b.id}
								onClick={() => toggle(b.id)}
								type="button"
							>
								<Checkbox
									checked={value.includes(b.id)}
									onCheckedChange={() => toggle(b.id)}
								/>
								<span className="text-sm">{b.name}</span>
							</button>
						))}
					</div>
				</PopoverContent>
			</Popover>
		</div>
	);
}
