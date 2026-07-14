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
import { useEffect, useState, useTransition } from "react";
import { notify } from "@/lib/notify";
import { linkUserToBranch } from "../../actions";
import { fetchAvailableBranchesForUserAction } from "../_lib/tab-actions";

interface Props {
	linkedBranchIds: string[];
	userId: string;
}

export function UserBranchLinkPanel({ userId, linkedBranchIds }: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [linking, startTransition] = useTransition();
	const [loading, setLoading] = useState(false);
	const [options, setOptions] = useState<{ id: string; name: string }[]>([]);

	// Loading síncrono durante o render (padrão "adjusting state when a prop
	// changes"); o effect abaixo fica só com o fetch das opções.
	const [lastKey, setLastKey] = useState({ linkedBranchIds, open, userId });
	if (
		lastKey.open !== open ||
		lastKey.userId !== userId ||
		lastKey.linkedBranchIds !== linkedBranchIds
	) {
		setLastKey({ linkedBranchIds, open, userId });
		if (open) {
			setLoading(true);
		}
	}

	useEffect(() => {
		if (!open) {
			return;
		}
		let active = true;
		fetchAvailableBranchesForUserAction(userId)
			.then((all) => {
				if (active) {
					setOptions(all.filter((b) => !linkedBranchIds.includes(b.id)));
				}
			})
			.catch(() => {
				if (active) {
					setOptions([]);
				}
			})
			.finally(() => {
				if (active) {
					setLoading(false);
				}
			});
		return () => {
			active = false;
		};
	}, [open, userId, linkedBranchIds]);

	function handleSelect(option: { id: string; name: string }) {
		startTransition(async () => {
			const res = await linkUserToBranch({ userId, branchId: option.id });
			if (res.ok) {
				notify.success("Filial vinculada");
				setOpen(false);
				router.refresh();
			} else {
				notify.error(res.error);
			}
		});
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				disabled={linking}
				render={
					<Button disabled={linking} size="sm" variant="outline">
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
						{loading && (
							<div className="flex items-center justify-center py-6">
								<Loader2
									aria-hidden
									className="size-4 animate-spin text-muted-foreground"
								/>
							</div>
						)}
						{!loading && options.length === 0 && (
							<CommandEmpty>Todas as filiais já vinculadas</CommandEmpty>
						)}
						{!loading &&
							options.length > 0 &&
							options.map((option) => (
								<CommandItem
									disabled={linking}
									key={option.id}
									onSelect={() => handleSelect(option)}
									value={option.name}
								>
									{option.name}
								</CommandItem>
							))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
