"use client";

import { Button } from "@emach/ui/components/button";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useTransition } from "react";

import { authClient } from "@/lib/auth-client";

type Tone = "warning" | "destructive";

const TONE_CLASS: Record<Tone, string> = {
	warning: "bg-warning/15 text-warning",
	destructive: "bg-destructive/15 text-destructive",
};

export function AuthStatusPanel({
	description,
	icon,
	title,
	tone,
}: {
	description: string;
	icon: ReactNode;
	title: string;
	tone: Tone;
}) {
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
		<div>
			<div
				className={`flex size-11 items-center justify-center rounded-[11px] ${TONE_CLASS[tone]}`}
			>
				{icon}
			</div>
			<h1 className="mt-4 font-medium font-serif text-3xl uppercase tracking-[0.015em]">
				{title}
			</h1>
			<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
				{description}
			</p>
			<Button
				className="mt-6"
				disabled={isSigningOut}
				onClick={handleSignOut}
				variant="outline"
			>
				{isSigningOut ? "Saindo..." : "Sair"}
			</Button>
		</div>
	);
}
