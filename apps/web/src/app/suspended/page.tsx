import { Ban } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthStatusPanel } from "@/components/auth/auth-status-panel";
import { getCurrentSession, getUserStatus } from "@/lib/session";

export const metadata: Metadata = {
	description:
		"Estado de acesso suspenso para contas do dashboard administrativo da Emach Ferramentas.",
	robots: {
		follow: false,
		index: false,
	},
	title: "Acesso suspenso",
};

async function SuspendedRedirectGate() {
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
	return null;
}

export default function SuspendedPage() {
	return (
		<>
			<Suspense fallback={null}>
				<SuspendedRedirectGate />
			</Suspense>
			<AuthShell>
				<AuthStatusPanel
					description="Sua conta foi suspensa. Fale com seu administrador para mais informações."
					icon={<Ban aria-hidden className="size-5" />}
					title="Acesso suspenso"
					tone="destructive"
				/>
			</AuthShell>
		</>
	);
}
