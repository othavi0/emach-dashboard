"use client";

import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@emach/ui/components/command";
import { SidebarMenuButton } from "@emach/ui/components/sidebar";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { globalSearch } from "../search-actions";
import type { SearchResults } from "../_lib/global-search";
import { NAV_GROUPS } from "./nav-config";

const EMPTY: SearchResults = { tools: [], orders: [], clients: [] };

export function CommandPalette({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResults>(EMPTY);
	const [, startTransition] = useTransition();

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				onOpenChange(true);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onOpenChange]);

	useEffect(() => {
		if (query.trim().length < 2) {
			setResults(EMPTY);
			return;
		}
		const id = setTimeout(() => {
			startTransition(async () => {
				const res = await globalSearch(query);
				if (res.ok) {
					setResults(res.data);
				}
			});
		}, 250);
		return () => clearTimeout(id);
	}, [query]);

	const go = (href: string) => {
		onOpenChange(false);
		setQuery("");
		router.push(href);
	};

	const allHits = [...results.tools, ...results.orders, ...results.clients];

	return (
		<>
			<SidebarMenuButton
				onClick={() => onOpenChange(true)}
				className="text-muted-foreground"
			>
				<Search className="size-4" aria-hidden />
				<span>Buscar…</span>
				<kbd className="ml-auto text-[10px] group-data-[collapsible=icon]:hidden">
					⌘K
				</kbd>
			</SidebarMenuButton>

			<CommandDialog open={open} onOpenChange={onOpenChange}>
				<CommandInput
					placeholder="Buscar rotas, ferramentas, pedidos, clientes…"
					value={query}
					onValueChange={setQuery}
				/>
				<CommandList>
					<CommandEmpty>Nada encontrado.</CommandEmpty>
					<CommandGroup heading="Navegação">
						{NAV_GROUPS.flatMap((g) => g.items)
							.filter((i) => !i.disabled)
							.map((item) => (
								<CommandItem key={item.href} onSelect={() => go(item.href)}>
									<item.icon className="size-4" aria-hidden />
									{item.label}
								</CommandItem>
							))}
					</CommandGroup>
					{allHits.length > 0 && (
						<CommandGroup heading="Resultados">
							{allHits.map((hit) => (
								<CommandItem
									key={`${hit.group}-${hit.id}`}
									onSelect={() => go(hit.href)}
								>
									<span>{hit.label}</span>
									{hit.sublabel && (
										<span className="ml-2 text-muted-foreground text-xs">
											{hit.sublabel}
										</span>
									)}
									<span className="ml-auto text-muted-foreground text-[10px]">
										{hit.group}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
