"use client";

import {
	Command,
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
import type { SearchResults } from "../_lib/global-search";
import { globalSearch } from "../search-actions";
import { NAV_GROUPS } from "./nav-config";

const EMPTY: SearchResults = {
	tools: [],
	orders: [],
	clients: [],
	variants: [],
};

export function CommandPalette({
	open,
	onOpenChange,
	canManageUsers,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	canManageUsers: boolean;
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
		let active = true;
		const id = setTimeout(() => {
			startTransition(async () => {
				const res = await globalSearch(query);
				// Ignora resposta de uma query que já foi substituída por outra mais recente.
				if (active && res.ok) {
					setResults(res.data);
				}
			});
		}, 250);
		return () => {
			active = false;
			clearTimeout(id);
		};
	}, [query]);

	const setOpen = (next: boolean) => {
		if (!next) {
			setQuery("");
		}
		onOpenChange(next);
	};

	const go = (href: string) => {
		setOpen(false);
		router.push(href);
	};

	const trimmed = query.trim().toLowerCase();
	const navItems = NAV_GROUPS.flatMap((g) => g.items).filter(
		(i) => !i.disabled && (!i.requiresManageUsers || canManageUsers)
	);
	const visibleNav = trimmed
		? navItems.filter((i) => i.label.toLowerCase().includes(trimmed))
		: navItems;
	const allHits = [
		...results.variants,
		...results.tools,
		...results.orders,
		...results.clients,
	];
	const isEmpty = visibleNav.length === 0 && allHits.length === 0;

	return (
		<>
			<SidebarMenuButton
				className="text-muted-foreground"
				onClick={() => onOpenChange(true)}
			>
				<Search aria-hidden className="size-4" />
				<span>Buscar…</span>
				<kbd className="ml-auto text-[10px] group-data-[collapsible=icon]:hidden">
					⌘K
				</kbd>
			</SidebarMenuButton>

			<CommandDialog onOpenChange={setOpen} open={open}>
				<Command shouldFilter={false}>
					<CommandInput
						onValueChange={setQuery}
						placeholder="Buscar rotas, ferramentas, pedidos, clientes…"
						value={query}
					/>
					<CommandList>
						{isEmpty && <CommandEmpty>Nada encontrado.</CommandEmpty>}
						{visibleNav.length > 0 && (
							<CommandGroup heading="Navegação">
								{visibleNav.map((item) => (
									<CommandItem key={item.href} onSelect={() => go(item.href)}>
										<item.icon aria-hidden className="size-4" />
										{item.label}
									</CommandItem>
								))}
							</CommandGroup>
						)}
						{allHits.length > 0 && (
							<CommandGroup heading="Resultados">
								{allHits.map((hit) => (
									<CommandItem
										key={
											hit.variantId
												? `variant-${hit.variantId}`
												: `${hit.group}-${hit.id}`
										}
										onSelect={() => go(hit.href)}
									>
										<span>{hit.label}</span>
										{hit.sublabel && (
											<span className="ml-2 text-muted-foreground text-xs">
												{hit.sublabel}
											</span>
										)}
										<span className="ml-auto text-[10px] text-muted-foreground">
											{hit.group}
										</span>
									</CommandItem>
								))}
							</CommandGroup>
						)}
					</CommandList>
				</Command>
			</CommandDialog>
		</>
	);
}
