import { redirect } from "next/navigation";

import { getCurrentSession, getUserStatus } from "@/lib/session";
import { StatusCard } from "./_components/status-card";

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
		<StatusCard
			description="Um administrador vai revisar seu cadastro em breve. Você terá acesso após a aprovação."
			icon="⏳"
			title="Conta aguardando aprovação"
		/>
	);
}
