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
import { ChevronsUpDown, LogOut, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export type FooterUser = { email: string; name: string; role?: string | null };

function initials(name: string): string {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((p) => p[0]?.toUpperCase() ?? "")
		.join("");
}

export function SidebarFooterUser({ user }: { user: FooterUser }) {
	const router = useRouter();
	const [isSigningOut, setIsSigningOut] = useState(false);

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
				<DropdownMenu>
					<DropdownMenuTrigger
						render={
							<SidebarMenuButton
								size="lg"
								className="data-[state=open]:bg-sidebar-accent"
							>
								<Avatar className="rounded-md" size="default">
									<AvatarFallback className="rounded-md text-xs">
										{initials(user.name)}
									</AvatarFallback>
								</Avatar>
								<div className="grid flex-1 text-left text-sm leading-tight">
									<span className="truncate font-medium">{user.name}</span>
									<span className="truncate text-muted-foreground text-xs">
										{user.email}
									</span>
								</div>
								<ChevronsUpDown className="ml-auto size-4" aria-hidden />
							</SidebarMenuButton>
						}
					/>
					<DropdownMenuContent side="top" align="start" className="w-56">
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
