"use client";

import { Button } from "@emach/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@emach/ui/components/card";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "@/lib/auth-client";

interface StatusCardProps {
	description: string;
	icon: string;
	title: string;
}

export function StatusCard({ icon, title, description }: StatusCardProps) {
	const router = useRouter();
	const [isSigningOut, startSignOut] = useTransition();

	function handleSignOut() {
		startSignOut(async () => {
			await authClient.signOut({
				fetchOptions: {
					onSuccess: () => {
						router.replace("/login");
						router.refresh();
					},
				},
			});
		});
	}

	return (
		<Card className="w-full max-w-md text-center">
			<CardHeader className="items-center gap-3">
				<div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning text-2xl text-warning-foreground">
					{icon}
				</div>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					disabled={isSigningOut}
					onClick={handleSignOut}
					variant="outline"
				>
					{isSigningOut ? "Saindo..." : "Sair"}
				</Button>
			</CardContent>
		</Card>
	);
}
