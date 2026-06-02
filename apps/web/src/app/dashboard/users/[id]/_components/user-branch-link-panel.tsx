"use client";

import { Button } from "@emach/ui/components/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@emach/ui/components/popover";
import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkUserToBranch } from "../../actions";

interface Props {
	options: { id: string; name: string }[];
	userId: string;
}

export function UserBranchLinkPanel({ userId, options }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [linking, startTransition] = useTransition();

	function handleSelect(option: { id: string; name: string }) {
		startTransition(async () => {
			const res = await linkUserToBranch({ userId, branchId: option.id });
			if (res.ok) {
				toast.success("Filial vinculada");
				setOpen(false);
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				disabled={options.length === 0 || linking}
				render={
					<Button
						disabled={options.length === 0 || linking}
						size="sm"
						variant="outline"
					>
						{linking ? (
							<Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
						) : (
							<Plus aria-hidden className="mr-1.5 size-3.5" />
						)}
						Vincular filial
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-72 p-0">
				<Command>
					<CommandInput placeholder="Buscar filial..." />
					<CommandList>
						{options.length === 0 ? (
							<CommandEmpty>Todas as filiais já vinculadas</CommandEmpty>
						) : (
							options.map((option) => (
								<CommandItem
									disabled={linking}
									key={option.id}
									onSelect={() => handleSelect(option)}
									value={option.name}
								>
									{option.name}
								</CommandItem>
							))
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
