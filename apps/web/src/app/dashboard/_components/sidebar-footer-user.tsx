"use client";

import { Avatar, AvatarFallback } from "@emach/ui/components/avatar";
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
} from "@emach/ui/components/sidebar";
import { ChevronDown, ChevronUp, LogOut, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import { getInitials } from "@/lib/format/name";

export type FooterUser = { email: string; name: string; role?: string | null };

export function SidebarFooterUser({ user }: { user: FooterUser }) {
	const router = useRouter();
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);

	const handleSignOut = async () => {
		if (isSigningOut) {
			return;
		}
		setIsSigningOut(true);
		try {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						router.replace("/login");
						router.refresh();
					},
				},
			});
		} finally {
			setIsSigningOut(false);
		}
	};

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								className="data-[state=open]:bg-sidebar-accent"
								size="lg"
							>
								<Avatar className="rounded-md" size="default">
									<AvatarFallback className="rounded-md text-xs">
										{getInitials(user.name)}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-muted-foreground text-xs">
										{user.email}
									</span>
								</div>
								{menuOpen ? (
									<ChevronUp
										aria-hidden
										className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
									/>
								) : (
									<ChevronDown
										aria-hidden
										className="ml-auto size-4 group-data-[collapsible=icon]:hidden"
									/>
								)}
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent
						align="start"
						className="shadow-xl ring-1 ring-foreground/25"
						side="top"
					>
						<DropdownMenuItem
							onClick={() => {
								router.push("/dashboard/users");
							}}
						>
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
