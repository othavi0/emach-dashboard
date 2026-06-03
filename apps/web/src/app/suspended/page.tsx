import { Ban } from "lucide-react";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStatusPanel } from "@/components/auth/auth-status-panel";
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
		<AuthShell>
			<AuthStatusPanel
				description="Sua conta foi suspensa. Fale com seu administrador para mais informações."
				icon={<Ban aria-hidden className="size-5" />}
				title="Acesso suspenso"
				tone="destructive"
			/>
		</AuthShell>
	);
}
