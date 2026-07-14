"use client";

import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@emach/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@emach/ui/components/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@emach/ui/components/sidebar";
import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/format/name";

export interface FooterUser {
	email: string;
	id: string;
	image?: string | null;
	name: string;
	role?: string | null;
}

export function getSidebarProfileHref(userId: string): string {
	return `/dashboard/users/${userId}`;
}

const ROLE_LABEL: Record<string, string> = {
	super_admin: "Super admin",
	admin: "Admin",
	user: "Usuário",
};

export function SidebarFooterUser({ user }: { user: FooterUser }) {
	const router = useRouter();
	const { state } = useSidebar();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	// Fecha o menu quando a sidebar expande — ajuste durante o render (padrão
	// "adjusting state when a prop changes"), sem effect.
	const [lastState, setLastState] = useState(state);
	if (lastState !== state) {
		setLastState(state);
		if (state === "expanded") {
			setMenuOpen(false);
		}
	}

	const handleSignOut = async () => {
		if (isSigningOut) {
			return;
		}
		setIsSigningOut(true);
		// Sem finally: React Compiler baila em try com finalizer.
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						router.replace("/login");
						router.refresh();
					},
				},
			});
			setIsSigningOut(false);
		} catch (err) {
			setIsSigningOut(false);
			throw err;
		}
	};

	const profileHref = getSidebarProfileHref(user.id);
	const roleLabel = user.role ? (ROLE_LABEL[user.role] ?? user.role) : null;

	const avatar = (
		<Avatar size="default">
			{user.image ? <AvatarImage alt="" src={user.image} /> : null}
			<AvatarFallback className="text-xs">
				{getInitials(user.name)}
			</AvatarFallback>
		</Avatar>
	);

	// Modo recolhido: sem espaço pros ícones inline — avatar abre menu pequeno.
	if (state === "collapsed") {
		return (
			<SidebarMenu>
				<SidebarMenuItem>
					<DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
						<DropdownMenuTrigger
							render={
								<SidebarMenuButton
									aria-label={`Conta de ${user.name}`}
									className="data-[state=open]:bg-sidebar-accent"
									size="lg"
									tooltip={user.name}
								>
									{avatar}
								</SidebarMenuButton>
							}
						/>
						<DropdownMenuContent
							align="start"
							className="shadow-xl ring-1 ring-foreground/25"
							side="right"
						>
							<DropdownMenuItem onClick={() => router.push(profileHref)}>
								<UserIcon className="size-4" />
								Perfil
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={isSigningOut}
								onClick={() => {
									handleSignOut().catch(() => undefined);
								}}
							>
								<LogOut className="size-4" />
								{isSigningOut ? "Saindo..." : "Sair"}
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</SidebarMenuItem>
			</SidebarMenu>
		);
	}

	// Expandido: barra de identidade com ações diretas (sem dropdown).
	return (
		<SidebarMenu>
			<SidebarMenuItem className="flex items-center gap-2 p-1">
				{avatar}
				<div className="grid min-w-0 flex-1 text-left leading-tight">
					<span className="truncate font-medium text-sm">{user.name}</span>
					{roleLabel ? (
						<span className="truncate font-semibold text-[10px] text-primary uppercase tracking-wide">
							{roleLabel}
						</span>
					) : (
						<span className="truncate text-muted-foreground text-xs">
							{user.email}
						</span>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<Link
						aria-label="Ver meu perfil"
						className="flex size-8 items-center justify-center rounded-md border border-sidebar-border text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
						href={profileHref}
					>
						<UserIcon aria-hidden className="size-4" />
					</Link>
					<button
						aria-label="Sair"
						className="flex size-8 items-center justify-center rounded-md border border-sidebar-border text-primary hover:bg-sidebar-accent disabled:opacity-50"
						disabled={isSigningOut}
						onClick={() => {
							handleSignOut().catch(() => undefined);
						}}
						type="button"
					>
						<LogOut aria-hidden className="size-4" />
					</button>
				</div>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
