import { redirect } from "next/navigation";

import { StatusCard } from "@/app/pending/_components/status-card";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export default async function SuspendedPage() {
	const session = await getCurrentSession();
	if (!session?.user) {
		redirect("/login");
	}
	const status = getUserStatus(session);
	if (status === "active") {
		redirect("/dashboard");
	}
	if (status === "pending") {
		redirect("/pending");
	}

	return (
		<StatusCard
			description="Sua conta foi suspensa. Fale com seu administrador para mais informações."
			icon="🚫"
			title="Acesso suspenso"
		/>
	);
}
