import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStatusPanel } from "@/components/auth/auth-status-panel";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Acompanhe o status de aprovação da sua conta no dashboard administrativo da Emach Ferramentas.",
	robots: {
		follow: false,
		index: false,
	},
	title: "Conta em aprovação",
};

export default async function PendingPage() {
	const session = await getCurrentSession();
	if (!session?.user) {
		redirect("/login");
	}
	const status = getUserStatus(session);
	if (status === "active") {
		redirect("/dashboard");
	}
	if (status === "suspended") {
		redirect("/suspended");
	}

	return (
		<AuthShell>
			<AuthStatusPanel
				description="Um administrador vai revisar seu cadastro. Você terá acesso após a aprovação."
				icon={<Clock aria-hidden className="size-5" />}
				title="Conta aguardando aprovação"
				tone="warning"
			/>
		</AuthShell>
	);
}
