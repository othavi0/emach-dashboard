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
import { Loader2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLazyTabReload } from "@/components/entity/lazy-tab";
import { notify } from "@/lib/notify";
import { linkUserToBranchAction, searchEligibleUsers } from "../../actions";

interface Props {
	branchId: string;
}

interface UserOption {
	email: string;
	id: string;
	name: string;
}

export function TeamLinkPanel({ branchId }: Props) {
	const router = useRouter();
	// NOTA: este painel é renderizado no header (BranchDetailActions), fora da
	// subárvore do LazyTab da aba "Equipe" — reloadTab() resolve pro no-op
	// default do Context aqui (irmão, não descendente, do LazyTab). Mantido por
	// consistência/forward-compat; router.refresh() abaixo é quem hoje atualiza
	// o badge de contagem (kpis.teamSize, eager); a lista lazy só reflete o
	// vínculo ao reabrir/retry a aba.
	const reloadTab = useLazyTabReload();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<UserOption[]>([]);
	const [searching, setSearching] = useState(false);
	const [linking, setLinking] = useState(false);

	useEffect(() => {
		const timer = setTimeout(async () => {
			setSearching(true);
			try {
				const data = await searchEligibleUsers(branchId, query);
				setResults(data);
			} catch {
				setResults([]);
			} finally {
				setSearching(false);
			}
		}, 250);
		return () => clearTimeout(timer);
	}, [query, branchId]);

	async function handleSelect(user: UserOption) {
		setLinking(true);
		try {
			const result = await linkUserToBranchAction({
				userId: user.id,
				branchId,
			});
			if (result.ok) {
				notify.success(`${user.name} vinculado à filial.`);
				setOpen(false);
				setQuery("");
				setResults([]);
				reloadTab();
				router.refresh();
			} else {
				notify.error(result.error);
			}
		} finally {
			setLinking(false);
		}
	}

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger
				disabled={linking}
				render={
					<Button size="sm" variant="outline">
						{linking ? (
							<Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
						) : (
							<UserPlus aria-hidden className="mr-1.5 size-3.5" />
						)}
						Vincular usuário
					</Button>
				}
			/>
			<PopoverContent align="start" className="w-80 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setQuery}
						placeholder="Buscar por nome ou email..."
						value={query}
					/>
					<CommandList>
						{searching && (
							<div className="flex items-center justify-center py-6">
								<Loader2
									aria-hidden
									className="size-4 animate-spin text-muted-foreground"
								/>
							</div>
						)}
						{!searching && results.length === 0 && (
							<CommandEmpty>
								{query.length === 0
									? "Digite para buscar usuários."
									: "Nenhum usuário encontrado."}
							</CommandEmpty>
						)}
						{!searching &&
							results.length > 0 &&
							results.map((user) => (
								<CommandItem
									key={user.id}
									onSelect={() => handleSelect(user)}
									value={user.id}
								>
									<div className="flex min-w-0 flex-col">
										<span className="truncate font-medium">{user.name}</span>
										<span className="truncate text-muted-foreground text-xs">
											{user.email}
										</span>
									</div>
								</CommandItem>
							))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
